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
      // Which env var supplied the URL — the value is never included.
      source: config.databaseUrlSource,
      // null until actually probed, so "not tested" is never mistaken for "failed".
      reachable: null as boolean | null,
    },
    ai: { provider: config.ai.anthropicApiKey ? 'anthropic' : 'offline', keySet: Boolean(config.ai.anthropicApiKey) },
    authSecretSet: config.auth.secret !== 'dev-only-insecure-secret-change-me' && config.auth.secret.length >= 32,
    problems: problems.map((p) => ({ variable: p.variable, problem: p.problem, fix: p.fix })),
  }

  /**
   * The database is probed even when other configuration is missing. Returning
   * early here would report `reachable: false` for a database that was never
   * contacted, which reads as "your credentials are wrong" and sends people
   * debugging the wrong thing. One request should answer every question.
   */
  /**
   * Probed in three separate stages, because they are three different
   * failures with three different fixes. Asking one combined query would make
   * an un-migrated database look unreachable — which is the state every new
   * deployment starts in, and the most confusing possible signal.
   */
  let migrated = false
  try {
    const db = await getDb()

    // Stage 1: can we talk to it at all?
    await db.execute(sql`select 1`)
    report.database = { ...(report.database as object), reachable: true }

    // Stage 2: has the schema been created?
    const tableResult = await db.execute(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    )
    const tables = Number(firstRow<{ n: number }>(tableResult)?.n ?? 0)
    migrated = tables >= 20
    report.database = { ...(report.database as object), tables, migrated }

    // Stage 3: only meaningful once the schema exists.
    if (migrated) {
      const seedResult = await db.execute(sql`select count(*)::int as n from phrases`)
      report.database = {
        ...(report.database as object),
        seededPhrases: Number(firstRow<{ n: number }>(seedResult)?.n ?? 0),
      }
    }
  } catch (error) {
    report.database = {
      ...(report.database as object),
      reachable: (report.database as { reachable: boolean | null }).reachable ?? false,
      error: error instanceof Error ? error.message.slice(0, 180) : 'unknown error',
    }
  }

  const db = report.database as { reachable: boolean | null }
  report.ok = problems.length === 0 && db.reachable === true && migrated
  report.nextStep = nextStep({ problems, reachable: db.reachable, migrated })

  return NextResponse.json(report, { status: report.ok ? 200 : 503 })
}

/** The single most useful sentence for whatever state the deployment is in. */
function nextStep(s: {
  problems: { variable: string }[]
  reachable: boolean | null
  migrated: boolean
}): string | null {
  const steps: string[] = []

  if (s.reachable === false) {
    steps.push(
      'Database unreachable: check the connection string and that the database accepts connections from this deployment.',
    )
  } else if (!s.migrated) {
    steps.push(
      'Database reachable but the schema is missing. Run against it: npm run db:migrate && npm run db:seed',
    )
  }

  if (s.problems.length) {
    steps.push(
      `Set ${s.problems.map((p) => p.variable).join(' and ')} in the project's environment variables, then redeploy.`,
    )
  }

  return steps.length ? steps.join(' ') : null
}
