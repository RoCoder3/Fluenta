import type { Config } from 'drizzle-kit'

/**
 * Migrations are always authored against the Postgres dialect, regardless of
 * whether they run on PGlite (local, embedded) or a hosted Postgres. That is
 * the whole point of the PGlite choice: one schema, one migration set.
 */
export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/placeholder',
  },
  verbose: true,
  strict: false,
} satisfies Config
