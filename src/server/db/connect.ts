/**
 * Script-side database connection (migrations, seeds, smoke tests).
 *
 * Mirrors src/server/db/index.ts but without the `server-only` guard, so it can
 * run under plain `tsx` outside the Next runtime.
 */

import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'

import * as schema from './schema'

const DEFAULT_URL = 'pglite://./.data/pg'

export function resolveUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_URL
}

export function isPglite(url = resolveUrl()): boolean {
  return url.startsWith('pglite://') || url.startsWith('file:')
}

export function pgliteDataDir(url = resolveUrl()): string {
  return url.replace(/^pglite:\/\//, '').replace(/^file:/, '')
}

/** Single canonical type — see the note in src/server/db/index.ts. */
export type ScriptDatabase = ReturnType<typeof drizzlePglite<typeof schema>>

export type ScriptDb = {
  db: ScriptDatabase
  kind: 'pglite' | 'postgres'
  close: () => Promise<void>
}

export async function connect(): Promise<ScriptDb> {
  const url = resolveUrl()

  if (isPglite(url)) {
    const { PGlite } = await import('@electric-sql/pglite')
    const client = await PGlite.create({ dataDir: pgliteDataDir(url) })
    return {
      db: drizzlePglite(client, { schema }),
      kind: 'pglite',
      close: () => client.close(),
    }
  }

  const postgres = (await import('postgres')).default
  const client = postgres(url, { max: 1, prepare: false })
  return {
    db: drizzlePostgres(client, { schema }) as unknown as ScriptDatabase,
    kind: 'postgres',
    close: () => client.end(),
  }
}

export { schema }
