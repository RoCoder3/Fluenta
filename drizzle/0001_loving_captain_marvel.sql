/*
 * Scope every row of learner progress to the language it belongs to.
 *
 * Hand-written rather than left as drizzle-kit generated it. The generated
 * version adds each column as `NOT NULL` with no default and never drops the
 * old `learner_profiles` primary key, which fails immediately on any database
 * that already has a learner in it. The order below is the one that survives
 * real data: add nullable, backfill, then constrain.
 *
 * Backfill rule: every existing row predates multi-language support, so it
 * belongs to whatever language that learner was already studying — read off
 * their one existing profile, falling back to German for rows whose owner
 * never finished onboarding.
 */

--> statement-breakpoint
DROP INDEX "assessments_user_idx";--> statement-breakpoint
DROP INDEX "conversations_user_idx";--> statement-breakpoint
DROP INDEX "cross_domain_user_idx";--> statement-breakpoint
DROP INDEX "goals_user_idx";--> statement-breakpoint
DROP INDEX "grammar_user_idx";--> statement-breakpoint
DROP INDEX "learner_errors_user_type_unique";--> statement-breakpoint
DROP INDEX "learner_errors_user_status_idx";--> statement-breakpoint
DROP INDEX "learning_sessions_user_idx";--> statement-breakpoint
DROP INDEX "life_areas_user_key_unique";--> statement-breakpoint
DROP INDEX "missions_user_idx";--> statement-breakpoint
DROP INDEX "production_user_idx";--> statement-breakpoint
DROP INDEX "progress_snapshots_user_idx";--> statement-breakpoint
DROP INDEX "roadmaps_user_idx";--> statement-breakpoint
DROP INDEX "skills_user_category_unique";--> statement-breakpoint
DROP INDEX "user_phrases_due_idx";--> statement-breakpoint
DROP INDEX "user_phrases_status_idx";--> statement-breakpoint

-- 1. New columns, nullable for now so existing rows survive the ALTER.
ALTER TABLE "users" ADD COLUMN "active_target_language_code" text;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "cross_domain_items" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "grammar_explanations" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "learner_errors" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "life_areas" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "production_submissions" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "progress_snapshots" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "target_language_code" text;--> statement-breakpoint
ALTER TABLE "user_phrases" ADD COLUMN "target_language_code" text;--> statement-breakpoint

-- 2. Backfill from the learner's existing (single) profile.
UPDATE "users" SET "active_target_language_code" = coalesce(
  (SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "users"."id" LIMIT 1),
  'de'
);--> statement-breakpoint

-- Onboarding completion moves from the account to the enrollment.
UPDATE "learner_profiles" SET "onboarding_completed_at" = (
  SELECT u."onboarding_completed_at" FROM "users" u WHERE u."id" = "learner_profiles"."user_id"
);--> statement-breakpoint

UPDATE "assessments" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "assessments"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "conversations" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "conversations"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "cross_domain_items" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "cross_domain_items"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "goals" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "goals"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "grammar_explanations" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "grammar_explanations"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "learner_errors" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "learner_errors"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "learning_sessions" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "learning_sessions"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "life_areas" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "life_areas"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "missions" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "missions"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "production_submissions" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "production_submissions"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "progress_snapshots" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "progress_snapshots"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "roadmaps" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "roadmaps"."user_id" LIMIT 1), 'de');--> statement-breakpoint
UPDATE "skills" SET "target_language_code" = coalesce((SELECT p."target_language_code" FROM "learner_profiles" p WHERE p."user_id" = "skills"."user_id" LIMIT 1), 'de');--> statement-breakpoint

-- user_phrases can do better than the profile: the phrase itself knows its language.
UPDATE "user_phrases" SET "target_language_code" = coalesce(
  (SELECT ph."language_code" FROM "phrases" ph WHERE ph."id" = "user_phrases"."phrase_id"),
  'de'
);--> statement-breakpoint

-- 3. Now that every row has a value, constrain the columns.
ALTER TABLE "assessments" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_domain_items" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grammar_explanations" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_errors" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_sessions" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "life_areas" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "production_submissions" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_snapshots" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roadmaps" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_phrases" ALTER COLUMN "target_language_code" SET NOT NULL;--> statement-breakpoint

-- 4. learner_profiles becomes one row per (learner, language).
ALTER TABLE "learner_profiles" DROP CONSTRAINT "learner_profiles_pkey";--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_target_language_code_pk" PRIMARY KEY("user_id","target_language_code");--> statement-breakpoint

-- 5. Foreign keys.
ALTER TABLE "users" ADD CONSTRAINT "users_active_target_language_code_languages_code_fk" FOREIGN KEY ("active_target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_domain_items" ADD CONSTRAINT "cross_domain_items_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_explanations" ADD CONSTRAINT "grammar_explanations_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_errors" ADD CONSTRAINT "learner_errors_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_areas" ADD CONSTRAINT "life_areas_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_submissions" ADD CONSTRAINT "production_submissions_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_phrases" ADD CONSTRAINT "user_phrases_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 6. Indexes, now language-first.
CREATE INDEX "assessments_user_idx" ON "assessments" USING btree ("user_id","target_language_code");--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id","target_language_code","created_at");--> statement-breakpoint
CREATE INDEX "cross_domain_user_idx" ON "cross_domain_items" USING btree ("user_id","target_language_code","created_at");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id","target_language_code");--> statement-breakpoint
CREATE INDEX "grammar_user_idx" ON "grammar_explanations" USING btree ("user_id","target_language_code","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_errors_user_type_unique" ON "learner_errors" USING btree ("user_id","target_language_code","type");--> statement-breakpoint
CREATE INDEX "learner_errors_user_status_idx" ON "learner_errors" USING btree ("user_id","target_language_code","status");--> statement-breakpoint
CREATE INDEX "learning_sessions_user_idx" ON "learning_sessions" USING btree ("user_id","target_language_code","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "life_areas_user_key_unique" ON "life_areas" USING btree ("user_id","target_language_code","key");--> statement-breakpoint
CREATE INDEX "missions_user_idx" ON "missions" USING btree ("user_id","target_language_code","status");--> statement-breakpoint
CREATE INDEX "production_user_idx" ON "production_submissions" USING btree ("user_id","target_language_code","created_at");--> statement-breakpoint
CREATE INDEX "progress_snapshots_user_idx" ON "progress_snapshots" USING btree ("user_id","target_language_code","subject","created_at");--> statement-breakpoint
CREATE INDEX "roadmaps_user_idx" ON "roadmaps" USING btree ("user_id","target_language_code");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_user_category_unique" ON "skills" USING btree ("user_id","target_language_code","category");--> statement-breakpoint
CREATE INDEX "user_phrases_due_idx" ON "user_phrases" USING btree ("user_id","target_language_code","due_at");--> statement-breakpoint
CREATE INDEX "user_phrases_status_idx" ON "user_phrases" USING btree ("user_id","target_language_code","status");
