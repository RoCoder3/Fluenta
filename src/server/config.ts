import 'server-only'

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

export const config = {
  databaseUrl: str('DATABASE_URL', 'pglite://./.data/pg'),

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

/** Called once at startup. Fails loudly rather than shipping a dev secret. */
export function assertProductionConfig(): void {
  if (!config.isProduction) return
  const problems: string[] = []
  if (config.auth.secret === 'dev-only-insecure-secret-change-me' || config.auth.secret.length < 32) {
    problems.push('AUTH_SECRET must be set to at least 32 random characters in production.')
  }
  if (config.databaseUrl.startsWith('pglite://')) {
    problems.push('DATABASE_URL points at embedded PGlite; use a hosted Postgres in production.')
  }
  if (problems.length) {
    throw new Error(`Invalid production configuration:\n  - ${problems.join('\n  - ')}`)
  }
}
