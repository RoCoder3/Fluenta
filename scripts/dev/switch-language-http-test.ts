/**
 * Drives language switching over real HTTP, against a production build.
 *
 * The smoke test proves the *engines* isolate languages. This proves the
 * *routing* does: that an unonboarded language actually bounces you to
 * onboarding, that a finished one lets you straight in, and that each page
 * renders the right language's content. Those decisions live in layouts and
 * redirects, which no engine-level test touches.
 *
 * Structured as discrete steps because the local Postgres stand-in
 * (pglite-socket) safely serves one client at a time, so a step that writes to
 * the database cannot run while the app server is up. The driver script starts
 * and stops the server between them:
 *
 *     scripts/dev/switch-language-test.sh
 *
 * Steps: setup | assert-german | switch-ca | assert-needs-onboarding |
 *        finish-ca | assert-catalan | switch-de | assert-german-restored
 */

import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

import * as schema from '../../src/server/db/schema'

const STATE_FILE = process.env.SWITCH_TEST_STATE ?? '/tmp/fluenta-switch-test.json'
const BASE = process.env.SWITCH_TEST_BASE ?? 'http://127.0.0.1:3100'
const step = process.argv[2] ?? ''

type State = { userId: string; token: string }

const readState = (): State => JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const writeState = (s: State) => writeFileSync(STATE_FILE, JSON.stringify(s))

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function get(path: string) {
  const { token } = readState()
  return fetch(`${BASE}${path}`, {
    headers: { cookie: `lt_session=${token}` },
    redirect: 'manual',
  })
}

const redirectsTo = (r: Response, to: string) =>
  (r.status === 307 || r.status === 302) && (r.headers.get('location') ?? '').includes(to)

/* -------------------------------------------------------------------------- */
/* Database steps — run only while the app server is stopped                  */
/* -------------------------------------------------------------------------- */

async function setup() {
  const { getDb } = await import('../../src/server/db')
  const { hashPassword } = await import('../../src/server/auth')
  const db = await getDb()

  const [user] = await db
    .insert(schema.users)
    .values({
      email: `switch-${Date.now()}@example.test`,
      passwordHash: await hashPassword('correct-horse-battery'),
      name: 'Switch Tester',
      onboardingCompletedAt: new Date(),
      activeTargetLanguageCode: 'de',
    })
    .returning()
  if (!user) throw new Error('failed to create user')

  await db.insert(schema.learnerProfiles).values({
    userId: user.id,
    nativeLanguageCode: 'en',
    targetLanguageCode: 'de',
    explanationLanguageCode: 'en',
    estimatedLevel: 'B1',
    onboardingCompletedAt: new Date(),
  })
  await db.insert(schema.lifeAreas).values({
    userId: user.id,
    targetLanguageCode: 'de',
    key: 'bureaucracy',
    name: 'Bureaucracy',
    priority: 1,
    readiness: 37,
  })

  const token = randomBytes(32).toString('base64url')
  await db.insert(schema.authSessions).values({
    userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 86_400_000),
  })

  writeState({ userId: user.id, token })
  console.log(`  · established a German learner (${user.id.slice(0, 8)})`)
}

async function switchTo(code: string) {
  const { setActiveLanguage } = await import('../../src/server/learner/language')
  await setActiveLanguage(readState().userId, code)
  console.log(`  · active language set to "${code}"`)
}

async function finishCatalan() {
  const { getDb } = await import('../../src/server/db')
  const db = await getDb()
  const { userId } = readState()

  await db.insert(schema.learnerProfiles).values({
    userId,
    nativeLanguageCode: 'en',
    targetLanguageCode: 'ca',
    explanationLanguageCode: 'en',
    estimatedLevel: 'A1',
    onboardingCompletedAt: new Date(),
  })
  await db.insert(schema.lifeAreas).values({
    userId,
    targetLanguageCode: 'ca',
    key: 'social',
    name: 'Social life',
    priority: 1,
    readiness: 4,
  })
  console.log('  · Catalan onboarding completed')
}

/* -------------------------------------------------------------------------- */
/* HTTP steps — run only while the app server is up                           */
/* -------------------------------------------------------------------------- */

async function assertGerman(label: string) {
  console.log(`\n${label}`)
  const home = await get('/home')
  check(`/home renders (${home.status})`, home.status === 200)
  const html = await home.text()

  check('the language switcher is present', html.includes('Learning'))
  check('German is offered', /German/.test(html))
  check('Catalan is offered', /Catalan/.test(html))
  check('German life area is shown', /Bureaucracy/.test(html))
  check('Catalan life area is not shown', !/Social life/.test(html))
}

async function assertNeedsOnboarding() {
  console.log('\n2. Switched to Catalan, never studied')

  const home = await get('/home')
  check(
    `/home redirects to onboarding (${home.status} → ${home.headers.get('location') ?? '—'})`,
    redirectsTo(home, '/onboarding'),
  )

  for (const path of ['/learn', '/practice', '/phrasebook', '/progress', '/missions', '/tutor']) {
    const r = await get(path)
    check(`${path} is gated too (${r.status})`, redirectsTo(r, '/onboarding'))
  }

  const onboarding = await get('/onboarding')
  check(`/onboarding renders (${onboarding.status})`, onboarding.status === 200)
  const html = await onboarding.text()

  check(
    'it knows this is an additional language',
    /Let(&#x27;|')s set up Catalan/.test(html),
    'expected the additional-language heading',
  )
  check('it says the other language is safe', /untouched and waiting/.test(html))
  check(
    'it does not greet them like a new account',
    !/Hello, Switch Tester/.test(html),
    'expected the additional-language heading, not the first-run greeting',
  )
  check(
    'it explains that progress is kept per language',
    /Progress in\s+each is kept separately|kept separately/.test(html),
  )

  /*
   * The intake placeholder is deliberately not asserted here. It lives in the
   * step-2 branch, which React has not rendered yet — only step 1 is in the
   * server HTML — so it ships inside a client chunk rather than the document.
   * The heading and subtitle above are the server-rendered evidence that the
   * flow knows which language it is setting up.
   */
}

async function assertCatalan() {
  console.log('\n3. Catalan set up')

  const home = await get('/home')
  check(`/home renders (${home.status})`, home.status === 200)
  const html = await home.text()

  check('Catalan life area is shown', /Social life/.test(html))
  check('German life area is gone', !/Bureaucracy/.test(html))

  const phrasebook = await get('/phrasebook')
  check(`/phrasebook renders (${phrasebook.status})`, phrasebook.status === 200)
  const phrasebookHtml = await phrasebook.text()
  check(
    'no German phrases while studying Catalan',
    !/Ich möchte einen Termin/.test(phrasebookHtml),
  )

  const learn = await get('/learn')
  check(`/learn renders (${learn.status})`, learn.status === 200)
}

/* -------------------------------------------------------------------------- */

async function main() {
  switch (step) {
    case 'setup':
      await setup()
      break
    case 'switch-ca':
      await switchTo('ca')
      break
    case 'switch-de':
      await switchTo('de')
      break
    case 'finish-ca':
      await finishCatalan()
      break
    case 'assert-german':
      await assertGerman('1. Established German learner')
      break
    case 'assert-needs-onboarding':
      await assertNeedsOnboarding()
      break
    case 'assert-catalan':
      await assertCatalan()
      break
    case 'assert-german-restored':
      await assertGerman('4. Switched back to German — nothing lost')
      break
    default:
      console.error(`Unknown step "${step}". See the header comment for the list.`)
      process.exit(2)
  }

  if (passed || failed) console.log(`  (${passed} passed, ${failed} failed)`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('\n✗ crashed:', error)
  process.exit(1)
})
