/**
 * Runs PGlite as a real TCP Postgres server.
 *
 * This exists so the production driver path (postgres.js over a `postgres://`
 * URL) can be exercised locally, without installing Postgres. It is the code
 * path that runs on Vercel, and it is NOT the path the embedded `pglite://`
 * URL takes — so testing only the embedded driver would leave the deployed
 * configuration completely unverified.
 *
 *   npx tsx scripts/dev/pg-server.ts [port] [dataDir]
 */

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const port = Number(process.argv[2] ?? 5433)
const dataDir = process.argv[3] ?? './.data/pg-tcp'
const maxConnections = Number(process.env.PG_SERVER_MAX_CONNECTIONS ?? 1)

async function main() {
  const db = await PGlite.create({ dataDir })

  /*
   * One connection at a time, deliberately.
   *
   * pglite-socket will accept more, and its queue serializes queries — but not
   * the extended query protocol's *state*. PGlite has a single session, so two
   * clients using the unnamed prepared statement interleave Parse and Bind and
   * corrupt each other ("bind message supplies 6 parameters, but prepared
   * statement requires 3"). Raising this looks like it works right up until a
   * concurrent write fails in a way that reads like an application bug.
   *
   * So: run one client at a time. A test that needs its own connection while
   * the server is up should stop the server first — see
   * switch-language-http-test.ts, which is structured around exactly that.
   */
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections })

  await server.start()
  console.log(`postgres://postgres@127.0.0.1:${port}/postgres`)
  console.log(`(data: ${dataDir}, maxConnections: ${maxConnections}) — Ctrl-C to stop`)

  const shutdown = async () => {
    await server.stop()
    await db.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('pg-server failed:', error)
  process.exit(1)
})
