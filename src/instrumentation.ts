/**
 * Startup checks. Next.js calls `register()` once per server process.
 *
 * This must never throw. An exception here aborts server startup, so every
 * route returns an opaque 500 with nothing actionable in the browser — which
 * is exactly how a missing environment variable turns into a debugging
 * session. Problems are logged here and surfaced as a setup page by the root
 * layout instead.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { config, productionConfigProblems } = await import('@/server/config')

  const problems = productionConfigProblems()
  if (problems.length) {
    console.error(
      '\n╭─ Fluenta is not configured for production ─────────────────\n' +
        problems.map((p) => `│  ${p.variable}: ${p.problem}\n│    → ${p.fix}`).join('\n') +
        '\n│\n│  The app is serving a setup page until these are set.\n' +
        '╰────────────────────────────────────────────────────────────\n',
    )
    return
  }

  if (!config.isProduction && config.databaseUrl.startsWith('pglite://')) {
    console.log(
      '\n  ▸ Database: embedded PGlite at ' +
        config.databaseUrl.replace('pglite://', '') +
        '\n    PGlite allows ONE writer per data directory. Stop the dev server before\n' +
        '    running scripts that write (db:seed, smoke), or they will diverge.\n' +
        '    Point DATABASE_URL at a real Postgres to lift this restriction.\n',
    )
  }

  console.log(
    `  ▸ AI provider: ${config.ai.anthropicApiKey ? `anthropic (${config.ai.modelPrimary})` : 'offline adapter — set ANTHROPIC_API_KEY for live generation'}`,
  )
  console.log(`  ▸ TTS: ${config.tts.provider}\n`)
}
