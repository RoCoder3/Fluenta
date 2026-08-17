import 'server-only'

/**
 * Feedback engine (§12, §13) and Error Memory (§16).
 *
 * Corrections flow one way: evaluate output → extract stable error types →
 * merge into the persistent error model → future generation quietly includes
 * more correct examples of those patterns. At no point does this produce a
 * drill.
 */

import { and, eq, sql } from 'drizzle-orm'

import { generateObject } from '@/server/ai/provider/registry'
import { productionEvaluationSchema, type GeneratedEvaluation } from '@/server/ai/schemas'
import { getDb } from '@/server/db'
import {
  errorOccurrences,
  learnerErrors,
  lifeAreas,
  productionSubmissions,
  type ProductionEvaluation,
} from '@/server/db/schema'
import { teachPhrases } from '@/server/repositories/phrases'
import { buildLearnerModel, type LearnerModel } from '@/server/learner/model'

import { learnerContext, learnerText, redactionTerms, tutorSystemPrompt } from './prompts'
import { applySkillEvidence } from './progress'

const FEEDBACK_SYSTEM = `You evaluate language a learner produced.

Order of business, always:
1. What did they successfully communicate? Say that first and mean it.
2. What would stop a native understanding them, or make them sound unintentionally rude or strange? Fix that.
3. What is merely non-ideal? Mention at most a couple of these, and only if useful.

Rules:
- Do NOT correct everything. A wall of red is how learners stop writing.
- Give the natural version before any explanation.
- Explain in plain language. "You need the dative after 'mit'" is fine; a table of endings is not.
- Distinguish WRONG from UNNATURAL, and say which you mean. "Ich will einen Kaffee" is correct German that will make you sound abrupt — that belongs in betterPhrasings, not corrections.
- errorType must be a stable snake_case slug, because it is the key that merges repeat mistakes across weeks. Use consistent names: dative_accusative, article_gender, verb_second, verb_final_subordinate, preposition_case, word_order, literal_translation, register_mismatch, tense_choice, plural_form, separable_verb.
- taskCompletion asks whether they achieved the communicative goal, not whether the grammar was clean. Someone can complete the task with broken German.
- phrasesToLearn is for language they clearly reached for and did not have.`

/* -------------------------------------------------------------------------- */
/* Evaluating learner output                                                  */
/* -------------------------------------------------------------------------- */

export async function evaluateProduction(input: {
  userId: string
  mode: 'writing' | 'speaking'
  format: string
  prompt: string
  content: string
  lifeAreaKey?: string
  durationSeconds?: number
  /** Skip persistence when this is a mid-session activity the caller stores itself. */
  persist?: boolean
}): Promise<{ evaluation: GeneratedEvaluation; submissionId: string | null }> {
  const model = await buildLearnerModel(input.userId)
  const db = await getDb()

  const result = await generateObject(
    {
      purpose: input.mode === 'speaking' ? 'feedback.speaking' : 'feedback.writing',
      system: tutorSystemPrompt(model, FEEDBACK_SYSTEM),
      prompt: `${learnerContext(model, { phraseLimit: 20 })}

The learner was asked:
${input.prompt}

Mode: ${input.mode}${input.durationSeconds ? ` (${input.durationSeconds}s of speech)` : ''}
Format: ${input.format}

What they produced:
${learnerText(input.content)}

${input.mode === 'speaking' ? 'This is a transcript of speech, so ignore punctuation and capitalization entirely. Judge fluency by hesitation, restarts and sentence length — not by written conventions.' : ''}

Their recurring mistakes are listed above. If one of them shows up again, note it — the system tracks the pattern. If they avoided one they usually make, say so; that is real progress and worth naming.`,
      schema: productionEvaluationSchema,
      schemaName: 'production_evaluation',
      temperature: 0.4,
      maxTokens: 4000,
    },
    { userId: input.userId, engine: 'feedback', redactTerms: redactionTerms(model) },
  )

  const evaluation = result.data

  let submissionId: string | null = null
  if (input.persist !== false) {
    const area = input.lifeAreaKey
      ? (
          await db
            .select({ id: lifeAreas.id })
            .from(lifeAreas)
            .where(
              and(
                eq(lifeAreas.userId, input.userId),
                eq(lifeAreas.targetLanguageCode, model.targetLanguageCode),
                eq(lifeAreas.key, input.lifeAreaKey),
              ),
            )
            .limit(1)
        )[0]
      : null

    const [submission] = await db
      .insert(productionSubmissions)
      .values({
        userId: input.userId,
        targetLanguageCode: model.targetLanguageCode,
        lifeAreaId: area?.id ?? null,
        mode: input.mode,
        format: input.format,
        prompt: input.prompt,
        content: input.content,
        durationSeconds: input.durationSeconds ?? null,
        evaluation: evaluation as ProductionEvaluation,
      })
      .returning({ id: productionSubmissions.id })

    submissionId = submission?.id ?? null
  }

  // Everything downstream of the evaluation: error memory, skills, new phrases.
  await recordErrors({
    userId: input.userId,
    languageCode: model.targetLanguageCode,
    sourceType: input.mode,
    sourceId: submissionId,
    corrections: evaluation.corrections,
  })

  await noteCleanRun(
    input.userId,
    model.targetLanguageCode,
    evaluation.corrections.map((c) => c.errorType),
  )

  await applySkillEvidence(input.userId, model.targetLanguageCode, {
    [input.mode]: evaluation.correctness * 0.5 + evaluation.naturalness * 0.3 + evaluation.taskCompletion * 0.2,
    vocabulary: evaluation.vocabularyRange,
    ...(input.mode === 'speaking' && evaluation.fluency ? { confidence: evaluation.fluency } : {}),
  })

  if (evaluation.phrasesToLearn.length) {
    await teachPhrases(
      input.userId,
      evaluation.phrasesToLearn.map((p) => ({
        text: p.text,
        translation: p.translation,
        context: p.context,
        register: 'neutral' as const,
        difficulty: 3,
        lifeAreaKeys: input.lifeAreaKey ? [input.lifeAreaKey] : [],
        grammarPatterns: [],
        vocab: [],
        examples: [],
        languageCode: model.targetLanguageCode,
        translationLanguageCode: model.explanationLanguageCode,
      })),
      input.mode === 'speaking' ? 'conversation' : 'writing',
    )
  }

  return { evaluation, submissionId }
}

/* -------------------------------------------------------------------------- */
/* Error memory (§16)                                                         */
/* -------------------------------------------------------------------------- */

export type CorrectionLike = {
  original: string
  corrected: string
  why: string
  severity: 'minor' | 'notable' | 'blocking'
  errorType: string
}

/**
 * Merges corrections into the persistent error model. Repeat occurrences
 * increment a counter on one row rather than creating new rows — that counter
 * is what "you keep doing this" is built on.
 */
export async function recordErrors(input: {
  userId: string
  languageCode: string
  sourceType: 'writing' | 'speaking' | 'conversation' | 'review'
  sourceId: string | null
  corrections: CorrectionLike[]
}): Promise<void> {
  if (!input.corrections.length) return
  const db = await getDb()

  for (const correction of input.corrections) {
    const type = correction.errorType.trim().toLowerCase().replace(/\s+/g, '_')

    const [existing] = await db
      .select()
      .from(learnerErrors)
      .where(
        and(
          eq(learnerErrors.userId, input.userId),
          eq(learnerErrors.targetLanguageCode, input.languageCode),
          eq(learnerErrors.type, type),
        ),
      )
      .limit(1)

    let errorId: string

    if (existing) {
      await db
        .update(learnerErrors)
        .set({
          frequency: existing.frequency + 1,
          lastSeenAt: new Date(),
          status: 'active',
          cleanStreak: 0,
          // A pattern that keeps recurring is more serious than a one-off.
          severity: existing.frequency >= 4 ? 'blocking' : correction.severity,
        })
        .where(eq(learnerErrors.id, existing.id))
      errorId = existing.id
    } else {
      const [created] = await db
        .insert(learnerErrors)
        .values({
          userId: input.userId,
          targetLanguageCode: input.languageCode,
          type,
          category: categorize(type),
          label: labelFor(type),
          explanation: correction.why,
          severity: correction.severity,
        })
        .returning({ id: learnerErrors.id })
      if (!created) continue
      errorId = created.id
    }

    await db.insert(errorOccurrences).values({
      errorId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      said: correction.original,
      corrected: correction.corrected,
    })
  }
}

/**
 * Credits patterns the learner did NOT get wrong this time. Three clean runs
 * moves an error to `improving`, five to `resolved` — so the error list
 * reflects current reality instead of accumulating forever.
 */
async function noteCleanRun(
  userId: string,
  languageCode: string,
  errorTypesSeen: string[],
): Promise<void> {
  const db = await getDb()
  const active = await db
    .select()
    .from(learnerErrors)
    .where(
      and(
        eq(learnerErrors.userId, userId),
        eq(learnerErrors.targetLanguageCode, languageCode),
        sql`${learnerErrors.status} != 'resolved'`,
      ),
    )

  for (const error of active) {
    if (errorTypesSeen.includes(error.type)) continue

    const streak = error.cleanStreak + 1
    await db
      .update(learnerErrors)
      .set({
        cleanStreak: streak,
        status: streak >= 5 ? 'resolved' : streak >= 3 ? 'improving' : error.status,
      })
      .where(eq(learnerErrors.id, error.id))
  }
}

const CATEGORY_MAP: Record<string, ReturnType<typeof categorize>> = {
  dative_accusative: 'grammar',
  article_gender: 'grammar',
  preposition_case: 'grammar',
  plural_form: 'grammar',
  tense_choice: 'grammar',
  verb_second: 'word_order',
  verb_final_subordinate: 'word_order',
  word_order: 'word_order',
  separable_verb: 'word_order',
  literal_translation: 'literal_translation',
  register_mismatch: 'register',
  naturalness: 'naturalness',
  vocabulary_choice: 'vocabulary',
  pronunciation: 'pronunciation',
}

function categorize(
  type: string,
): 'grammar' | 'vocabulary' | 'word_order' | 'pronunciation' | 'register' | 'literal_translation' | 'naturalness' {
  return CATEGORY_MAP[type] ?? 'grammar'
}

function labelFor(type: string): string {
  return type
    .split('_')
    .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
    .join(' ')
}

export async function getErrorProfile(userId: string, languageCode: string) {
  const db = await getDb()

  const errors = await db
    .select()
    .from(learnerErrors)
    .where(
      and(eq(learnerErrors.userId, userId), eq(learnerErrors.targetLanguageCode, languageCode)),
    )
    .orderBy(sql`
      case ${learnerErrors.status} when 'active' then 0 when 'improving' then 1 else 2 end,
      ${learnerErrors.frequency} desc
    `)

  const withExamples = await Promise.all(
    errors.map(async (error) => {
      const occurrences = await db
        .select()
        .from(errorOccurrences)
        .where(eq(errorOccurrences.errorId, error.id))
        .orderBy(sql`${errorOccurrences.createdAt} desc`)
        .limit(3)
      return { ...error, occurrences }
    }),
  )

  return withExamples
}

/** Called when a review answer is wrong, so review failures feed the same model. */
export async function recordReviewError(input: {
  userId: string
  languageCode: string
  said: string
  expected: string
}): Promise<void> {
  await recordErrors({
    userId: input.userId,
    languageCode: input.languageCode,
    sourceType: 'review',
    sourceId: null,
    corrections: [
      {
        original: input.said,
        corrected: input.expected,
        why: 'Recalled incorrectly during review.',
        severity: 'minor',
        errorType: 'recall_gap',
      },
    ],
  })
}

/* -------------------------------------------------------------------------- */
/* Learner-model enrichment (§35)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Records something the system inferred about the learner from ordinary use —
 * an interest mentioned in passing, a situation they described. Building the
 * profile organically rather than by interrogation.
 */
export async function noteInferredFacts(
  userId: string,
  languageCode: string,
  facts: Array<{ fact: string; confidence: number }>,
  source: string,
): Promise<void> {
  if (!facts.length) return
  const db = await getDb()
  const { learnerProfiles } = await import('@/server/db/schema')

  const [profile] = await db
    .select({ inferredFacts: learnerProfiles.inferredFacts })
    .from(learnerProfiles)
    .where(
      and(eq(learnerProfiles.userId, userId), eq(learnerProfiles.targetLanguageCode, languageCode)),
    )
    .limit(1)

  if (!profile) return

  const existing = profile.inferredFacts ?? []
  const seen = new Set(existing.map((f) => f.fact.toLowerCase()))
  const additions = facts
    .filter((f) => f.confidence >= 0.5 && !seen.has(f.fact.toLowerCase()))
    .map((f) => ({ ...f, source, observedAt: new Date().toISOString() }))

  if (!additions.length) return

  await db
    .update(learnerProfiles)
    .set({ inferredFacts: [...existing, ...additions].slice(-60), updatedAt: new Date() })
    .where(
      and(eq(learnerProfiles.userId, userId), eq(learnerProfiles.targetLanguageCode, languageCode)),
    )
}
