import 'server-only'

/**
 * Onboarding engines: intake extraction, placement assessment, roadmap
 * generation (§7, §8, §5).
 */

import { and, eq } from 'drizzle-orm'

import { generateObject } from '@/server/ai/provider/registry'
import {
  assessmentItemsSchema,
  assessmentResultSchema,
  intakeExtractionSchema,
  roadmapSchema,
  type GeneratedAssessmentItems,
  type GeneratedAssessmentResult,
  type IntakeExtraction,
} from '@/server/ai/schemas'
import { getDb } from '@/server/db'
import {
  lifeAreas,
  roadmapObjectives,
  roadmapStages,
  roadmaps,
  type LifeArea,
} from '@/server/db/schema'
import { buildLearnerModel, type LearnerModel } from '@/server/learner/model'

import { learnerContext, learnerText, redactionTerms, tutorSystemPrompt } from './prompts'

/* -------------------------------------------------------------------------- */
/* Intake — free text → structure (§7)                                        */
/* -------------------------------------------------------------------------- */

export async function extractIntake(input: {
  userId: string
  rawIntake: string
  motivations: string[]
  targetLanguageCode: string
  explanationLanguageCode: string
  userName: string
}): Promise<IntakeExtraction> {
  const system = `${INTAKE_SYSTEM}

Target language: ${input.targetLanguageCode}. Explanations in: ${input.explanationLanguageCode}.`

  const prompt = `A new learner described their situation. Extract a structured profile.

Reasons they gave for needing the language: ${input.motivations.join(', ') || 'not specified'}

Their own words:
${learnerText(input.rawIntake)}

Rules:
- Infer only what is genuinely supported. Do not invent a profession or a city.
- Life areas must come from what THEY described, not from a standard list. If they mention dealing with authorities, that is a life area. If they mention nothing social, do not add "social life".
- Sub-areas should be concrete situations they will actually be in.
- Priority 1 is what they need soonest.`

  const result = await generateObject(
    {
      purpose: 'intake.extract',
      system,
      prompt,
      schema: intakeExtractionSchema,
      schemaName: 'learner_intake',
      schemaDescription: 'Structured profile extracted from a learner\'s free-text description.',
      temperature: 0.4,
    },
    { userId: input.userId, engine: 'onboarding', redactTerms: [input.userName] },
  )

  return result.data
}

const INTAKE_SYSTEM = `You extract structured learner profiles from free-text descriptions.

You are building the foundation of a personalized curriculum, so precision matters more than completeness. A wrong inference sends the learner down the wrong path for weeks.

Be concrete. "Work" is a weak life area; "explaining technical problems to colleagues in standups" is a useful one.`

/* -------------------------------------------------------------------------- */
/* Placement assessment (§8)                                                  */
/* -------------------------------------------------------------------------- */

export async function generateAssessment(model: LearnerModel): Promise<GeneratedAssessmentItems> {
  const result = await generateObject(
    {
      purpose: 'assessment.generate',
      system: tutorSystemPrompt(model, ASSESSMENT_SYSTEM),
      prompt: `${learnerContext(model, { includePhrases: false, includeErrors: false })}

Build a short adaptive placement test: 7 items total.

Coverage:
- 2 reading items (A1 and A2/B1)
- 2 listening items — put the spoken sentence in audioText; the app speaks it aloud
- 1 vocabulary/naturalness item that tests whether they can tell natural German from correct-but-odd German
- 1 comprehension item at B1/B2
- 1 free_production item asking them to write two or three sentences about something from their own life

Draw the content from the life areas above. A learner who needs work German should be tested on work German, not on describing a bedroom.

Keep it under four minutes.`,
      schema: assessmentItemsSchema,
      schemaName: 'assessment_items',
      temperature: 0.5,
    },
    { userId: model.userId, engine: 'onboarding', redactTerms: redactionTerms(model) },
  )

  return result.data
}

const ASSESSMENT_SYSTEM = `You write short placement assessments.

The goal is a useful *profile*, not a score. It matters more to find out that someone reads well and freezes when speaking than to pin them to a CEFR letter.

Never test obscure vocabulary. Test whether they can handle language they will actually meet.`

export async function scoreAssessment(input: {
  model: LearnerModel
  items: GeneratedAssessmentItems['items']
  responses: Array<{ id: string; answer: string }>
}): Promise<GeneratedAssessmentResult> {
  const transcript = input.items
    .map((item) => {
      const given = input.responses.find((r) => r.id === item.id)?.answer ?? '(no answer)'
      return `[${item.skill} · ${item.level}] ${item.prompt}\n  expected: ${item.answer ?? '(open)'}\n  learner:  ${given}`
    })
    .join('\n\n')

  const result = await generateObject(
    {
      purpose: 'assessment.score',
      system: tutorSystemPrompt(input.model, ASSESSMENT_SYSTEM),
      prompt: `${learnerContext(input.model, { includePhrases: false, includeErrors: false })}

Assessment results:

${transcript}

Produce a per-dimension profile. Do not collapse everything into one CEFR level — report reading, listening, speaking, writing and vocabulary separately, plus a level for each of the learner's life areas where you have evidence.

Judge the free-production answer for what it shows about their real production ability, and be honest. If they wrote three simple correct sentences, that is A2 production, not B1.

biggestGap should be the single most useful sentence you could tell this person about their own German.`,
      schema: assessmentResultSchema,
      schemaName: 'assessment_result',
      temperature: 0.3,
    },
    { userId: input.model.userId, engine: 'onboarding', redactTerms: redactionTerms(input.model) },
  )

  return result.data
}

/* -------------------------------------------------------------------------- */
/* Roadmap generation (§5)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds a roadmap for one life area. Stages already within the learner's
 * demonstrated ability are marked `skipped` rather than forcing them through
 * material they have proven they don't need (§5).
 */
export async function generateRoadmapForArea(input: {
  model: LearnerModel
  lifeArea: LifeArea
  startingTier?: 'survival' | 'functional' | 'comfortable' | 'fluent'
}): Promise<string> {
  const { model, lifeArea } = input

  const result = await generateObject(
    {
      purpose: 'roadmap.generate',
      system: tutorSystemPrompt(model, ROADMAP_SYSTEM),
      prompt: `${learnerContext(model, { phraseLimit: 15 })}

Build the roadmap to functional fluency for this life area:

Area: ${lifeArea.name} (${lifeArea.key})
What it means for them: ${lifeArea.description ?? '(not specified)'}
Situations inside it: ${lifeArea.subAreas.map((s) => s.name).join(', ') || '(none listed)'}

The question every stage answers is: "what do I need to understand and say to function comfortably here?"

Requirements:
- Exactly four stages: survival, functional, comfortable, fluent.
- Every objective is a first-person can-do statement describing a real ability, not a topic. "I can explain why a deployment failed" — not "Technical vocabulary".
- Objectives must be specific to THIS person's situation. A software developer in Zurich needs different work German than a hotel receptionist in Vienna.
- 3 to 6 objectives per stage.`,
      schema: roadmapSchema,
      schemaName: 'roadmap',
      temperature: 0.6,
    },
    { userId: model.userId, engine: 'roadmap', redactTerms: redactionTerms(model) },
  )

  return persistRoadmap({
    userId: model.userId,
    lifeAreaId: lifeArea.id,
    generated: result.data,
    startingTier: input.startingTier ?? 'survival',
  })
}

const ROADMAP_SYSTEM = `You design roadmaps toward functional fluency in one area of someone's life.

This is not a CEFR course. A1→B2 is irrelevant here. The organizing question is always: what does this person need to be able to do, in this specific part of their life, to stop struggling?

Stages mean:
- survival: can get the basic thing done, awkwardly
- functional: can handle it reliably, including when it goes off-script
- comfortable: no longer rehearsing sentences in advance
- fluent: full speed, including humour, disagreement and nuance`

export async function persistRoadmap(input: {
  userId: string
  lifeAreaId: string | null
  goalId?: string | null
  generated: { title: string; summary: string; stages: Array<{ name: string; tier: string; description: string; objectives: Array<{ canDo: string }> }> }
  startingTier?: string
}): Promise<string> {
  const db = await getDb()

  const [roadmap] = await db
    .insert(roadmaps)
    .values({
      userId: input.userId,
      lifeAreaId: input.lifeAreaId,
      goalId: input.goalId ?? null,
      title: input.generated.title,
      summary: input.generated.summary,
    })
    .returning()

  if (!roadmap) throw new Error('Failed to create roadmap')

  const tierOrder = ['survival', 'functional', 'comfortable', 'fluent']
  const startIndex = Math.max(0, tierOrder.indexOf(input.startingTier ?? 'survival'))

  for (const [index, stage] of input.generated.stages.entries()) {
    const tierIndex = tierOrder.indexOf(stage.tier)

    // Anything below the demonstrated starting level is skipped, not locked —
    // the learner has already shown they don't need it.
    const status =
      tierIndex < startIndex
        ? ('skipped' as const)
        : tierIndex === startIndex
          ? ('in_progress' as const)
          : ('locked' as const)

    const [created] = await db
      .insert(roadmapStages)
      .values({
        roadmapId: roadmap.id,
        orderIndex: index,
        name: stage.name,
        tier: stage.tier as 'survival' | 'functional' | 'comfortable' | 'fluent',
        description: stage.description,
        status,
        progress: status === 'skipped' ? 100 : 0,
      })
      .returning()

    if (!created) continue

    await db.insert(roadmapObjectives).values(
      stage.objectives.map((o, i) => ({
        stageId: created.id,
        orderIndex: i,
        canDo: o.canDo,
        status: status === 'skipped' ? ('mastered' as const) : ('not_started' as const),
      })),
    )
  }

  return roadmap.id
}

/**
 * Generates roadmaps for a learner's top areas. Called once at the end of
 * onboarding; additional areas get roadmaps lazily when first opened.
 */
export async function generateInitialRoadmaps(
  userId: string,
  startingTier: 'survival' | 'functional' | 'comfortable' | 'fluent' = 'survival',
  limit = 3,
): Promise<number> {
  const db = await getDb()
  const model = await buildLearnerModel(userId)

  const areas = await db
    .select()
    .from(lifeAreas)
    .where(and(eq(lifeAreas.userId, userId), eq(lifeAreas.isActive, true)))
    .orderBy(lifeAreas.priority)
    .limit(limit)

  let created = 0
  for (const area of areas) {
    const existing = await db
      .select({ id: roadmaps.id })
      .from(roadmaps)
      .where(and(eq(roadmaps.userId, userId), eq(roadmaps.lifeAreaId, area.id), eq(roadmaps.status, 'active')))
      .limit(1)

    if (existing.length) continue

    try {
      await generateRoadmapForArea({ model, lifeArea: area, startingTier })
      created++
    } catch (error) {
      // One failed roadmap must not block onboarding; it regenerates on demand.
      console.error(`[roadmap] failed for area ${area.key}:`, error)
    }
  }

  return created
}
