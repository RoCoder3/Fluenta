# Fluenta

A personalized, needs-based language-learning app. The first target language is German with
English explanations, but nothing in the schema or the engines is German-specific.

The premise: **don't learn a language in the abstract — learn the language your life
actually requires.** The learner describes where they live, what they do and what they keep
avoiding, and the system builds a curriculum toward functional fluency in exactly those
situations.

---

## Quick start

```bash
npm install
cp .env.example .env.local        # works as-is; no keys required
npm run setup                     # generate migrations, migrate, seed
npm run dev                       # http://localhost:3000
```

Then sign up and complete onboarding. **No API key is needed** — the app ships an offline
content adapter and is fully usable without one. Add `ANTHROPIC_API_KEY` to `.env.local` to
switch on live generation; nothing else changes.

Verify the whole stack end-to-end (stop the dev server first, see *Database* below):

```bash
npm run smoke                     # 75 assertions across the full learner journey
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, React 19, TypeScript | Server Actions remove a whole API layer |
| Styling | Tailwind v4 | Design tokens live in `globals.css` |
| Database | Postgres via Drizzle | PGlite locally, any Postgres in prod |
| Auth | In-house sessions, argon2id | See note below |
| AI | Provider abstraction | Anthropic + offline adapter |
| TTS | Provider abstraction | Web Speech by default |

### Two deliberate deviations from the brief

**Auth is in-house rather than Auth.js.** Auth.js v5 has been in beta for two years and we
only need credentials. `src/server/auth/index.ts` is ~200 readable lines: argon2id hashing at
OWASP parameters, 256-bit opaque tokens with only their SHA-256 stored, HTTP-only
`SameSite=Lax` cookies, server-side revocation, and timing-safe login that hashes even for
unknown emails so response time can't enumerate accounts. Adding OAuth later means adding an
`accounts` table and a callback route; the session layer is unchanged.

**PGlite is the local database.** The brief asks for PostgreSQL, and this *is* PostgreSQL —
compiled to WASM and running in-process, so a fresh clone works with no Docker and no install.
Migrations are authored against the Postgres dialect and the driver is chosen from the
`DATABASE_URL` scheme, so moving to Neon/Supabase/RDS is one environment variable.

---

## Architecture

```
src/
├── app/                      routes (App Router)
│   ├── (auth)/               sign in / sign up
│   ├── onboarding/           progressive intake, assessment, roadmap
│   └── (app)/                the authenticated product
├── components/               UI primitives, phrase card, audio, grammar drawer
├── lib/                      TTS abstraction, speech recognition, helpers
└── server/
    ├── ai/
    │   ├── provider/         LlmProvider interface + adapters + registry
    │   └── schemas.ts        Zod contracts for every structured output
    ├── engines/              the AI domain layer (see below)
    ├── learner/model.ts      the LearnerModel — one place that knows everything
    ├── repositories/         persistence for the shared phrase corpus
    ├── content/              hand-authored German corpus
    ├── actions/              Server Actions (the only entry points from the UI)
    ├── auth/                 sessions & passwords
    └── db/                   schema, drivers, migrations
```

### The AI domain layer

No screen calls an LLM with a giant prompt. Every screen calls a Server Action, which calls an
engine, which calls the provider registry with a Zod schema.

| Engine | Responsibility |
|---|---|
| `learner/model` | Assembles the LearnerModel; no LLM, pure aggregation |
| `onboarding` | Intake extraction, placement assessment, roadmap generation |
| `content` | Lessons, session assembly, cross-domain bridges |
| `feedback` | Writing/speaking evaluation, error memory |
| `conversation` | Roleplay turns and post-conversation analysis |
| `review` | Spaced repetition — pure algorithm, no LLM |
| `progress` | Skill scores, life-area readiness, trends |
| `tutor` | Grammar on request, goal planning, missions, chat |

`engines/prompts.ts` holds the tutor's behavioural rules (§28) and the German quality rules
(§29) in exactly one place, so a new engine inherits the teaching philosophy for free rather
than re-deriving it.

### Provider abstraction

```ts
interface LlmProvider {
  generateObject<T>(req: ObjectRequest<T>): Promise<AiResult<T>>
  generateText(req: TextRequest): Promise<AiResult<string>>
}
```

The registry picks a provider, **falls back to the offline adapter when a live call fails** —
so a provider outage degrades the lesson instead of ending it mid-session — redacts PII before
anything leaves the process, and logs every call to `ai_generations` for cost and privacy
auditing.

Structured output uses a single forced tool call: the Zod schema is converted to JSON Schema
and handed over as the tool definition, so the model returns validated arguments rather than
prose to parse. Schema-validation failures are retried.

The offline adapter is not a stub. It serves every purpose from a hand-authored corpus and
deterministic rules, and it is held to the same Zod contracts as the live model.

---

## Where the product philosophy lives in the code

Design decisions that would be easy to erode, and the code that enforces them:

**Phrases, not words** — `phrases` is the atomic table; words exist only as `vocab` metadata
hanging off a phrase. `context` is `NOT NULL`: a phrase without a situation cannot be stored.

**No grammar drills** — the tutor system prompt forbids them; grammar generation only happens
via `explainGrammar`, which is reachable only from an explicit user action. The smoke test
asserts no exercises appear in output.

**Mastery requires context diversity** — `engines/review.ts` scores each phrase across six
recall modes weighted by difficulty, and a phrase cannot reach "mastered" through repetition of
one easy mode. The smoke test asserts that ten correct recognitions still fall short of 80.

**Never interrupt a conversation** — the roleplay system prompt forbids correction in the
strongest terms available; all feedback is deferred to the post-conversation analysis. The
smoke test asserts the partner's reply contains no correction language.

**Error memory, not a punishment list** — repeat mistakes merge into one row and increment a
counter (asserted in the smoke test); patterns the learner *stops* making accumulate a clean
streak and move to `improving` then `resolved`, so the list reflects current reality.

**Progress means capability** — readiness is 50% usable language, 30% roadmap objectives
demonstrated, 20% real-world missions completed. Missions weigh heavily because doing the thing
with an actual human is stronger evidence than any in-app score.

**Skipping what you've outgrown** — roadmap stages below the learner's demonstrated level are
marked `skipped`, not `locked`.

---

## Database

26 tables. Notable design points:

- **Language neutrality.** Nothing says "German". Content carries `languageCode`; learners
  carry `targetLanguageCode` + `explanationLanguageCode`. German/English is a seed row.
- **Shared corpus, personal state.** `phrases` is deduped on `(languageCode, normalized)` so
  the same phrase generated for two learners is one row; `user_phrases` holds per-learner
  mastery on top. Generated content accumulates into an asset instead of duplicating.
- **Append-only snapshots.** `progress_snapshots` makes real trends possible ("speaking 42% →
  61% over six weeks") rather than only showing the current value.
- **Future ingestion.** `content_sources` exists so §22 can be built without a migration.

### PGlite's one constraint

PGlite allows **one writer per data directory**. Two connections — two processes, or two
instances in one process — each keep their own view and silently diverge.

**Stop the dev server before running `db:seed` or `smoke`.** This caught 13 phantom failures
during development; the fix was making the test share `getDb()` rather than opening its own
connection. Any real Postgres URL removes the constraint entirely.

---

## Privacy

- Passwords are argon2id; sessions are opaque tokens stored only as SHA-256.
- `AI_REDACT_PII=true` strips emails, phone numbers and the learner's name before any prompt
  leaves the process. The learner's *situation* (IT job, Zurich, climbing) is what makes
  generation good, so it stays; identifiers do not.
- Every LLM call is logged to `ai_generations` with its redaction flag — an audit trail of what
  was sent where.
- Manually saved phrases are marked `isPrivate` and stay out of the shared corpus.

---

## Testing

`npm run smoke` drives the real engines against the real database — no mocks below the AI
provider — covering: sign-up and password verification, intake extraction, life areas, roadmap
generation with four tiers, session assembly (input → comprehension → phrases → output), spaced
repetition including the context-diversity guarantee, writing feedback, error memory merging,
conversation with non-interruption, cross-domain bridges, missions, grammar, goal planning,
readiness computation, phrasebook, and AI telemetry/redaction.

All authenticated routes were additionally verified over HTTP.

---

## What is deliberately not built

Per §31, mocked or deferred: additional target languages (architecture in place, one seed row
away), acoustic pronunciation scoring (Web Speech gives a transcript, not phoneme confidence),
external content ingestion (schema in place), Swiss German dialect, payments, social features.

Known limitations worth naming:

- **Speech recognition is Chrome/Safari only.** Firefox has no support; the UI detects this and
  offers typing, so speaking practice degrades to writing rather than disappearing.
- **Offline evaluation is honest about its limits.** Without an API key, feedback scores
  measurable things (length, sentence variety) and catches a few mechanical German slips. It
  says so rather than pretending to grade nuance.
- **No background job queue.** Roadmap generation runs inline at the end of onboarding. With
  live AI on a slow model this is a visible wait; a queue is the right fix at real scale.

---

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full walkthrough, including Vercel.

The short version: set `DATABASE_URL` to a real Postgres connection string and `AUTH_SECRET`
to `openssl rand -base64 48`, run the migrations against it once, then deploy.

```bash
DATABASE_URL="postgres://…" npm run db:migrate
DATABASE_URL="postgres://…" npm run db:seed
```

PGlite is development-only — it needs a writable local directory and allows one writer, so it
cannot work on serverless hosting. Production refuses to serve without a real database or with
the placeholder secret, and renders a page naming the missing variables rather than a bare 500.
`GET /api/health` reports driver, connectivity, migration state and remaining problems without
exposing any secret.
