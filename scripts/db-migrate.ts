/**
 * Applies the generated SQL migrations.
 *
 * Works identically against embedded PGlite and hosted Postgres — the driver is
 * chosen from DATABASE_URL and the migration files are the same either way.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { connect, isPglite, pgliteDataDir } from '../src/server/db/connect'

async function main() {
  if (isPglite()) {
    mkdirSync(dirname(pgliteDataDir()), { recursive: true })
    mkdirSync(pgliteDataDir(), { recursive: true })
  }

  const { db, kind, close } = await connect()
  console.log(`→ migrating (${kind})`)

  if (kind === 'pglite') {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: './drizzle' })
  } else {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: './drizzle' })
  }

  console.log('✓ migrations applied')
  await close()
}

main().catch((error) => {
  console.error('✗ migration failed:', error)
  process.exit(1)
})
