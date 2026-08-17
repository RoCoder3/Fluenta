/**
 * Startup checks. Next.js calls `register()` once per server process.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { config, assertProductionConfig } = await import('@/server/config')

  // Refuses to boot with a dev secret or an embedded database in production.
  assertProductionConfig()

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
