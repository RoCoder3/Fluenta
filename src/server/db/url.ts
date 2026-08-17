/**
 * Where the database connection string comes from.
 *
 * Deliberately dependency-free (no `server-only`) so scripts, the Next server
 * and the config module can all share one resolution order instead of each
 * reading process.env their own way.
 *
 * Managed Postgres integrations inject their own variable names rather than
 * DATABASE_URL — Vercel Postgres and the Vercel↔Supabase integration both set
 * POSTGRES_URL and friends. Reading only DATABASE_URL means a database that is
 * correctly provisioned still looks "not configured", which is a confusing
 * failure. So we accept the standard names too, with an explicit DATABASE_URL
 * always winning.
 */

const PGLITE_DEFAULT = 'pglite://./.data/pg'

/** Pooled URLs first: correct for serving requests. */
const RUNTIME_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
] as const

/**
 * Direct (non-pooled) URLs first: migrations run DDL, and transaction-mode
 * poolers like pgbouncer handle that badly.
 */
const MIGRATION_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
] as const

function firstSet(keys: readonly string[]): { url: string; source: string } | null {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return { url: value, source: key }
  }
  return null
}

export function resolveDatabaseUrl(mode: 'runtime' | 'migration' = 'runtime'): string {
  const found = firstSet(mode === 'migration' ? MIGRATION_KEYS : RUNTIME_KEYS)
  return found?.url ?? PGLITE_DEFAULT
}

/** Which variable supplied the URL — surfaced in health output, never the value. */
export function databaseUrlSource(mode: 'runtime' | 'migration' = 'runtime'): string {
  const found = firstSet(mode === 'migration' ? MIGRATION_KEYS : RUNTIME_KEYS)
  return found?.source ?? 'default (pglite)'
}

export function isPgliteUrl(url: string): boolean {
  return url.startsWith('pglite://') || url.startsWith('file:')
}

export function pgliteDataDirFrom(url: string): string {
  return url.replace(/^pglite:\/\//, '').replace(/^file:/, '')
}

/**
 * Hosted Postgres almost always requires TLS, and managed providers do not
 * always put `sslmode` in the string they hand you. Enable it unless the
 * string already says otherwise or we're talking to a local server.
 */
export function sslSettingFor(url: string): 'require' | false | undefined {
  if (/[?&]sslmode=/.test(url)) return undefined // honour what the URL specifies
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) return false
  return 'require'
}
