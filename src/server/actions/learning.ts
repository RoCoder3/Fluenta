'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireUser } from '@/server/auth'
import { getActiveLanguage } from '@/server/learner/language'
import { getDb } from '@/server/db'
import { lifeAreas, sessionActivities } from '@/server/db/schema'
import type { GeneratedCrossDomain, GeneratedEvaluation } from '@/server/ai/schemas'
import { completeSession, createSession, generateCrossDomain } from '@/server/engines/content'
import { evaluateProduction, recordReviewError } from '@/server/engines/feedback'
import { recomputeAreaReadiness } from '@/server/engines/progress'
import { answerMatches, recordReview, type RecallMode, type ReviewGrade } from '@/server/engines/review'
import { buildLearnerModel } from '@/server/learner/model'

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export async function startSessionAction(input?: {
  lifeAreaKey?: string
  type?: 'daily' | 'focused' | 'review_only'
}): Promise<{ sessionId: string }> {
  const user = await requireUser()
  const built = await createSession({
    userId: user.id,
    lifeAreaKey: input?.lifeAreaKey,
    type: input?.type ?? 'daily',
  })
  revalidatePath('/home')
  return { sessionId: built.sessionId }
}

export async function completeSessionAction(sessionId: string): Promise<void> {
  const user = await requireUser()
  await completeSession(sessionId, user.id)
  await recomputeAreaReadiness(user.id, await getActiveLanguage(user.id))
  revalidatePath('/home')
  revalidatePath('/progress')
}

/** Stores an activity's response and any evaluation the client already has. */
export async function saveActivityResponseAction(input: {
  activityId: string
  response: Record<string, unknown>
  evaluation?: Record<string, unknown>
}): Promise<void> {
  const user = await requireUser()
  const db = await getDb()

  // Ownership check: activities are reachable only through the learner's own sessions.
  const { learningSessions } = await import('@/server/db/schema')
  const [row] = await db
    .select({ id: sessionActivities.id })
    .from(sessionActivities)
    .innerJoin(learningSessions, eq(learningSessions.id, sessionActivities.sessionId))
    .where(and(eq(sessionActivities.id, input.activityId), eq(learningSessions.userId, user.id)))
    .limit(1)

  if (!row) throw new Error('Activity not found')

  await db
    .update(sessionActivities)
    .set({
      response: input.response,
      evaluation: input.evaluation ?? null,
      completedAt: new Date(),
    })
    .where(eq(sessionActivities.id, input.activityId))
}

/* -------------------------------------------------------------------------- */
/* Review (§15)                                                               */
/* -------------------------------------------------------------------------- */

export type ReviewSubmission = {
  phraseId: string
  mode: RecallMode
  answer: string
  expected: string
  responseMs?: number
  /** Set for self-graded modes where there is nothing to string-match. */
  selfGrade?: ReviewGrade
}

export async function submitReviewAction(input: ReviewSubmission): Promise<{
  correct: boolean
  expected: string
  mastery: number
}> {
  const user = await requireUser()

  const correct = input.selfGrade
    ? input.selfGrade !== 'again'
    : answerMatches(input.answer, input.expected)

  const grade: ReviewGrade =
    input.selfGrade ??
    (!correct ? 'again' : input.responseMs && input.responseMs < 4000 ? 'easy' : 'good')

  const updated = await recordReview(user.id, {
    phraseId: input.phraseId,
    mode: input.mode,
    correct,
    grade,
    responseMs: input.responseMs,
  })

  // A missed recall is evidence for the error model too, not just the scheduler.
  if (!correct && input.answer.trim()) {
    await recordReviewError({
      userId: user.id,
      languageCode: await getActiveLanguage(user.id),
      said: input.answer,
      expected: input.expected,
    })
  }

  return { correct, expected: input.expected, mastery: updated?.mastery ?? 0 }
}

/* -------------------------------------------------------------------------- */
/* Writing & speaking (§12, §13)                                              */
/* -------------------------------------------------------------------------- */

export async function evaluateWritingAction(input: {
  prompt: string
  content: string
  format?: string
  lifeAreaKey?: string
  activityId?: string
}): Promise<GeneratedEvaluation> {
  const user = await requireUser()

  const { evaluation } = await evaluateProduction({
    userId: user.id,
    mode: 'writing',
    format: input.format ?? 'free_response',
    prompt: input.prompt,
    content: input.content,
    lifeAreaKey: input.lifeAreaKey,
  })

  if (input.activityId) {
    await saveActivityResponseAction({
      activityId: input.activityId,
      response: { text: input.content },
      evaluation: evaluation as unknown as Record<string, unknown>,
    })
  }

  revalidatePath('/progress')
  return evaluation
}

export async function evaluateSpeakingAction(input: {
  prompt: string
  transcript: string
  durationSeconds: number
  lifeAreaKey?: string
  activityId?: string
}): Promise<GeneratedEvaluation> {
  const user = await requireUser()

  const { evaluation } = await evaluateProduction({
    userId: user.id,
    mode: 'speaking',
    format: 'monologue',
    prompt: input.prompt,
    content: input.transcript,
    durationSeconds: input.durationSeconds,
    lifeAreaKey: input.lifeAreaKey,
  })

  if (input.activityId) {
    await saveActivityResponseAction({
      activityId: input.activityId,
      response: { transcript: input.transcript, durationSeconds: input.durationSeconds },
      evaluation: evaluation as unknown as Record<string, unknown>,
    })
  }

  revalidatePath('/progress')
  return evaluation
}

/* -------------------------------------------------------------------------- */
/* Cross-domain (§6)                                                          */
/* -------------------------------------------------------------------------- */

export async function generateCrossDomainAction(areaKeys?: [string, string]): Promise<GeneratedCrossDomain> {
  const user = await requireUser()
  const model = await buildLearnerModel(user.id)
  return generateCrossDomain({ model, areaKeys })
}

/* -------------------------------------------------------------------------- */
/* Life areas (§4)                                                            */
/* -------------------------------------------------------------------------- */

export async function updateLifeAreaAction(input: {
  areaId: string
  priority?: number
  isActive?: boolean
  name?: string
  description?: string
}): Promise<void> {
  const user = await requireUser()
  const db = await getDb()

  await db
    .update(lifeAreas)
    .set({
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(lifeAreas.id, input.areaId), eq(lifeAreas.userId, user.id)))

  revalidatePath('/home')
  revalidatePath('/progress')
}

export async function addLifeAreaAction(input: {
  name: string
  description?: string
  subAreas?: string[]
}): Promise<void> {
  const user = await requireUser()
  const db = await getDb()

  const key = `custom_${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`

  await db
    .insert(lifeAreas)
    .values({
      userId: user.id,
      targetLanguageCode: await getActiveLanguage(user.id),
      key,
      name: input.name,
      description: input.description ?? null,
      priority: 3,
      isCustom: true,
      subAreas: (input.subAreas ?? []).map((n) => ({ key: n.toLowerCase().replace(/\W+/g, '_'), name: n, readiness: 0 })),
    })
    .onConflictDoNothing()

  revalidatePath('/home')
}
