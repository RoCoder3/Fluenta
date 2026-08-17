/**
 * Proves migration 0001 survives a database that already has a learner in it.
 *
 * Running migrations against an empty database proves almost nothing here: the
 * risky parts of 0001 are the backfill and the primary-key swap, and both are
 * no-ops when there are no rows. Production has a real learner with real
 * progress, so this replays that shape:
 *
 *   apply 0000 → insert a German learner with progress → apply 0001 → verify
 *
 * Verifies the three things that would silently corrupt data if wrong:
 *   1. Every backfilled row got the language its owner was actually studying.
 *   2. Onboarding completion moved from the account to the enrollment.
 *   3. The learner is left pointing at their language, not at nothing.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql } from 'drizzle-orm'

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

/** A migrations folder containing only the first N migrations. */
function partialMigrationsFolder(count: number): string {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'))
  const entries = journal.entries.slice(0, count)

  const dir = mkdtempSync(join(tmpdir(), 'fluenta-mig-'))
  mkdirSync(join(dir, 'meta'), { recursive: true })
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }, null, 2),
  )
  for (const entry of entries) {
    writeFileSync(join(dir, `${entry.tag}.sql`), readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'))
  }
  return dir
}

async function main() {
  console.log('Migration upgrade test (0000 → data → 0001)\n' + '='.repeat(60))

  const dataDir = mkdtempSync(join(tmpdir(), 'fluenta-pg-'))
  const client = new PGlite(dataDir)
  const db = drizzle(client)

  /* ------------------------------------------- 1. the pre-upgrade database */
  console.log('\n1. Apply 0000 and populate it like the live database')

  const oldFolder = partialMigrationsFolder(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: oldFolder })
  check('migration 0000 applied', true)

  await db.execute(sql`
    insert into languages (code, name, native_name, speech_tag, is_target, is_explanation, variants)
    values ('de', 'German', 'Deutsch', 'de-DE', true, true, '["DE","AT","CH"]'::jsonb),
           ('en', 'English', 'English', 'en-GB', false, true, '["GB","US"]'::jsonb)
  `)

  const onboardedAt = '2026-07-01T10:00:00Z'
  await db.execute(sql`
    insert into users (id, email, name, onboarding_completed_at)
    values ('u-real', 'real@example.test', 'Real Learner', ${onboardedAt}::timestamptz),
           ('u-fresh', 'fresh@example.test', 'Never Onboarded', null)
  `)

  await db.execute(sql`
    insert into learner_profiles (user_id, native_language_code, target_language_code, explanation_language_code, estimated_level)
    values ('u-real', 'en', 'de', 'en', 'B1')
  `)

  await db.execute(sql`
    insert into phrases (id, language_code, translation_language_code, text, normalized, translation, context)
    values ('p-1', 'de', 'en', 'Ich möchte einen Termin vereinbaren.', 'ich möchte einen termin vereinbaren', 'I would like to make an appointment.', 'On the phone.')
  `)

  await db.execute(sql`
    insert into life_areas (id, user_id, key, name, priority, readiness)
    values ('la-1', 'u-real', 'work', 'Work', 1, 42.5)
  `)
  await db.execute(sql`
    insert into user_phrases (id, user_id, phrase_id, mastery, status)
    values ('up-1', 'u-real', 'p-1', 67, 'review')
  `)
  await db.execute(sql`
    insert into skills (id, user_id, category, score, confidence)
    values ('sk-1', 'u-real', 'speaking', 31, 0.4)
  `)
  await db.execute(sql`
    insert into learner_errors (id, user_id, type, category, label, explanation)
    values ('le-1', 'u-real', 'dative_accusative', 'grammar', 'Dative vs accusative', 'Mixing the two cases.')
  `)
  await db.execute(sql`
    insert into missions (id, user_id, title, description, tier)
    values ('mi-1', 'u-real', 'Order a coffee', 'Do the whole exchange in German.', 'beginner')
  `)
  await db.execute(sql`
    insert into roadmaps (id, user_id, life_area_id, title)
    values ('rm-1', 'u-real', 'la-1', 'Work — road to functional fluency')
  `)
  check('pre-upgrade data inserted', true)

  /* ------------------------------------------------------- 2. the upgrade */
  console.log('\n2. Apply 0001 on top of it')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: './drizzle' })
  check('migration 0001 applied without error', true)

  /* ------------------------------------------------------ 3. verify state */
  console.log('\n3. Verify the backfill')

  const rows = async (q: ReturnType<typeof sql>) =>
    ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows

  for (const table of ['life_areas', 'user_phrases', 'skills', 'learner_errors', 'missions', 'roadmaps']) {
    const r = await rows(sql`select target_language_code from ${sql.identifier(table)} where user_id = 'u-real'`)
    check(
      `${table} backfilled to 'de'`,
      r.length === 1 && r[0]?.target_language_code === 'de',
      `got ${JSON.stringify(r)}`,
    )
  }

  const nulls = await rows(sql`
    select count(*)::int as n from (
      select target_language_code from life_areas
      union all select target_language_code from user_phrases
      union all select target_language_code from skills
      union all select target_language_code from learner_errors
      union all select target_language_code from missions
      union all select target_language_code from roadmaps
    ) t where target_language_code is null
  `)
  check('no NULL language codes anywhere', Number(nulls[0]?.n) === 0)

  const activeReal = await rows(sql`select active_target_language_code from users where id = 'u-real'`)
  check(
    'existing learner points at German',
    activeReal[0]?.active_target_language_code === 'de',
    `got ${JSON.stringify(activeReal)}`,
  )

  const activeFresh = await rows(sql`select active_target_language_code from users where id = 'u-fresh'`)
  check(
    'learner with no profile falls back to German rather than NULL',
    activeFresh[0]?.active_target_language_code === 'de',
  )

  const profile = await rows(sql`select onboarding_completed_at from learner_profiles where user_id = 'u-real'`)
  check(
    'onboarding completion copied onto the enrollment',
    profile[0]?.onboarding_completed_at !== null && profile[0]?.onboarding_completed_at !== undefined,
    `got ${JSON.stringify(profile)}`,
  )

  console.log('\n4. Verify the primary key actually changed')

  const pk = await rows(sql`
    select a.attname
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'learner_profiles'::regclass and i.indisprimary
    order by a.attname
  `)
  const pkCols = pk.map((r) => r.attname).sort()
  check(
    `learner_profiles keyed by (user_id, target_language_code) — got (${pkCols.join(', ')})`,
    pkCols.length === 2 && pkCols.includes('user_id') && pkCols.includes('target_language_code'),
  )

  // The point of the whole migration: a second enrollment must now be possible.
  await db.execute(sql`
    insert into languages (code, name, native_name, speech_tag, is_target, is_explanation, variants)
    values ('ca', 'Catalan', 'Català', 'ca-ES', true, false, '["ES-CT"]'::jsonb)
  `)
  let secondEnrollmentWorked = true
  try {
    await db.execute(sql`
      insert into learner_profiles (user_id, native_language_code, target_language_code, explanation_language_code)
      values ('u-real', 'en', 'ca', 'en')
    `)
  } catch {
    secondEnrollmentWorked = false
  }
  check('the same learner can now enroll in a second language', secondEnrollmentWorked)

  const preserved = await rows(sql`select readiness from life_areas where id = 'la-1'`)
  check('existing German progress untouched', Number(preserved[0]?.readiness) === 42.5)

  await client.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(oldFolder, { recursive: true, force: true })

  console.log('\n' + '='.repeat(60))
  console.log(`${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('\n✗ migration upgrade test crashed:', error)
  process.exit(1)
})
