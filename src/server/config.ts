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
   * Connections per process. Serverless multiplies this by the number of live
   * instances, so production defaults to 1 and leans on a pooled connection
   * string. Override for hosts with different limits.
   */
  databasePoolMax: int('DATABASE_POOL_MAX', process.env.NODE_ENV === 'production' ? 1 : 5),

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
