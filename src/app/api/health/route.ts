import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { config, productionConfigProblems } from '@/server/config'
import { getDb } from '@/server/db'

export const dynamic = 'force-dynamic'

/**
 * The two drivers disagree on what `execute` returns: PGlite gives
 * `{ rows: [...] }`, postgres.js gives the rows directly. Normalize rather
 * than casting, so this keeps working whichever one is configured.
 */
function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result)) return result[0] as T | undefined
  const rows = (result as { rows?: unknown[] })?.rows
  return Array.isArray(rows) ? (rows[0] as T | undefined) : undefined
}

/**
 * Deployment diagnostics.
 *
 * Answers "is this deploy actually wired up?" without needing log access:
 * which driver is in use, whether the database answers, whether migrations
 * have run, and which required variables are unset.
 *
 * Reports only presence and shape — never a secret, never a connection string.
 */
export async function GET() {
  const problems = productionConfigProblems()

  const report: Record<string, unknown> = {
    ok: false,
    environment: config.isProduction ? 'production' : 'development',
    database: {
      driver: config.databaseUrl.startsWith('pglite://') ? 'pglite (embedded)' : 'postgres',
      configured: !config.databaseUrl.startsWith('pglite://'),
      reachable: false,
    },
    ai: { provider: config.ai.anthropicApiKey ? 'anthropic' : 'offline', keySet: Boolean(config.ai.anthropicApiKey) },
    authSecretSet: config.auth.secret !== 'dev-only-insecure-secret-change-me' && config.auth.secret.length >= 32,
    problems: problems.map((p) => ({ variable: p.variable, problem: p.problem, fix: p.fix })),
  }

  if (problems.length) {
    return NextResponse.json(report, { status: 503 })
  }

  try {
    const db = await getDb()
    // Confirms both connectivity and that migrations have been applied.
    const result = await db.execute(sql`
      select
        (select count(*) from phrases)::int as phrases,
        (select count(*) from information_schema.tables where table_schema = 'public')::int as tables
    `)
    const row = firstRow<{ phrases: number; tables: number }>(result)

    report.database = {
      ...(report.database as object),
      reachable: true,
      tables: Number(row?.tables ?? 0),
      seededPhrases: Number(row?.phrases ?? 0),
      migrated: Number(row?.tables ?? 0) >= 20,
    }
    report.ok = Number(row?.tables ?? 0) >= 20
  } catch (error) {
    report.database = {
      ...(report.database as object),
      reachable: false,
      error: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
      hint: 'Database unreachable, or migrations have not been run against it yet.',
    }
    return NextResponse.json(report, { status: 503 })
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 503 })
}
