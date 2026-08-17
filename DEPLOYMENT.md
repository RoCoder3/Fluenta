# Deploying Fluenta

## Why a fresh deploy 500s

The app ships with development defaults: `DATABASE_URL` points at embedded PGlite and
`AUTH_SECRET` is a placeholder. Neither is usable in production —

- **PGlite cannot run on serverless hosting.** It writes to a local data directory, but
  serverless filesystems are read-only apart from `/tmp`, and every invocation is a separate
  isolated process. PGlite allows one writer per data directory, so even if the filesystem
  were writable, instances would diverge.
- **The dev `AUTH_SECRET` is public**, since it lives in `.env.example` in the repository.

So the app refuses to serve until both are set, and shows a page saying exactly which are
missing. Visit `/api/health` on any deployment for a machine-readable version.

---

## Vercel, start to finish

### 1. Create a Postgres database

In your Vercel project: **Storage → Create Database → Postgres**. Any Postgres works —
Neon, Supabase, RDS — it does not have to be Vercel's.

Copy the **pooled** connection string (Vercel calls it `POSTGRES_URL`; Neon labels it
"Pooled connection"). The pooled URL matters: serverless opens many short-lived connections,
and a direct URL will exhaust the database's connection limit under load.

### 2. Set environment variables

**Settings → Environment Variables**, for Production (and Preview, if you use it):

| Variable | Value | Required |
|---|---|---|
| `AUTH_SECRET` | `openssl rand -base64 48` | **yes** |
| `DATABASE_URL` | Pooled `postgres://…` string | only if not auto-injected |
| `ANTHROPIC_API_KEY` | Your key | no — omit to run on the offline adapter |
| `DATABASE_POOL_MAX` | Defaults to `1` in production | no |

**You usually do not need to set `DATABASE_URL` by hand.** The app accepts the names
managed integrations inject, in this order:

```
DATABASE_URL → POSTGRES_URL → POSTGRES_PRISMA_URL → POSTGRES_URL_NON_POOLING
```

So Vercel Postgres and the Vercel↔Supabase integration work as-is. Migrations deliberately
resolve in a different order, preferring `POSTGRES_URL_NON_POOLING`, because DDL and
transaction-mode poolers do not mix.

`AUTH_SECRET` is never auto-injected. You always have to set that one.

> **The integration must be linked to this specific project.** A database created at the
> team/account level injects nothing until you connect it to the project. In the Supabase
> integration page, check that Fluenta is listed under connected projects — otherwise
> `/api/health` will keep reporting `"source": "default (pglite)"`.

### 3. Run migrations against it, once

The database starts empty. From your machine:

```bash
DATABASE_URL="postgres://…pooled…" npm run db:migrate
DATABASE_URL="postgres://…pooled…" npm run db:seed
```

`db:seed` loads the language rows and every built-in corpus (German and Catalan today). It
is idempotent — safe to re-run, and re-running it after adding a language is how you install
that language's corpus.

> If your provider gives a separate **direct** (non-pooled) URL, prefer it for these two
> commands. Migrations run DDL, which some poolers handle awkwardly in transaction mode.

### 4. Redeploy

**Deployments → ⋯ → Redeploy.** Environment variable changes do not apply to an existing
deployment.

### 5. Confirm

```bash
curl https://your-app.vercel.app/api/health
```

Healthy looks like:

```json
{
  "ok": true,
  "database": { "driver": "postgres", "reachable": true, "tables": 28, "migrated": true },
  "problems": []
}
```

`503` with a populated `problems` array means a variable is still missing. `reachable: false`
means the credentials or network path are wrong. `migrated: false` means step 3 has not run.

---

## Optional: migrate automatically on deploy

To stop hand-running migrations, set the Vercel **Build Command** to:

```
npm run db:migrate && npm run build
```

Convenient, with a real trade-off: a failing migration now fails the build, and concurrent
deploys can race. Fine for a solo project; use a release step if a team is deploying.

---

## Notes for other hosts

The app is a standard Next.js server — anything running Node 20+ works.

- **Long-lived servers** (Railway, Render, Fly, a VM): raise `DATABASE_POOL_MAX` to ~10 and
  use a direct connection string. The serverless default of 1 is needlessly conservative.
- **Docker**: no special handling. `npm run build && npm start` with the env vars set.
- **Native module**: `@node-rs/argon2` ships prebuilt binaries for linux-x64-gnu and is
  declared in `serverExternalPackages`, so it is not bundled. On Alpine/musl, install
  `@node-rs/argon2-linux-x64-musl`.

---

## Testing the production path locally

You do not need to install Postgres to exercise the deployed code path. `pglite-socket`
serves PGlite over the real Postgres wire protocol:

```bash
npx tsx scripts/dev/pg-server.ts 5433 ./.data/pg-tcp     # prints a postgres:// URL

# in another shell
export DATABASE_URL="postgres://postgres@127.0.0.1:5433/postgres"
export DATABASE_POOL_MAX=1        # the socket server accepts one connection at a time
npm run db:migrate && npm run db:seed
npm run smoke                     # 75 assertions through postgres.js
```

This runs the `postgres.js` driver, not the embedded one — the same path Vercel uses. Both
paths are verified before release.

To reproduce a misconfigured deploy:

```bash
npm run build
mv .env.local .env.local.bak
npm start          # serves the setup page, not a 500
mv .env.local.bak .env.local
```
