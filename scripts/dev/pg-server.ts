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

async function main() {
  const db = await PGlite.create({ dataDir })
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })

  await server.start()
  console.log(`postgres://postgres@127.0.0.1:${port}/postgres`)
  console.log(`(data: ${dataDir}) — Ctrl-C to stop`)

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
