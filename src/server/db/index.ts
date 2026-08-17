/**
 * Database connection.
 *
 * The driver is chosen from the DATABASE_URL scheme, and that is the *only*
 * thing that differs between local dev and production:
 *
 *   pglite://./.data/pg          → embedded Postgres (WASM), no install
 *   postgres://user@host/db      → any hosted Postgres
 *
 * Same schema, same migrations, same queries. Moving to Neon/Supabase/RDS is a
 * one-line env change.
 */

import 'server-only'

import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'

import { config } from '@/server/config'

import * as schema from './schema'

/**
 * One canonical database type rather than a union of the two driver types.
 *
 * Both drivers speak the same Postgres dialect and expose the same query
 * builder, but TypeScript collapses overloads across a union — `.returning(cols)`
 * stops type-checking the moment `Database` is `A | B`. Pinning the type to the
 * PGlite flavour and casting the postgres-js instance keeps full inference at
 * every call site, and the two are interchangeable at runtime.
 */
export type Database = PgliteDatabase<typeof schema>

const DEFAULT_URL = 'pglite://./.data/pg'

function resolveUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_URL
}

export function isPglite(url = resolveUrl()): boolean {
  return url.startsWith('pglite://') || url.startsWith('file:')
}

/** `pglite://./.data/pg` → `./.data/pg` */
export function pgliteDataDir(url = resolveUrl()): string {
  return url.replace(/^pglite:\/\//, '').replace(/^file:/, '')
}

/**
 * Single connection per process, parked on globalThis so it survives Next's
 * hot-reload module re-evaluation.
 *
 * IMPORTANT — PGlite is single-writer. One data directory may be open by
 * exactly one instance. Two instances (two processes, or two connections in
 * one process) will each hold their own view and silently diverge: writes
 * through one are invisible to the other. That is a development-only
 * constraint of the zero-setup database, not of the schema — any real Postgres
 * URL removes it entirely, which is what production uses.
 *
 * The practical rules while on PGlite:
 *   - stop the dev server before running db:seed / smoke
 *   - never open a second connection inside a script; import getDb()
 */
const globalForDb = globalThis as unknown as {
  __ltDb?: Database
  __ltClient?: unknown
}

async function createDatabase(): Promise<Database> {
  const url = resolveUrl()

  if (isPglite(url)) {
    const { PGlite } = await import('@electric-sql/pglite')
    const client = await PGlite.create({ dataDir: pgliteDataDir(url) })
    globalForDb.__ltClient = client
    return drizzlePglite(client, { schema })
  }

  const postgres = (await import('postgres')).default

  /**
   * Serverless-safe pool settings.
   *
   * On Vercel each concurrent invocation is its own isolate with its own pool,
   * so a per-process `max` multiplies by the number of live instances. A small
   * `max` plus a pooled (pgbouncer/Neon pooler) connection string is what keeps
   * a traffic spike from exhausting the database's connection limit.
   *
   * `prepare: false` is required for pgbouncer transaction-pooling mode, which
   * does not support session-level prepared statements.
   */
  const client = postgres(url, {
    max: config.databasePoolMax,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  })

  globalForDb.__ltClient = client
  return drizzlePostgres(client, { schema }) as unknown as Database
}

let pending: Promise<Database> | null = null

/** Await this anywhere on the server. Idempotent and safe under hot reload. */
export async function getDb(): Promise<Database> {
  if (globalForDb.__ltDb) return globalForDb.__ltDb
  if (!pending) {
    pending = createDatabase().then((db) => {
      globalForDb.__ltDb = db
      return db
    })
  }
  return pending
}

export { schema }
export * from './schema'
