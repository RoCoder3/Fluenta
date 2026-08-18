/** Dev helper: time a few trivial queries against whatever DATABASE_URL points at. */
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  console.log('  host:', url.replace(/^[^@]*@/, '').replace(/\?.*$/, ''))

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
    ssl: 'require',
  })

  const time = async (label: string, fn: () => Promise<unknown>) => {
    const t = Date.now()
    try {
      const r = await fn()
      console.log(`  ${label}: ${Date.now() - t}ms → ${JSON.stringify(r).slice(0, 90)}`)
    } catch (e) {
      console.log(`  ${label}: FAILED after ${Date.now() - t}ms → ${(e as Error).message.slice(0, 120)}`)
    }
  }

  await time('select 1', () => sql`select 1 as ok`)
  await time('languages', () => sql`select code from languages order by code`)
  await time('users count', () => sql`select count(*)::int as n from users`)
  await time('learner_profiles', () => sql`select target_language_code from learner_profiles`)

  await sql.end({ timeout: 5 })
  process.exit(0)
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message.slice(0, 200) : e)
  process.exit(1)
})
