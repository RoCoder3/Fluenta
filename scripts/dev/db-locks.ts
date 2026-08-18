/**
 * Dev helper: find (and optionally clear) sessions blocking the database.
 *
 * A killed script can leave a backend "idle in transaction" still holding the
 * locks it took — after which every ordinary query waits on it and eventually
 * dies with "canceling statement due to statement timeout" (57014). The symptom
 * looks like the database is down or overloaded; it is neither, and no amount
 * of waiting on the app side fixes it.
 *
 *   npx tsx --conditions=react-server scripts/dev/db-locks.ts          # report
 *   npx tsx --conditions=react-server scripts/dev/db-locks.ts --kill   # clear
 *
 * `--kill` terminates only sessions that are idle in a transaction and older
 * than the threshold, never anything actively running a query.
 */

import { sql } from 'drizzle-orm'

const KILL = process.argv.includes('--kill')
const IDLE_SECONDS = Number(process.env.IDLE_SECONDS ?? 30)

async function main() {
  const { getDb } = await import('../../src/server/db')
  const db = await getDb()

  const rows = async (q: ReturnType<typeof sql>) => {
    const r = (await db.execute(q)) as unknown as { rows?: Record<string, unknown>[] }
    return Array.isArray(r) ? r : (r.rows ?? [])
  }

  const activity = await rows(sql`
    select pid,
           state,
           round(extract(epoch from (now() - state_change)))::int as idle_seconds,
           round(extract(epoch from (now() - xact_start)))::int   as xact_seconds,
           wait_event_type,
           left(coalesce(query, ''), 90) as query
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
    order by xact_start nulls last
  `)

  console.log(`  ${activity.length} other session(s):`)
  for (const r of activity) {
    console.log(
      `    pid ${r.pid} · ${r.state} · idle ${r.idle_seconds}s · xact ${r.xact_seconds ?? '—'}s` +
        `${r.wait_event_type ? ` · waiting on ${r.wait_event_type}` : ''}\n      ${r.query}`,
    )
  }

  const blocked = await rows(sql`
    select pid, pg_blocking_pids(pid) as blocked_by, left(coalesce(query, ''), 90) as query
    from pg_stat_activity
    where cardinality(pg_blocking_pids(pid)) > 0
  `)
  if (blocked.length) {
    console.log('\n  blocked queries:')
    for (const r of blocked) console.log(`    pid ${r.pid} blocked by ${r.blocked_by} — ${r.query}`)
  } else {
    console.log('\n  no queries are currently blocked')
  }

  /*
   * Two shapes of abandoned session, both from a client that went away without
   * closing cleanly:
   *
   *   - "idle in transaction": the obvious one.
   *   - "active" but waiting on Client with a long-open transaction: the socket
   *     is half-open, so the backend still believes a client is there. This is
   *     what a SIGKILLed script leaves behind, and it is invisible to the usual
   *     idle-in-transaction check because the state is "active".
   */
  const stuck = activity.filter((r) => {
    const xact = Number(r.xact_seconds ?? 0)
    if (r.state === 'idle in transaction' && Number(r.idle_seconds) >= IDLE_SECONDS) return true
    return xact >= IDLE_SECONDS && r.wait_event_type === 'Client'
  })
  console.log(`\n  abandoned transactions over ${IDLE_SECONDS}s: ${stuck.length}`)

  if (stuck.length && KILL) {
    for (const r of stuck) {
      await rows(sql`select pg_terminate_backend(${r.pid as number})`)
      console.log(`    terminated pid ${r.pid}`)
    }
  } else if (stuck.length) {
    console.log('    (re-run with --kill to terminate them)')
  }

  process.exit(0)
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message.slice(0, 200) : e)
  process.exit(1)
})
