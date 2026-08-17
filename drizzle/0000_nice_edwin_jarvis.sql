CREATE TABLE "ai_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"engine" text NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text,
	"redacted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text DEFAULT 'placement' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "content_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"url" text,
	"title" text,
	"raw_text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"extracted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"analysis" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_analyses_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"translation" text,
	"was_spoken" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"life_area_id" text,
	"scenario_key" text NOT NULL,
	"scenario_title" text NOT NULL,
	"situation" text NOT NULL,
	"persona" jsonb NOT NULL,
	"difficulty" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cross_domain_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"life_area_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind" text NOT NULL,
	"source_phrase_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"error_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"said" text NOT NULL,
	"corrected" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"life_area_id" text,
	"title" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'permanent' NOT NULL,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"source_prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_explanations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question" text NOT NULL,
	"trigger_text" text,
	"pattern_key" text,
	"simple" text NOT NULL,
	"detailed" text,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comparison" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"native_name" text NOT NULL,
	"speech_tag" text NOT NULL,
	"is_target" boolean DEFAULT false NOT NULL,
	"is_explanation" boolean DEFAULT false NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"explanation" text NOT NULL,
	"frequency" integer DEFAULT 1 NOT NULL,
	"severity" text DEFAULT 'notable' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"clean_streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"native_language_code" text NOT NULL,
	"target_language_code" text NOT NULL,
	"explanation_language_code" text NOT NULL,
	"raw_intake" text,
	"motivation_summary" text,
	"city" text,
	"country" text,
	"region_preference" text,
	"profession" text,
	"industry" text,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"motivations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_level" text,
	"desired_level" text,
	"self_assessment" jsonb,
	"preferences" jsonb,
	"inferred_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"life_area_id" text,
	"type" text DEFAULT 'daily' NOT NULL,
	"title" text NOT NULL,
	"plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"performance" jsonb,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "life_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 3 NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"readiness" real DEFAULT 0 NOT NULL,
	"sub_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"life_area_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"success_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tier" text NOT NULL,
	"preparation_phrase_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"reflection" text,
	"self_rating" integer,
	"readiness_delta" real,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phrase_examples" (
	"id" text PRIMARY KEY NOT NULL,
	"phrase_id" text NOT NULL,
	"text" text NOT NULL,
	"translation" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "phrases" (
	"id" text PRIMARY KEY NOT NULL,
	"language_code" text NOT NULL,
	"translation_language_code" text NOT NULL,
	"text" text NOT NULL,
	"normalized" text NOT NULL,
	"translation" text NOT NULL,
	"literal" text,
	"context" text NOT NULL,
	"register" text DEFAULT 'neutral' NOT NULL,
	"region_tag" text,
	"naturalness_note" text,
	"difficulty" integer DEFAULT 3 NOT NULL,
	"cefr_hint" text,
	"audio_ref" text,
	"pronunciation" text,
	"life_area_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grammar_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vocab" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"created_by_user_id" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"life_area_id" text,
	"mode" text NOT NULL,
	"format" text NOT NULL,
	"prompt" text NOT NULL,
	"prompt_translation" text,
	"content" text NOT NULL,
	"duration_seconds" integer,
	"evaluation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"value" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"stage_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"can_do" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"last_evidence_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roadmap_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"name" text NOT NULL,
	"tier" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'locked' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmaps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" text,
	"life_area_id" text,
	"title" text NOT NULL,
	"summary" text,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb,
	"evaluation" jsonb,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 0.2 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_phrases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phrase_id" text NOT NULL,
	"mastery" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'learning' NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty_factor" real DEFAULT 5 NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"context_performance" jsonb,
	"avg_response_ms" integer,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"acquired_via" text DEFAULT 'lesson' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD CONSTRAINT "conversation_analyses_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_domain_items" ADD CONSTRAINT "cross_domain_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_occurrences" ADD CONSTRAINT "error_occurrences_error_id_learner_errors_id_fk" FOREIGN KEY ("error_id") REFERENCES "public"."learner_errors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_explanations" ADD CONSTRAINT "grammar_explanations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_errors" ADD CONSTRAINT "learner_errors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_native_language_code_languages_code_fk" FOREIGN KEY ("native_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_target_language_code_languages_code_fk" FOREIGN KEY ("target_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_explanation_language_code_languages_code_fk" FOREIGN KEY ("explanation_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_areas" ADD CONSTRAINT "life_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrase_examples" ADD CONSTRAINT "phrase_examples_phrase_id_phrases_id_fk" FOREIGN KEY ("phrase_id") REFERENCES "public"."phrases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_translation_language_code_languages_code_fk" FOREIGN KEY ("translation_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_submissions" ADD CONSTRAINT "production_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_submissions" ADD CONSTRAINT "production_submissions_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_objectives" ADD CONSTRAINT "roadmap_objectives_stage_id_roadmap_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."roadmap_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_stages" ADD CONSTRAINT "roadmap_stages_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_life_area_id_life_areas_id_fk" FOREIGN KEY ("life_area_id") REFERENCES "public"."life_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_activities" ADD CONSTRAINT "session_activities_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_phrases" ADD CONSTRAINT "user_phrases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_phrases" ADD CONSTRAINT "user_phrases_phrase_id_phrases_id_fk" FOREIGN KEY ("phrase_id") REFERENCES "public"."phrases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_user_idx" ON "ai_generations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "assessments_user_idx" ON "assessments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_sources_user_idx" ON "content_sources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_turns_conv_idx" ON "conversation_turns" USING btree ("conversation_id","order_index");--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "cross_domain_user_idx" ON "cross_domain_items" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "error_occurrences_error_idx" ON "error_occurrences" USING btree ("error_id","created_at");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "grammar_user_idx" ON "grammar_explanations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_errors_user_type_unique" ON "learner_errors" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "learner_errors_user_status_idx" ON "learner_errors" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "learning_sessions_user_idx" ON "learning_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "life_areas_user_key_unique" ON "life_areas" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "missions_user_idx" ON "missions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "phrase_examples_phrase_idx" ON "phrase_examples" USING btree ("phrase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phrases_lang_normalized_unique" ON "phrases" USING btree ("language_code","normalized");--> statement-breakpoint
CREATE INDEX "phrases_language_idx" ON "phrases" USING btree ("language_code");--> statement-breakpoint
CREATE INDEX "production_user_idx" ON "production_submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "progress_snapshots_user_idx" ON "progress_snapshots" USING btree ("user_id","subject","created_at");--> statement-breakpoint
CREATE INDEX "roadmap_objectives_stage_idx" ON "roadmap_objectives" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "roadmap_stages_roadmap_idx" ON "roadmap_stages" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "roadmaps_user_idx" ON "roadmaps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_activities_session_idx" ON "session_activities" USING btree ("session_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_user_category_unique" ON "skills" USING btree ("user_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "user_phrases_user_phrase_unique" ON "user_phrases" USING btree ("user_id","phrase_id");--> statement-breakpoint
CREATE INDEX "user_phrases_due_idx" ON "user_phrases" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "user_phrases_status_idx" ON "user_phrases" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));