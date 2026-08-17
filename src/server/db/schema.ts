/**
 * Database schema — Postgres dialect (runs on PGlite locally, any Postgres in prod).
 *
 * Design notes that matter for the product:
 *
 * 1. LANGUAGE NEUTRALITY. Nothing here says "German". Every piece of language
 *    content carries a `languageCode`, and every row of learner progress
 *    carries a `targetLanguageCode`. German is a seed row, not a schema
 *    assumption. Adding a language means inserting a row and a corpus.
 *
 * 1b. ONE LEARNER, MANY LANGUAGES. `learnerProfiles` is keyed by
 *    (userId, targetLanguageCode) — it is the enrollment record, not a single
 *    profile. All progress tables are scoped the same way, so studying Catalan
 *    neither disturbs nor inherits from German, and switching back finds
 *    everything where it was left.
 *
 * 2. THE PHRASE IS THE UNIT. `phrases` is the atom of the system, not a word
 *    list. Words exist only as `vocab` metadata hanging off phrases.
 *
 * 3. FUNCTIONAL FLUENCY OVER LEVELS. Progress is tracked per life area
 *    (`lifeAreas.readiness`) and per can-do statement
 *    (`roadmapObjectives`), not just as a CEFR letter.
 *
 * 4. SHARED VS PERSONAL CONTENT. `phrases` is a shared corpus keyed by
 *    (languageCode, normalizedText) so the same phrase generated for two
 *    learners is one row. `userPhrases` holds the per-learner mastery state.
 *
 * Enum-ish columns are plain `text` with TypeScript union types rather than
 * pgEnum: it keeps migrations cheap and stays portable across drivers.
 */

import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

/**
 * Which language a row of per-learner state belongs to.
 *
 * Every table below that holds learner *progress* carries this, because a
 * learner can study more than one language and the two must not contaminate
 * each other: German phrases must never surface in a Catalan review queue, and
 * "dative vs accusative" is not a mistake you can make in Catalan.
 *
 * It is deliberately denormalized onto each table rather than reached through a
 * join. The review queue and the dashboard filter on it on every request, and
 * an unavoidable join on the hot path would be the wrong trade.
 */
const targetLanguage = () =>
  text('target_language_code')
    .notNull()
    .references(() => languages.code)

/* ========================================================================== */
/* Languages                                                                  */
/* ========================================================================== */

export const languages = pgTable('languages', {
  code: text('code').primaryKey(), // ISO 639-1: 'de', 'en', 'es'
  name: text('name').notNull(), // "German"
  nativeName: text('native_name').notNull(), // "Deutsch"
  /** BCP-47 tag handed to the TTS layer, e.g. 'de-DE'. */
  speechTag: text('speech_tag').notNull(),
  /** Can a learner pick this as something to learn? */
  isTarget: boolean('is_target').notNull().default(false),
  /** Can a learner pick this as the language explanations are written in? */
  isExplanation: boolean('is_explanation').notNull().default(false),
  /** Regional variants surfaced in content quality notes, e.g. ['DE','AT','CH']. */
  variants: jsonb('variants').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
})

/* ========================================================================== */
/* Identity & auth                                                            */
/* ========================================================================== */

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    /** argon2id. Null only for future OAuth-only accounts. */
    passwordHash: text('password_hash'),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /**
     * First-ever onboarding completion. Whether the learner can enter the app
     * *right now* is a per-language question — see `learnerProfiles` — but this
     * still answers "is this a brand-new account?" for the landing redirect.
     */
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    /**
     * The language the learner is currently studying. Null only between signup
     * and the first onboarding step. Every per-learner query is scoped by it.
     */
    activeTargetLanguageCode: text('active_target_language_code').references(() => languages.code),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_unique').on(sql`lower(${t.email})`)],
)

/** Server-side session records. The cookie holds an opaque token; we store its SHA-256. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('auth_sessions_token_hash_unique').on(t.tokenHash),
    index('auth_sessions_user_idx').on(t.userId),
  ],
)

/* ========================================================================== */
/* The learner model                                                          */
/* ========================================================================== */

export type LearningPreferences = {
  sessionMinutes: number
  dailyGoalMinutes: number
  correctionStyle: 'gentle' | 'direct'
  grammarAppetite: 'minimal' | 'on_request' | 'curious'
  preferSpeaking: boolean
  /** Language-neutral: each language renders these as du/Sie, tu/vostè, etc. */
  formalityDefault: 'informal' | 'formal' | 'mixed'
}

export type SelfAssessment = {
  speaking: number
  listening: number
  reading: number
  writing: number
}

/**
 * One row per (learner, language they study) — the enrollment record.
 *
 * Almost everything here is language-specific in practice, not just in
 * principle: the intake paragraph explains why they need *this* language, the
 * estimated level is a level *in it*, and the regional preference (CH vs AT,
 * Valencian vs Central) has no meaning without knowing which language it
 * qualifies. Sharing one profile across languages would mean a beginner in
 * Catalan inheriting a B2 German level.
 *
 * A row existing is what "enrolled"; `onboardingCompletedAt` is what "ready".
 */
export const learnerProfiles = pgTable('learner_profiles', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  nativeLanguageCode: text('native_language_code')
    .notNull()
    .references(() => languages.code),
  targetLanguageCode: text('target_language_code')
    .notNull()
    .references(() => languages.code),
  explanationLanguageCode: text('explanation_language_code')
    .notNull()
    .references(() => languages.code),

  /** Set when this language's own onboarding finishes. Null = mid-setup. */
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),

  /** Free-text intake, kept verbatim — the source of truth the AI re-reads. */
  rawIntake: text('raw_intake'),
  /** One-paragraph synthesis of why this person needs the language. */
  motivationSummary: text('motivation_summary'),

  city: text('city'),
  country: text('country'),
  /** Which regional standard is actually useful to them: 'DE'|'AT'|'CH', 'ES-CT'|'ES-VC'|'ES-IB'. */
  regionPreference: text('region_preference'),

  profession: text('profession'),
  industry: text('industry'),

  interests: jsonb('interests').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  dailyActivities: jsonb('daily_activities').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Reasons picked in onboarding: work, moving, travel, relationships… */
  motivations: jsonb('motivations').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

  estimatedLevel: text('estimated_level'), // A1…C2, overall estimate only
  desiredLevel: text('desired_level'),
  selfAssessment: jsonb('self_assessment').$type<SelfAssessment>(),

  preferences: jsonb('preferences').$type<LearningPreferences>(),

  /**
   * Facts the system inferred from usage rather than asked for (§35).
   * [{ fact, source, confidence, observedAt }]
   */
  inferredFacts: jsonb('inferred_facts')
    .$type<Array<{ fact: string; source: string; confidence: number; observedAt: string }>>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.targetLanguageCode] })])

/* ========================================================================== */
/* Life areas                                                                 */
/* ========================================================================== */

export type SubArea = { key: string; name: string; readiness: number }

export const lifeAreas = pgTable(
  'life_areas',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    /** Stable slug: 'work', 'daily_life', 'social'… or 'custom_<uuid>'. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** 1 = most important. Drives how much of each session it gets. */
    priority: integer('priority').notNull().default(3),
    isCustom: boolean('is_custom').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    /** 0–100 functional readiness. Recomputed from evidence, never hand-set. */
    readiness: real('readiness').notNull().default(0),
    subAreas: jsonb('sub_areas').$type<SubArea[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('life_areas_user_key_unique').on(t.userId, t.targetLanguageCode, t.key)],
)

/* ========================================================================== */
/* Goals & roadmaps                                                           */
/* ========================================================================== */

export const goals = pgTable(
  'goals',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    lifeAreaId: text('life_area_id').references(() => lifeAreas.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    /** 'permanent' = ongoing ambition; 'temporary' = "interview next Friday" (§23). */
    kind: text('kind').$type<'permanent' | 'temporary'>().notNull().default('permanent'),
    deadline: timestamp('deadline', { withTimezone: true }),
    status: text('status').$type<'active' | 'achieved' | 'paused' | 'archived'>().notNull().default('active'),
    /** The verbatim request that produced this goal, for "what do I need to learn?". */
    sourcePrompt: text('source_prompt'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('goals_user_idx').on(t.userId, t.targetLanguageCode)],
)

export const roadmaps = pgTable(
  'roadmaps',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    lifeAreaId: text('life_area_id').references(() => lifeAreas.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    summary: text('summary'),
    status: text('status').$type<'active' | 'completed' | 'archived'>().notNull().default('active'),
    /** Bumped whenever the engine regenerates stages after a performance shift. */
    revision: integer('revision').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('roadmaps_user_idx').on(t.userId, t.targetLanguageCode)],
)

export const roadmapStages = pgTable(
  'roadmap_stages',
  {
    id: id(),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    name: text('name').notNull(),
    /** survival → functional → comfortable → fluent */
    tier: text('tier').$type<'survival' | 'functional' | 'comfortable' | 'fluent'>().notNull(),
    description: text('description'),
    status: text('status')
      .$type<'locked' | 'available' | 'in_progress' | 'completed' | 'skipped'>()
      .notNull()
      .default('locked'),
    /** 0–100, derived from its objectives. */
    progress: real('progress').notNull().default(0),
  },
  (t) => [index('roadmap_stages_roadmap_idx').on(t.roadmapId)],
)

/**
 * A can-do statement — the real unit of progress.
 * "I can explain to a colleague why a deployment failed."
 */
export const roadmapObjectives = pgTable(
  'roadmap_objectives',
  {
    id: id(),
    stageId: text('stage_id')
      .notNull()
      .references(() => roadmapStages.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    canDo: text('can_do').notNull(),
    status: text('status')
      .$type<'not_started' | 'in_progress' | 'demonstrated' | 'mastered'>()
      .notNull()
      .default('not_started'),
    /** Times the learner produced language satisfying this objective. */
    evidenceCount: integer('evidence_count').notNull().default(0),
    lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }),
  },
  (t) => [index('roadmap_objectives_stage_idx').on(t.stageId)],
)

/* ========================================================================== */
/* Phrases — the shared corpus                                                */
/* ========================================================================== */

export type VocabItem = {
  lemma: string
  translation: string
  pos?: string
  /** German nouns: 'der' | 'die' | 'das'. Stored, never drilled. */
  article?: string
  plural?: string
}

export const phrases = pgTable(
  'phrases',
  {
    id: id(),
    languageCode: text('language_code')
      .notNull()
      .references(() => languages.code),
    /** Language the `translation` field is written in. */
    translationLanguageCode: text('translation_language_code')
      .notNull()
      .references(() => languages.code),

    text: text('text').notNull(),
    /** Lowercased, punctuation-stripped — the dedupe key. */
    normalized: text('normalized').notNull(),
    translation: text('translation').notNull(),
    /** Word-for-word gloss, shown only on request; often deliberately awkward. */
    literal: text('literal'),

    /** When you'd actually say this. Never omitted — context is the lesson. */
    context: text('context').notNull(),

    register: text('register')
      .$type<'informal' | 'neutral' | 'formal' | 'professional' | 'slang'>()
      .notNull()
      .default('neutral'),
    /** 'DE' | 'AT' | 'CH' | null when pan-regional. */
    regionTag: text('region_tag'),
    /** Flags phrasing that is correct but stilted, per §29. */
    naturalnessNote: text('naturalness_note'),

    difficulty: integer('difficulty').notNull().default(3), // 1–5
    cefrHint: text('cefr_hint'),

    /** Provider-independent audio pointer; null = synthesize client-side. */
    audioRef: text('audio_ref'),
    /** Hyphenated syllables + stress marker, for the pronunciation hint. */
    pronunciation: text('pronunciation'),

    lifeAreaKeys: jsonb('life_area_keys').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    grammarPatterns: jsonb('grammar_patterns').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    vocab: jsonb('vocab').$type<VocabItem[]>().notNull().default(sql`'[]'::jsonb`),
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    source: text('source').$type<'seed' | 'ai' | 'user' | 'ingested'>().notNull().default('ai'),
    /** Set when a learner saved their own phrase; keeps private text out of the shared pool. */
    createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    isPrivate: boolean('is_private').notNull().default(false),

    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('phrases_lang_normalized_unique').on(t.languageCode, t.normalized),
    index('phrases_language_idx').on(t.languageCode),
  ],
)

/** Extra sentences showing the same phrase in a different situation. */
export const phraseExamples = pgTable(
  'phrase_examples',
  {
    id: id(),
    phraseId: text('phrase_id')
      .notNull()
      .references(() => phrases.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    translation: text('translation').notNull(),
    note: text('note'),
  },
  (t) => [index('phrase_examples_phrase_idx').on(t.phraseId)],
)

/* ========================================================================== */
/* Per-learner phrase state (spaced repetition)                               */
/* ========================================================================== */

/**
 * Which recall modes the learner has succeeded in. A phrase is only "mastered"
 * once it survives several *different* modes (§15), not N repetitions of one.
 */
export type ContextPerformance = Record<
  'recognize' | 'cloze' | 'translate' | 'produce' | 'situational' | 'spoken',
  { attempts: number; correct: number; lastAt: string | null }
>

export const userPhrases = pgTable(
  'user_phrases',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    phraseId: text('phrase_id')
      .notNull()
      .references(() => phrases.id, { onDelete: 'cascade' }),
    /** Redundant with the phrase's own language, and worth it: the due-queue
     *  query runs on every dashboard load and should not need the join. */
    targetLanguageCode: targetLanguage(),

    /** 0–100. Blends accuracy, context diversity and recency. */
    mastery: real('mastery').notNull().default(0),
    status: text('status')
      .$type<'learning' | 'review' | 'mastered' | 'difficult'>()
      .notNull()
      .default('learning'),

    // FSRS-ish scheduling state
    stability: real('stability').notNull().default(0),
    difficultyFactor: real('difficulty_factor').notNull().default(5),
    intervalDays: real('interval_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),

    contextPerformance: jsonb('context_performance').$type<ContextPerformance>(),
    /** Median ms to answer; feeds confidence scoring. */
    avgResponseMs: integer('avg_response_ms'),

    isFavorite: boolean('is_favorite').notNull().default(false),
    /** How this phrase entered the learner's life — useful for "why am I seeing this?". */
    acquiredVia: text('acquired_via')
      .$type<'lesson' | 'conversation' | 'writing' | 'mission' | 'manual' | 'cross_domain'>()
      .notNull()
      .default('lesson'),
    firstSeenAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('user_phrases_user_phrase_unique').on(t.userId, t.phraseId),
    index('user_phrases_due_idx').on(t.userId, t.targetLanguageCode, t.dueAt),
    index('user_phrases_status_idx').on(t.userId, t.targetLanguageCode, t.status),
  ],
)

/* ========================================================================== */
/* Learning sessions                                                          */
/* ========================================================================== */

export type SessionPlanStep = {
  kind: ActivityKind
  title: string
  estimatedSeconds: number
}

export type ActivityKind =
  | 'dialogue'
  | 'comprehension'
  | 'phrase_intro'
  | 'expansion'
  | 'production_written'
  | 'production_spoken'
  | 'review'
  | 'cross_domain'
  | 'reflection'

export const learningSessions = pgTable(
  'learning_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    lifeAreaId: text('life_area_id').references(() => lifeAreas.id, { onDelete: 'set null' }),
    type: text('type')
      .$type<'daily' | 'focused' | 'review_only' | 'mission_prep' | 'cross_domain'>()
      .notNull()
      .default('daily'),
    title: text('title').notNull(),
    /** The generated agenda; activities materialize from it. */
    plan: jsonb('plan').$type<SessionPlanStep[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status')
      .$type<'planned' | 'in_progress' | 'completed' | 'abandoned'>()
      .notNull()
      .default('planned'),
    /** Rolled-up scores 0–100 by skill, written on completion. */
    performance: jsonb('performance').$type<Record<string, number>>(),
    durationSeconds: integer('duration_seconds'),
    startedAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('learning_sessions_user_idx').on(t.userId, t.targetLanguageCode, t.startedAt)],
)

export const sessionActivities = pgTable(
  'session_activities',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => learningSessions.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    kind: text('kind').$type<ActivityKind>().notNull(),
    /** Generated content: dialogue lines, questions, prompts. Shape varies by kind. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** What the learner produced. */
    response: jsonb('response').$type<Record<string, unknown>>(),
    /** FeedbackEngine output. */
    evaluation: jsonb('evaluation').$type<Record<string, unknown>>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('session_activities_session_idx').on(t.sessionId, t.orderIndex)],
)

/* ========================================================================== */
/* Conversation simulator                                                     */
/* ========================================================================== */

export type Persona = {
  name: string
  role: string
  /** In that language's own terms: 'du'/'Sie', 'tu'/'vostè'. See ScenarioTemplate. */
  register: string
  region: string
  personality: string
  openingLine: string
}

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    lifeAreaId: text('life_area_id').references(() => lifeAreas.id, { onDelete: 'set null' }),
    scenarioKey: text('scenario_key').notNull(),
    scenarioTitle: text('scenario_title').notNull(),
    situation: text('situation').notNull(),
    persona: jsonb('persona').$type<Persona>().notNull(),
    difficulty: integer('difficulty').notNull().default(3),
    status: text('status').$type<'active' | 'completed' | 'abandoned'>().notNull().default('active'),
    startedAt: createdAt(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('conversations_user_idx').on(t.userId, t.targetLanguageCode, t.startedAt)],
)

export const conversationTurns = pgTable(
  'conversation_turns',
  {
    id: id(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    role: text('role').$type<'learner' | 'partner' | 'narrator'>().notNull(),
    text: text('text').notNull(),
    /** On-demand translation, cached after first reveal. */
    translation: text('translation'),
    /** Set when the turn came from the microphone rather than the keyboard. */
    wasSpoken: boolean('was_spoken').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('conversation_turns_conv_idx').on(t.conversationId, t.orderIndex)],
)

export type ConversationAnalysis = {
  didWell: string[]
  mistakes: Array<{ said: string; better: string; why: string; severity: 'minor' | 'notable' | 'blocking' }>
  naturalAlternatives: Array<{ instead: string; say: string }>
  usefulPhrases: Array<{ text: string; translation: string; context: string }>
  missingVocabulary: Array<{ lemma: string; translation: string; whyUseful: string }>
  fluency: { score: number; comment: string }
  comprehension: { score: number; comment: string }
  taskSuccess: { achieved: boolean; comment: string }
  nextStep: string
}

export const conversationAnalyses = pgTable('conversation_analyses', {
  id: id(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' })
    .unique(),
  analysis: jsonb('analysis').$type<ConversationAnalysis>().notNull(),
  createdAt: createdAt(),
})

/* ========================================================================== */
/* Free production: writing & speaking                                        */
/* ========================================================================== */

export type ProductionEvaluation = {
  correctness: number
  naturalness: number
  vocabularyRange: number
  taskCompletion: number
  toneMatch?: number
  fluency?: number
  overallComment: string
  corrections: Array<{
    original: string
    corrected: string
    why: string
    severity: 'minor' | 'notable' | 'blocking'
    errorType: string
  }>
  betterPhrasings: Array<{ instead: string; say: string; why: string }>
  strengths: string[]
  phrasesToLearn: Array<{ text: string; translation: string; context: string }>
}

export const productionSubmissions = pgTable(
  'production_submissions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    lifeAreaId: text('life_area_id').references(() => lifeAreas.id, { onDelete: 'set null' }),
    mode: text('mode').$type<'writing' | 'speaking'>().notNull(),
    /** e.g. 'email' | 'whatsapp' | 'monologue' | 'answer'. */
    format: text('format').notNull(),
    prompt: text('prompt').notNull(),
    promptTranslation: text('prompt_translation'),
    /** Typed text, or the transcript for speech. */
    content: text('content').notNull(),
    /** Speech only. */
    durationSeconds: integer('duration_seconds'),
    evaluation: jsonb('evaluation').$type<ProductionEvaluation>(),
    createdAt: createdAt(),
  },
  (t) => [index('production_user_idx').on(t.userId, t.targetLanguageCode, t.createdAt)],
)

/* ========================================================================== */
/* Error memory                                                               */
/* ========================================================================== */

export const learnerErrors = pgTable(
  'learner_errors',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    /** Stable slug so occurrences merge: 'dative_accusative', 'verb_second'… */
    type: text('type').notNull(),
    category: text('category')
      .$type<'grammar' | 'vocabulary' | 'word_order' | 'pronunciation' | 'register' | 'literal_translation' | 'naturalness'>()
      .notNull(),
    label: text('label').notNull(),
    explanation: text('explanation').notNull(),
    frequency: integer('frequency').notNull().default(1),
    severity: text('severity').$type<'minor' | 'notable' | 'blocking'>().notNull().default('notable'),
    status: text('status').$type<'active' | 'improving' | 'resolved'>().notNull().default('active'),
    /** Consecutive correct uses of the pattern; 3+ flips status to resolved. */
    cleanStreak: integer('clean_streak').notNull().default(0),
    firstSeenAt: createdAt(),
    lastSeenAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('learner_errors_user_type_unique').on(t.userId, t.targetLanguageCode, t.type),
    index('learner_errors_user_status_idx').on(t.userId, t.targetLanguageCode, t.status),
  ],
)

export const errorOccurrences = pgTable(
  'error_occurrences',
  {
    id: id(),
    errorId: text('error_id')
      .notNull()
      .references(() => learnerErrors.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').$type<'writing' | 'speaking' | 'conversation' | 'review'>().notNull(),
    sourceId: text('source_id'),
    said: text('said').notNull(),
    corrected: text('corrected').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('error_occurrences_error_idx').on(t.errorId, t.createdAt)],
)

/* ========================================================================== */
/* Skills & progress                                                          */
/* ========================================================================== */

export type SkillCategory =
  | 'listening'
  | 'speaking'
  | 'reading'
  | 'writing'
  | 'vocabulary'
  | 'pronunciation'
  | 'confidence'

export const skills = pgTable(
  'skills',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    category: text('category').$type<SkillCategory>().notNull(),
    score: real('score').notNull().default(0), // 0–100
    /** How much evidence backs the score, 0–1. Low = "we're still guessing". */
    confidence: real('confidence').notNull().default(0.2),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('skills_user_category_unique').on(t.userId, t.targetLanguageCode, t.category)],
)

/** Append-only history so the dashboard can show real trends over weeks. */
export const progressSnapshots = pgTable(
  'progress_snapshots',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    kind: text('kind').$type<'skill' | 'life_area' | 'overall'>().notNull(),
    /** Skill category, life-area key, or 'overall'. */
    subject: text('subject').notNull(),
    value: real('value').notNull(),
    recordedAt: createdAt(),
  },
  (t) => [
    index('progress_snapshots_user_idx').on(t.userId, t.targetLanguageCode, t.subject, t.recordedAt),
  ],
)

/* ========================================================================== */
/* Assessment                                                                 */
/* ========================================================================== */

export const assessments = pgTable(
  'assessments',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    kind: text('kind').$type<'placement' | 'checkpoint'>().notNull().default('placement'),
    items: jsonb('items').$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
    responses: jsonb('responses').$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
    /** Per-dimension levels, never a single number (§8). */
    result: jsonb('result').$type<Record<string, unknown>>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('assessments_user_idx').on(t.userId, t.targetLanguageCode)],
)

/* ========================================================================== */
/* Missions                                                                   */
/* ========================================================================== */

export const missions = pgTable(
  'missions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    lifeAreaId: text('life_area_id').references(() => lifeAreas.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    /** What "done" looks like in the real world. */
    successCriteria: jsonb('success_criteria').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    tier: text('tier').$type<'beginner' | 'intermediate' | 'advanced'>().notNull(),
    /** Phrases worth having ready before attempting it. */
    preparationPhraseIds: jsonb('preparation_phrase_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status')
      .$type<'suggested' | 'accepted' | 'completed' | 'skipped'>()
      .notNull()
      .default('suggested'),
    /** Learner's own account of how it went — feeds readiness and the error model. */
    reflection: text('reflection'),
    selfRating: integer('self_rating'), // 1–5
    readinessDelta: real('readiness_delta'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('missions_user_idx').on(t.userId, t.targetLanguageCode, t.status)],
)

/* ========================================================================== */
/* Cross-domain fluency engine (§6)                                           */
/* ========================================================================== */

export const crossDomainItems = pgTable(
  'cross_domain_items',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    /** The two-or-more areas being bridged, e.g. ['work','fitness']. */
    lifeAreaKeys: jsonb('life_area_keys').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    kind: text('kind').$type<'bridge_phrase' | 'dialogue' | 'mini_story' | 'speaking_prompt'>().notNull(),
    /** The phrases it recombines — this is reinforcement, not new material. */
    sourcePhraseIds: jsonb('source_phrase_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('cross_domain_user_idx').on(t.userId, t.targetLanguageCode, t.createdAt)],
)

/* ========================================================================== */
/* Grammar (secondary, on request only — §17)                                 */
/* ========================================================================== */

export const grammarExplanations = pgTable(
  'grammar_explanations',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetLanguageCode: targetLanguage(),
    question: text('question').notNull(),
    /** The sentence that prompted the question, if any. */
    triggerText: text('trigger_text'),
    patternKey: text('pattern_key'),
    simple: text('simple').notNull(),
    detailed: text('detailed'),
    examples: jsonb('examples').$type<Array<{ text: string; translation: string; note?: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    comparison: text('comparison'),
    createdAt: createdAt(),
  },
  (t) => [index('grammar_user_idx').on(t.userId, t.targetLanguageCode, t.createdAt)],
)

/* ========================================================================== */
/* Future: real-world content ingestion (§22) — schema only for now           */
/* ========================================================================== */

export const contentSources = pgTable(
  'content_sources',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind')
      .$type<'youtube' | 'article' | 'podcast' | 'message' | 'document' | 'screenshot' | 'website'>()
      .notNull(),
    url: text('url'),
    title: text('title'),
    rawText: text('raw_text'),
    status: text('status')
      .$type<'pending' | 'processing' | 'ready' | 'failed'>()
      .notNull()
      .default('pending'),
    extracted: jsonb('extracted').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('content_sources_user_idx').on(t.userId)],
)

/* ========================================================================== */
/* AI observability                                                           */
/* ========================================================================== */

/** One row per LLM call: cost, latency, and what was sent — the privacy audit trail. */
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: id(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    engine: text('engine').notNull(),
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    ok: boolean('ok').notNull().default(true),
    error: text('error'),
    /** True when PII redaction ran before the request left the process. */
    redacted: boolean('redacted').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('ai_generations_user_idx').on(t.userId, t.createdAt)],
)

/* ========================================================================== */
/* Relations                                                                  */
/* ========================================================================== */

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(learnerProfiles, { fields: [users.id], references: [learnerProfiles.userId] }),
  lifeAreas: many(lifeAreas),
  goals: many(goals),
  roadmaps: many(roadmaps),
  userPhrases: many(userPhrases),
  sessions: many(learningSessions),
  conversations: many(conversations),
  errors: many(learnerErrors),
  skills: many(skills),
  missions: many(missions),
}))

export const learnerProfilesRelations = relations(learnerProfiles, ({ one }) => ({
  user: one(users, { fields: [learnerProfiles.userId], references: [users.id] }),
  targetLanguage: one(languages, {
    fields: [learnerProfiles.targetLanguageCode],
    references: [languages.code],
  }),
}))

export const lifeAreasRelations = relations(lifeAreas, ({ one, many }) => ({
  user: one(users, { fields: [lifeAreas.userId], references: [users.id] }),
  roadmaps: many(roadmaps),
  goals: many(goals),
}))

export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  lifeArea: one(lifeAreas, { fields: [goals.lifeAreaId], references: [lifeAreas.id] }),
  roadmaps: many(roadmaps),
}))

export const roadmapsRelations = relations(roadmaps, ({ one, many }) => ({
  user: one(users, { fields: [roadmaps.userId], references: [users.id] }),
  goal: one(goals, { fields: [roadmaps.goalId], references: [goals.id] }),
  lifeArea: one(lifeAreas, { fields: [roadmaps.lifeAreaId], references: [lifeAreas.id] }),
  stages: many(roadmapStages),
}))

export const roadmapStagesRelations = relations(roadmapStages, ({ one, many }) => ({
  roadmap: one(roadmaps, { fields: [roadmapStages.roadmapId], references: [roadmaps.id] }),
  objectives: many(roadmapObjectives),
}))

export const roadmapObjectivesRelations = relations(roadmapObjectives, ({ one }) => ({
  stage: one(roadmapStages, { fields: [roadmapObjectives.stageId], references: [roadmapStages.id] }),
}))

export const phrasesRelations = relations(phrases, ({ many }) => ({
  examples: many(phraseExamples),
  userPhrases: many(userPhrases),
}))

export const phraseExamplesRelations = relations(phraseExamples, ({ one }) => ({
  phrase: one(phrases, { fields: [phraseExamples.phraseId], references: [phrases.id] }),
}))

export const userPhrasesRelations = relations(userPhrases, ({ one }) => ({
  user: one(users, { fields: [userPhrases.userId], references: [users.id] }),
  phrase: one(phrases, { fields: [userPhrases.phraseId], references: [phrases.id] }),
}))

export const learningSessionsRelations = relations(learningSessions, ({ one, many }) => ({
  user: one(users, { fields: [learningSessions.userId], references: [users.id] }),
  lifeArea: one(lifeAreas, { fields: [learningSessions.lifeAreaId], references: [lifeAreas.id] }),
  activities: many(sessionActivities),
}))

export const sessionActivitiesRelations = relations(sessionActivities, ({ one }) => ({
  session: one(learningSessions, {
    fields: [sessionActivities.sessionId],
    references: [learningSessions.id],
  }),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  lifeArea: one(lifeAreas, { fields: [conversations.lifeAreaId], references: [lifeAreas.id] }),
  turns: many(conversationTurns),
  analysis: one(conversationAnalyses, {
    fields: [conversations.id],
    references: [conversationAnalyses.conversationId],
  }),
}))

export const conversationTurnsRelations = relations(conversationTurns, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationTurns.conversationId],
    references: [conversations.id],
  }),
}))

export const learnerErrorsRelations = relations(learnerErrors, ({ one, many }) => ({
  user: one(users, { fields: [learnerErrors.userId], references: [users.id] }),
  occurrences: many(errorOccurrences),
}))

export const errorOccurrencesRelations = relations(errorOccurrences, ({ one }) => ({
  error: one(learnerErrors, { fields: [errorOccurrences.errorId], references: [learnerErrors.id] }),
}))

export const missionsRelations = relations(missions, ({ one }) => ({
  user: one(users, { fields: [missions.userId], references: [users.id] }),
  lifeArea: one(lifeAreas, { fields: [missions.lifeAreaId], references: [lifeAreas.id] }),
}))

/* ========================================================================== */
/* Inferred row types                                                         */
/* ========================================================================== */

export type User = typeof users.$inferSelect
export type LearnerProfile = typeof learnerProfiles.$inferSelect
export type LifeArea = typeof lifeAreas.$inferSelect
export type Goal = typeof goals.$inferSelect
export type Roadmap = typeof roadmaps.$inferSelect
export type RoadmapStage = typeof roadmapStages.$inferSelect
export type RoadmapObjective = typeof roadmapObjectives.$inferSelect
export type Phrase = typeof phrases.$inferSelect
export type PhraseExample = typeof phraseExamples.$inferSelect
export type UserPhrase = typeof userPhrases.$inferSelect
export type LearningSession = typeof learningSessions.$inferSelect
export type SessionActivity = typeof sessionActivities.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type ConversationTurn = typeof conversationTurns.$inferSelect
export type ProductionSubmission = typeof productionSubmissions.$inferSelect
export type LearnerError = typeof learnerErrors.$inferSelect
export type Skill = typeof skills.$inferSelect
export type Mission = typeof missions.$inferSelect
export type CrossDomainItem = typeof crossDomainItems.$inferSelect
export type GrammarExplanation = typeof grammarExplanations.$inferSelect
export type Assessment = typeof assessments.$inferSelect
export type Language = typeof languages.$inferSelect
