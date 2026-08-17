'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import {
  assessments,
  learnerProfiles,
  lifeAreas,
  users,
  type LearningPreferences,
  type SelfAssessment,
} from '@/server/db/schema'
import { DEFAULT_LIFE_AREAS } from '@/server/content/german-corpus'
import { extractIntake, generateAssessment, generateInitialRoadmaps, scoreAssessment } from '@/server/engines/onboarding'
import { applySkillEvidence, recomputeAreaReadiness } from '@/server/engines/progress'
import { generateMissions } from '@/server/engines/tutor'
import { buildLearnerModel } from '@/server/learner/model'
import type { GeneratedAssessmentItems, GeneratedAssessmentResult, IntakeExtraction } from '@/server/ai/schemas'

/* -------------------------------------------------------------------------- */
/* Step 1 — language & reasons                                                */
/* -------------------------------------------------------------------------- */

export async function saveBasicsAction(input: {
  targetLanguageCode: string
  explanationLanguageCode: string
  nativeLanguageCode: string
  motivations: string[]
}): Promise<void> {
  const user = await requireUser()
  const db = await getDb()

  await db
    .insert(learnerProfiles)
    .values({
      userId: user.id,
      nativeLanguageCode: input.nativeLanguageCode,
      targetLanguageCode: input.targetLanguageCode,
      explanationLanguageCode: input.explanationLanguageCode,
      motivations: input.motivations,
    })
    .onConflictDoUpdate({
      target: learnerProfiles.userId,
      set: {
        nativeLanguageCode: input.nativeLanguageCode,
        targetLanguageCode: input.targetLanguageCode,
        explanationLanguageCode: input.explanationLanguageCode,
        motivations: input.motivations,
        updatedAt: new Date(),
      },
    })
}

/* -------------------------------------------------------------------------- */
/* Step 2 — free-text intake → structured profile (§7)                        */
/* -------------------------------------------------------------------------- */

export type IntakeResult = {
  extraction: IntakeExtraction
  suggestedAreas: Array<{ key: string; name: string; description: string; priority: number; subAreas: string[] }>
}

export async function processIntakeAction(rawIntake: string): Promise<IntakeResult> {
  const user = await requireUser()
  const db = await getDb()

  const [profile] = await db
    .select()
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, user.id))
    .limit(1)

  const extraction = await extractIntake({
    userId: user.id,
    rawIntake,
    motivations: profile?.motivations ?? [],
    targetLanguageCode: profile?.targetLanguageCode ?? 'de',
    explanationLanguageCode: profile?.explanationLanguageCode ?? 'en',
    userName: user.name,
  })

  await db
    .update(learnerProfiles)
    .set({
      rawIntake,
      motivationSummary: extraction.motivationSummary,
      city: extraction.city ?? null,
      country: extraction.country ?? null,
      regionPreference: extraction.regionPreference ?? null,
      profession: extraction.profession ?? null,
      industry: extraction.industry ?? null,
      interests: extraction.interests,
      dailyActivities: extraction.dailyActivities,
      estimatedLevel: extraction.estimatedLevel ?? 'A1',
      inferredFacts: extraction.inferredFacts.map((f) => ({
        fact: f.fact,
        confidence: f.confidence,
        source: 'intake',
        observedAt: new Date().toISOString(),
      })),
      updatedAt: new Date(),
    })
    .where(eq(learnerProfiles.userId, user.id))

  return { extraction, suggestedAreas: extraction.suggestedLifeAreas }
}

/* -------------------------------------------------------------------------- */
/* Step 3 — life areas (§4)                                                   */
/* -------------------------------------------------------------------------- */

export async function saveLifeAreasAction(
  areas: Array<{ key: string; name: string; description?: string; priority: number; subAreas: string[]; isCustom?: boolean }>,
): Promise<void> {
  const user = await requireUser()
  const db = await getDb()

  // Deactivate rather than delete, so historical phrases keep their area links.
  await db.update(lifeAreas).set({ isActive: false }).where(eq(lifeAreas.userId, user.id))

  for (const area of areas) {
    await db
      .insert(lifeAreas)
      .values({
        userId: user.id,
        key: area.key,
        name: area.name,
        description: area.description ?? null,
        priority: area.priority,
        isCustom: area.isCustom ?? !DEFAULT_LIFE_AREAS.some((d) => d.key === area.key),
        isActive: true,
        subAreas: area.subAreas.map((name) => ({ key: slug(name), name, readiness: 0 })),
      })
      .onConflictDoUpdate({
        target: [lifeAreas.userId, lifeAreas.key],
        set: {
          name: area.name,
          description: area.description ?? null,
          priority: area.priority,
          isActive: true,
          subAreas: area.subAreas.map((name) => ({ key: slug(name), name, readiness: 0 })),
          updatedAt: new Date(),
        },
      })
  }

  revalidatePath('/home')
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/* -------------------------------------------------------------------------- */
/* Step 4 — assessment (§8)                                                   */
/* -------------------------------------------------------------------------- */

export async function startAssessmentAction(): Promise<{ assessmentId: string; items: GeneratedAssessmentItems['items'] }> {
  const user = await requireUser()
  const db = await getDb()
  const model = await buildLearnerModel(user.id)

  const generated = await generateAssessment(model)

  const [row] = await db
    .insert(assessments)
    .values({ userId: user.id, kind: 'placement', items: generated.items })
    .returning({ id: assessments.id })

  if (!row) throw new Error('Failed to create assessment')
  return { assessmentId: row.id, items: generated.items }
}

export async function submitAssessmentAction(input: {
  assessmentId: string
  responses: Array<{ id: string; answer: string }>
  selfAssessment: SelfAssessment
}): Promise<GeneratedAssessmentResult> {
  const user = await requireUser()
  const db = await getDb()

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, input.assessmentId), eq(assessments.userId, user.id)))
    .limit(1)

  if (!assessment) throw new Error('Assessment not found')

  const model = await buildLearnerModel(user.id)
  const result = await scoreAssessment({
    model,
    items: assessment.items as GeneratedAssessmentItems['items'],
    responses: input.responses,
  })

  await db
    .update(assessments)
    .set({ responses: input.responses, result, completedAt: new Date() })
    .where(eq(assessments.id, assessment.id))

  await db
    .update(learnerProfiles)
    .set({ estimatedLevel: result.overallLevel, selfAssessment: input.selfAssessment, updatedAt: new Date() })
    .where(eq(learnerProfiles.userId, user.id))

  // Seed skill scores from the assessment, blending measured with self-reported.
  const dimensionScore = (name: string) =>
    result.dimensions.find((d) => d.dimension.toLowerCase().includes(name))?.score

  await applySkillEvidence(user.id, {
    reading: dimensionScore('reading') ?? input.selfAssessment.reading * 20,
    listening: dimensionScore('listening') ?? input.selfAssessment.listening * 20,
    speaking: dimensionScore('speaking') ?? input.selfAssessment.speaking * 20,
    writing: dimensionScore('writing') ?? input.selfAssessment.writing * 20,
    vocabulary: dimensionScore('vocabulary') ?? 30,
    confidence: input.selfAssessment.speaking * 20,
  })

  return result
}

/* -------------------------------------------------------------------------- */
/* Step 5 — finish: roadmaps, missions, done                                  */
/* -------------------------------------------------------------------------- */

export async function completeOnboardingAction(input: {
  preferences: LearningPreferences
  startingTier?: 'survival' | 'functional' | 'comfortable' | 'fluent'
}): Promise<void> {
  const user = await requireUser()
  const db = await getDb()

  await db
    .update(learnerProfiles)
    .set({ preferences: input.preferences, updatedAt: new Date() })
    .where(eq(learnerProfiles.userId, user.id))

  await generateInitialRoadmaps(user.id, input.startingTier ?? 'survival', 3)

  // Best-effort: neither should block the learner from reaching their dashboard.
  try {
    await generateMissions({ userId: user.id, count: 3 })
  } catch (error) {
    console.error('[onboarding] mission generation failed:', error)
  }

  try {
    await recomputeAreaReadiness(user.id)
  } catch (error) {
    console.error('[onboarding] readiness computation failed:', error)
  }

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date(), lastActiveAt: new Date() })
    .where(eq(users.id, user.id))

  revalidatePath('/home')
}
