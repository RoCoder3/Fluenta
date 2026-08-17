import 'server-only'

/**
 * Content engine (§18) and Cross-Domain Fluency engine (§6).
 *
 * Generation is always conditioned on the full learner model, so material is
 * built from the learner's real life rather than from a topic list.
 */

import { and, desc, eq } from 'drizzle-orm'

import { generateObject } from '@/server/ai/provider/registry'
import { crossDomainSchema, lessonSchema, type GeneratedCrossDomain, type GeneratedLesson } from '@/server/ai/schemas'
import { getDb } from '@/server/db'
import {
  crossDomainItems,
  learningSessions,
  lifeAreas,
  sessionActivities,
  type ActivityKind,
  type SessionPlanStep,
} from '@/server/db/schema'
import { teachPhrases } from '@/server/repositories/phrases'
import { buildLearnerModel, type LearnerModel } from '@/server/learner/model'
import { getDueItems, buildReviewQuestion } from './review'
import { learnerContext, redactionTerms, tutorSystemPrompt } from './prompts'

/* -------------------------------------------------------------------------- */
/* Lesson generation                                                          */
/* -------------------------------------------------------------------------- */

const LESSON_SYSTEM = `You build a single learning session.

Session shape, always in this order: input → comprehension → expansion → output.

Hard requirements:
- The dialogue must be something that could genuinely be overheard in the learner's life. Use their city, their job, their interests.
- Every phrase must be one a native would actually say, with the situation attached.
- Reuse language the learner already knows — the brief lists it. Recombining known material in a new situation is more valuable than piling on new material.
- Weave in the learner's recurring mistakes as CORRECT examples in context. Do not comment on them, do not drill them. Exposure, not instruction.
- Production prompts must ask for real communication ("tell a colleague what you have on today"), never for grammar manipulation.
- 4 to 6 new phrases maximum. Depth over volume.`

export async function generateLesson(input: {
  model: LearnerModel
  lifeAreaKey?: string
  objective?: string
}): Promise<GeneratedLesson> {
  const { model } = input
  const area =
    model.lifeAreas.find((a) => a.key === input.lifeAreaKey) ??
    model.lifeAreas.find((a) => a.key === model.currentFocus.lifeAreaKey) ??
    model.lifeAreas[0]

  const objective = input.objective ?? model.currentFocus.objectives[0] ?? null

  const result = await generateObject(
    {
      purpose: 'content.lesson',
      system: tutorSystemPrompt(model, LESSON_SYSTEM),
      prompt: `${learnerContext(model, { phraseLimit: 30 })}

Build today's session.

Life area: ${area?.name ?? 'everyday life'} (${area?.key ?? 'daily_life'})
${objective ? `Objective being worked toward: ${objective}` : 'No specific objective — build general capability in this area.'}
Level: ${model.estimatedLevel}

The learner has ${model.phraseCounts.total} phrases in their collection and ${model.phraseCounts.due} due for review.
${model.recentActivity.sessionsLast14Days === 0 ? 'This is their first session — make the dialogue immediately useful and not too long.' : ''}

Make the rationale one honest sentence about why this material, for this person, right now.`,
      schema: lessonSchema,
      schemaName: 'lesson',
      temperature: 0.8,
      maxTokens: 8000,
    },
    { userId: model.userId, engine: 'content', redactTerms: redactionTerms(model) },
  )

  return result.data
}

/* -------------------------------------------------------------------------- */
/* Session assembly                                                           */
/* -------------------------------------------------------------------------- */

export type BuiltSession = {
  sessionId: string
  title: string
  activities: Array<{ id: string; kind: ActivityKind; payload: Record<string, unknown> }>
}

/**
 * Creates a session and materializes its activities.
 *
 * Review comes first when items are due — reviewing before new input is what
 * makes the new material land on something solid.
 */
export async function createSession(input: {
  userId: string
  lifeAreaKey?: string
  type?: 'daily' | 'focused' | 'review_only' | 'cross_domain'
  minutes?: number
}): Promise<BuiltSession> {
  const db = await getDb()
  const model = await buildLearnerModel(input.userId)
  const type = input.type ?? 'daily'

  const area = input.lifeAreaKey
    ? model.lifeAreas.find((a) => a.key === input.lifeAreaKey)
    : model.lifeAreas.find((a) => a.key === model.currentFocus.lifeAreaKey) ?? model.lifeAreas[0]

  const dueItems = await getDueItems(input.userId, type === 'review_only' ? 15 : 5)

  const activities: Array<{ kind: ActivityKind; payload: Record<string, unknown> }> = []
  const plan: SessionPlanStep[] = []

  if (dueItems.length) {
    activities.push({
      kind: 'review',
      payload: {
        items: dueItems.map((item) => ({ ...item, question: buildReviewQuestion(item) })),
      },
    })
    plan.push({ kind: 'review', title: `Review ${dueItems.length} phrases`, estimatedSeconds: dueItems.length * 20 })
  }

  let title = 'Review session'

  if (type !== 'review_only') {
    const lesson = await generateLesson({ model, lifeAreaKey: area?.key })
    title = lesson.title

    activities.push({ kind: 'dialogue', payload: { ...lesson.dialogue, rationale: lesson.rationale } })
    plan.push({ kind: 'dialogue', title: 'Listen and read', estimatedSeconds: 120 })

    activities.push({ kind: 'comprehension', payload: { ...lesson.comprehension } })
    plan.push({ kind: 'comprehension', title: 'Check understanding', estimatedSeconds: 90 })

    // Persist new phrases immediately so they enter the review queue even if
    // the learner abandons the session partway through.
    const taught = await teachPhrases(
      input.userId,
      lesson.phrases.map((p) => ({ ...p, languageCode: model.targetLanguageCode, translationLanguageCode: model.explanationLanguageCode })),
      'lesson',
    )
    activities.push({
      kind: 'phrase_intro',
      payload: { phrases: lesson.phrases, phraseIds: taught.map((p) => p.id) },
    })
    plan.push({ kind: 'phrase_intro', title: `Learn ${lesson.phrases.length} phrases`, estimatedSeconds: lesson.phrases.length * 30 })

    if (lesson.expansionPhrases.length) {
      const expanded = await teachPhrases(
        input.userId,
        lesson.expansionPhrases.map((p) => ({ ...p, languageCode: model.targetLanguageCode, translationLanguageCode: model.explanationLanguageCode })),
        'lesson',
      )
      activities.push({
        kind: 'expansion',
        payload: { phrases: lesson.expansionPhrases, phraseIds: expanded.map((p) => p.id) },
      })
      plan.push({ kind: 'expansion', title: 'Related ways to say it', estimatedSeconds: 60 })
    }

    for (const prompt of lesson.productionPrompts) {
      const kind: ActivityKind = prompt.mode === 'speaking' ? 'production_spoken' : 'production_written'
      activities.push({ kind, payload: { ...prompt, lifeAreaKey: area?.key } })
      plan.push({ kind, title: prompt.mode === 'speaking' ? 'Speak' : 'Write', estimatedSeconds: 150 })
    }
  }

  const [session] = await db
    .insert(learningSessions)
    .values({
      userId: input.userId,
      lifeAreaId: area?.id ?? null,
      type,
      title,
      plan,
      status: 'in_progress',
    })
    .returning()

  if (!session) throw new Error('Failed to create session')

  const created = await db
    .insert(sessionActivities)
    .values(
      activities.map((a, i) => ({
        sessionId: session.id,
        orderIndex: i,
        kind: a.kind,
        payload: a.payload,
      })),
    )
    .returning()

  return {
    sessionId: session.id,
    title: session.title,
    activities: created
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((a) => ({ id: a.id, kind: a.kind, payload: a.payload })),
  }
}

/* -------------------------------------------------------------------------- */
/* Cross-domain fluency (§6)                                                  */
/* -------------------------------------------------------------------------- */

const CROSS_DOMAIN_SYSTEM = `You run the Cross-Domain Fluency engine.

The learner has been learning language inside separate areas of life. Your job is to break those walls down, because real conversation does not respect them — people talk about work and dinner and the gym in one breath.

Method:
1. Take phrases the learner ALREADY KNOWS from two or more different areas.
2. Recombine them into new, natural sentences that could only be said by someone living this specific life.
3. Introduce as little new language as possible. This is reinforcement through recombination, not a new lesson.

The output should make the learner think: "I didn't know I could already say that."`

export async function generateCrossDomain(input: {
  model: LearnerModel
  areaKeys?: [string, string]
}): Promise<GeneratedCrossDomain> {
  const { model } = input
  const pair = input.areaKeys ?? model.bridgeCandidates[0]

  if (!pair) {
    throw new Error('Not enough material across areas to build a bridge yet')
  }

  const [a, b] = pair
  const phrasesA = model.knownPhrases.filter((p) => p.lifeAreaKeys.includes(a)).slice(0, 10)
  const phrasesB = model.knownPhrases.filter((p) => p.lifeAreaKeys.includes(b)).slice(0, 10)

  const result = await generateObject(
    {
      purpose: 'crossdomain.generate',
      system: tutorSystemPrompt(model, CROSS_DOMAIN_SYSTEM),
      prompt: `${learnerContext(model, { includePhrases: false })}

Bridge these two areas of the learner's life:

## ${a}
${phrasesA.map((p) => `- ${p.text}`).join('\n') || '(nothing yet)'}

## ${b}
${phrasesB.map((p) => `- ${p.text}`).join('\n') || '(nothing yet)'}

Build sentences that combine language from both. Then write a short mini-story (4–8 sentences) about a plausible day in this person's life that reuses as much of the above as possible.

Every bridge phrase must list which known phrases it was built from.`,
      schema: crossDomainSchema,
      schemaName: 'cross_domain',
      temperature: 0.85,
    },
    { userId: model.userId, engine: 'crossdomain', redactTerms: redactionTerms(model) },
  )

  const db = await getDb()
  await db.insert(crossDomainItems).values({
    userId: model.userId,
    lifeAreaKeys: [a, b],
    kind: 'bridge_phrase',
    sourcePhraseIds: [...phrasesA, ...phrasesB].map((p) => p.id),
    content: result.data as unknown as Record<string, unknown>,
  })

  return result.data
}

export async function getRecentCrossDomain(userId: string, limit = 5) {
  const db = await getDb()
  return db
    .select()
    .from(crossDomainItems)
    .where(eq(crossDomainItems.userId, userId))
    .orderBy(desc(crossDomainItems.createdAt))
    .limit(limit)
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export async function completeSession(sessionId: string, userId: string): Promise<void> {
  const db = await getDb()

  const [session] = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
    .limit(1)

  if (!session || session.status === 'completed') return

  const activities = await db
    .select()
    .from(sessionActivities)
    .where(eq(sessionActivities.sessionId, sessionId))

  // Roll up whatever evaluations the activities produced into per-skill scores.
  const performance: Record<string, number[]> = {}
  for (const activity of activities) {
    const evaluation = activity.evaluation as Record<string, number> | null
    if (!evaluation) continue
    const skill =
      activity.kind === 'production_spoken'
        ? 'speaking'
        : activity.kind === 'production_written'
          ? 'writing'
          : activity.kind === 'comprehension'
            ? 'listening'
            : 'vocabulary'
    const score = evaluation.correctness ?? evaluation.score
    if (typeof score === 'number') {
      performance[skill] = [...(performance[skill] ?? []), score]
    }
  }

  const averaged = Object.fromEntries(
    Object.entries(performance).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]),
  )

  await db
    .update(learningSessions)
    .set({
      status: 'completed',
      completedAt: new Date(),
      durationSeconds: Math.round((Date.now() - session.startedAt.getTime()) / 1000),
      performance: averaged,
    })
    .where(eq(learningSessions.id, sessionId))
}

export async function getSession(sessionId: string, userId: string) {
  const db = await getDb()
  const [session] = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
    .limit(1)

  if (!session) return null

  const activities = await db
    .select()
    .from(sessionActivities)
    .where(eq(sessionActivities.sessionId, sessionId))
    .orderBy(sessionActivities.orderIndex)

  const area = session.lifeAreaId
    ? (await db.select().from(lifeAreas).where(eq(lifeAreas.id, session.lifeAreaId)).limit(1))[0]
    : null

  return { session, activities, area }
}
