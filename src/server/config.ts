import 'server-only'

import { databaseUrlSource, resolveDatabaseUrl } from '@/server/db/url'

/**
 * Central environment access. Nothing else in the app reads process.env, so
 * the full set of external dependencies is visible in one file.
 */

function str(key: string, fallback = ''): string {
  return process.env[key]?.trim() || fallback
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key]?.trim().toLowerCase()
  if (v === undefined || v === '') return fallback
  return v === 'true' || v === '1' || v === 'yes'
}

function int(key: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  /**
   * Accepts DATABASE_URL or the names managed providers inject
   * (POSTGRES_URL etc.) — see src/server/db/url.ts.
   */
  databaseUrl: resolveDatabaseUrl('runtime'),
  /** Which variable supplied it. Safe to display; never the value itself. */
  databaseUrlSource: databaseUrlSource('runtime'),
  /**
   * Connections per process.
   *
   * Must be at least as large as the number of queries any single request runs
   * concurrently. Pages routinely `Promise.all` several queries, and with a
   * smaller pool than that those requests do not merely serialize — they hang
   * until the platform kills them, with no error logged anywhere. A pool of 1
   * looks conservative and is in fact a deadlock waiting for the first page
   * that loads two things at once.
   *
   * 5 is chosen to comfortably exceed the widest fan-out in the app. Serverless
   * multiplies this by the number of live instances, which is exactly what the
   * pooled (pgbouncer/Neon pooler) connection string is for — the pooler
   * multiplexes thousands of client connections onto a few server ones. Do not
   * lower this below the widest `Promise.all` in a request path.
   */
  databasePoolMax: int('DATABASE_POOL_MAX', 5),

  auth: {
    /**
     * Dev falls back to a fixed string so a fresh clone runs without setup.
     * Production refuses to boot without a real secret — see assertProductionConfig().
     */
    secret: str('AUTH_SECRET', 'dev-only-insecure-secret-change-me'),
    sessionDays: 30,
    cookieName: 'lt_session',
  },

  ai: {
    anthropicApiKey: str('ANTHROPIC_API_KEY'),
    /** 'auto' uses Anthropic when a key exists, offline otherwise. */
    provider: str('AI_PROVIDER', 'auto') as 'auto' | 'anthropic' | 'offline',
    modelPrimary: str('AI_MODEL_PRIMARY', 'claude-opus-5'),
    modelFast: str('AI_MODEL_FAST', 'claude-sonnet-5'),
    redactPii: bool('AI_REDACT_PII', true),
  },

  tts: {
    provider: str('TTS_PROVIDER', 'webspeech') as 'webspeech' | 'elevenlabs' | 'openai',
    elevenLabsApiKey: str('ELEVENLABS_API_KEY'),
    openAiApiKey: str('OPENAI_API_KEY'),
  },

  isProduction: process.env.NODE_ENV === 'production',
} as const

/** Below this, concurrent queries in one request deadlock rather than queue. */
const MIN_POOL_MAX = 3

/** Local stand-ins (pglite-socket) serve one connection at a time by design. */
function isLocalDatabase(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)
}

export type ConfigProblem = {
  variable: string
  problem: string
  fix: string
}

/**
 * Production configuration problems, as data rather than an exception.
 *
 * This deliberately does NOT throw. Throwing from the instrumentation hook
 * takes down server startup itself, which turns a two-minute env-var fix into
 * an opaque 500 on every route with nothing useful in the browser. Callers
 * decide what to do: scripts assert, the web app renders a setup page.
 */
export function productionConfigProblems(): ConfigProblem[] {
  if (!config.isProduction) return []
  const problems: ConfigProblem[] = []

  if (config.auth.secret === 'dev-only-insecure-secret-change-me' || config.auth.secret.length < 32) {
    problems.push({
      variable: 'AUTH_SECRET',
      problem: 'Missing, or still the development placeholder.',
      fix: 'Generate one with: openssl rand -base64 48',
    })
  }

  if (config.databaseUrl.startsWith('pglite://') || config.databaseUrl.startsWith('file:')) {
    problems.push({
      variable: 'DATABASE_URL',
      problem:
        'No Postgres connection string found. Embedded PGlite cannot run on serverless hosting.',
      fix:
        'Set DATABASE_URL to a pooled postgres:// string. POSTGRES_URL, POSTGRES_PRISMA_URL and ' +
        'POSTGRES_URL_NON_POOLING are also accepted, so a Vercel Postgres or Supabase integration ' +
        'works without renaming anything — but the integration must be linked to THIS project.',
    })
  }

  /**
   * A pool smaller than a request's concurrent query count does not degrade
   * gracefully — the request hangs until the platform times it out, logging
   * nothing. This was a real outage: pages that `Promise.all` a few queries
   * returned 504 with no error anywhere, while `select 1` stayed fast, so every
   * signal pointed at the database being healthy. Refuse to boot instead.
   *
   * Skipped for a local database, because the pglite-socket stand-in used to
   * exercise this exact code path locally serves one connection at a time — so
   * local production-mode testing legitimately runs with a pool of 1.
   */
  if (config.databasePoolMax < MIN_POOL_MAX && !isLocalDatabase(config.databaseUrl)) {
    problems.push({
      variable: 'DATABASE_POOL_MAX',
      problem:
        `Set to ${config.databasePoolMax}, below the minimum of ${MIN_POOL_MAX}. Requests that load ` +
        'several things at once will hang rather than queue.',
      fix: `Remove it to use the default (${MIN_POOL_MAX}+), or set it to at least ${MIN_POOL_MAX}. A pooled connection string makes this safe.`,
    })
  }

  return problems
}

/** Fails loudly. Used by scripts, where stopping is the correct response. */
export function assertProductionConfig(): void {
  const problems = productionConfigProblems()
  if (!problems.length) return
  throw new Error(
    `Invalid production configuration:\n` +
      problems.map((p) => `  - ${p.variable}: ${p.problem}\n    ${p.fix}`).join('\n'),
  )
}
