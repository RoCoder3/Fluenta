import 'server-only'

/**
 * Tutor-facing engines: grammar on request (§17), "what do I need to learn?"
 * (§23), missions (§21), and free-form tutor chat.
 */

import { and, desc, eq } from 'drizzle-orm'

import { generateObject } from '@/server/ai/provider/registry'
import {
  goalPlanSchema,
  grammarExplanationSchema,
  missionsSchema,
  tutorReplySchema,
  type GeneratedGoalPlan,
  type GeneratedGrammar,
  type GeneratedTutorReply,
} from '@/server/ai/schemas'
import { getDb } from '@/server/db'
import { goals, grammarExplanations, lifeAreas, missions, type Mission } from '@/server/db/schema'
import { buildLearnerModel, type LearnerModel } from '@/server/learner/model'
import { teachPhrases } from '@/server/repositories/phrases'

import { noteInferredFacts } from './feedback'
import { persistRoadmap } from './onboarding'
import { recomputeAreaReadiness } from './progress'
import { learnerContext, learnerText, redactionTerms, tutorSystemPrompt } from './prompts'

/* -------------------------------------------------------------------------- */
/* Grammar — only when asked (§17)                                            */
/* -------------------------------------------------------------------------- */

const GRAMMAR_SYSTEM = `The learner has explicitly asked for a grammar explanation. This is the one context where you may teach grammar directly — they asked, so give them a real answer.

Even here:
- Lead with the shortest true explanation that lets them use the pattern. That goes in "simple", and it is what they see first.
- Put the fuller treatment in "detailed", for those who want it.
- Examples must be sentences someone would actually say, drawn from this learner's life where possible.
- Use "comparison" when the confusion is really caused by their native language mapping badly onto the target. That is usually the actual explanation.
- Do not generate exercises. The learner asked why, not for homework.`

export async function explainGrammar(input: {
  userId: string
  question: string
  triggerText?: string
  depth?: 'simple' | 'detailed'
}): Promise<GeneratedGrammar> {
  const model = await buildLearnerModel(input.userId)

  const result = await generateObject(
    {
      purpose: 'grammar.explain',
      system: tutorSystemPrompt(model, GRAMMAR_SYSTEM),
      prompt: `${learnerContext(model, { includePhrases: false })}

The learner asks:
${learnerText(input.question)}

${input.triggerText ? `This came up while they were looking at:\n${input.triggerText}\n` : ''}
Their level is ${model.estimatedLevel} — pitch the explanation there, not at a linguist.`,
      schema: grammarExplanationSchema,
      schemaName: 'grammar_explanation',
      temperature: 0.4,
    },
    { userId: input.userId, engine: 'grammar', redactTerms: redactionTerms(model) },
  )

  const db = await getDb()
  await db.insert(grammarExplanations).values({
    userId: input.userId,
    question: input.question,
    triggerText: input.triggerText ?? null,
    patternKey: result.data.patternKey,
    simple: result.data.simple,
    detailed: result.data.detailed,
    examples: result.data.examples,
    comparison: result.data.comparison ?? null,
  })

  return result.data
}

export async function getGrammarHistory(userId: string, limit = 30) {
  const db = await getDb()
  return db
    .select()
    .from(grammarExplanations)
    .where(eq(grammarExplanations.userId, userId))
    .orderBy(desc(grammarExplanations.createdAt))
    .limit(limit)
}

/* -------------------------------------------------------------------------- */
/* "What do I need to learn?" (§23)                                           */
/* -------------------------------------------------------------------------- */

const GOAL_SYSTEM = `The learner has described something specific they need to be able to do — a trip, an interview, meeting a partner's family.

Work backwards from the event. What must they be able to understand and say to get through it without it going badly? Order by what would hurt most if missing.

Requirements:
- requiredSkills are concrete abilities, not topics. "Explain a gap in my CV" not "Professional vocabulary".
- starterPhrases are real sentences they can use immediately, with context.
- kind is "temporary" for a dated event, "permanent" for an ongoing ambition.
- The plan should be honest about time. If they have five days, do not design a six-week course.`

export async function planGoal(input: {
  userId: string
  request: string
  deadline?: Date | null
}): Promise<{ plan: GeneratedGoalPlan; goalId: string; roadmapId: string }> {
  const model = await buildLearnerModel(input.userId)
  const db = await getDb()

  const result = await generateObject(
    {
      purpose: 'goal.plan',
      system: tutorSystemPrompt(model, GOAL_SYSTEM),
      prompt: `${learnerContext(model, { phraseLimit: 20 })}

The learner says:
${learnerText(input.request)}

${input.deadline ? `Deadline: ${input.deadline.toISOString().slice(0, 10)} (today is ${new Date().toISOString().slice(0, 10)}).` : 'No deadline given.'}

Build their plan. Take into account what they already know — do not plan to teach them things the brief shows they can already do.`,
      schema: goalPlanSchema,
      schemaName: 'goal_plan',
      temperature: 0.6,
      maxTokens: 6000,
    },
    { userId: input.userId, engine: 'tutor', redactTerms: redactionTerms(model) },
  )

  const plan = result.data

  const [area] = await db
    .select({ id: lifeAreas.id })
    .from(lifeAreas)
    .where(and(eq(lifeAreas.userId, input.userId), eq(lifeAreas.key, plan.suggestedLifeAreaKey)))
    .limit(1)

  const [goal] = await db
    .insert(goals)
    .values({
      userId: input.userId,
      lifeAreaId: area?.id ?? null,
      title: plan.title,
      description: plan.goalStatement,
      kind: plan.kind,
      deadline: input.deadline ?? null,
      sourcePrompt: input.request,
    })
    .returning({ id: goals.id })

  if (!goal) throw new Error('Failed to create goal')

  // Turn the ordered plan into a real roadmap so it shows up alongside the rest.
  const roadmapId = await persistRoadmap({
    userId: input.userId,
    lifeAreaId: area?.id ?? null,
    goalId: goal.id,
    generated: {
      title: plan.title,
      summary: plan.goalStatement,
      stages: chunkIntoStages(plan),
    },
    startingTier: 'survival',
  })

  if (plan.starterPhrases.length) {
    await teachPhrases(
      input.userId,
      plan.starterPhrases.map((p) => ({
        ...p,
        languageCode: model.targetLanguageCode,
        translationLanguageCode: model.explanationLanguageCode,
      })),
      'lesson',
    )
  }

  return { plan, goalId: goal.id, roadmapId }
}

/**
 * A goal plan is a flat priority list; roadmaps want four tiers. Split by the
 * priority the model assigned, so the most urgent skills land in survival.
 */
function chunkIntoStages(plan: GeneratedGoalPlan) {
  const tiers = [
    { tier: 'survival', name: 'Non-negotiable', priorities: [1] },
    { tier: 'functional', name: 'Core', priorities: [2] },
    { tier: 'comfortable', name: 'Confident', priorities: [3] },
    { tier: 'fluent', name: 'Polished', priorities: [4, 5] },
  ] as const

  return tiers.map((t) => {
    const matching = plan.requiredSkills.filter((s) => (t.priorities as readonly number[]).includes(s.priority))
    return {
      name: t.name,
      tier: t.tier,
      description: matching.map((s) => s.why).join(' ') || 'Refinement once the essentials are solid.',
      objectives: matching.length
        ? matching.map((s) => ({ canDo: `I can ${lowerFirst(s.skill)}.` }))
        : [{ canDo: 'I can handle this situation without preparing every sentence in advance.' }],
    }
  })
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/* -------------------------------------------------------------------------- */
/* Missions (§21)                                                             */
/* -------------------------------------------------------------------------- */

const MISSION_SYSTEM = `You design real-world missions — things the learner does away from the screen, with actual people.

A mission is not an exercise. "Order a coffee entirely in German, and do not switch even if they answer in English" is a mission. "Practise ordering coffee" is not.

Requirements:
- Each mission must be achievable this week where the learner lives.
- successCriteria are observable: what would tell them it went well?
- Pitch difficulty to the learner's actual level. A beginner phoning a landlord is a setup for failure.
- preparationPhrases are the handful they should have ready first.`

export async function generateMissions(input: {
  userId: string
  lifeAreaKey?: string
  count?: number
}): Promise<Mission[]> {
  const model = await buildLearnerModel(input.userId)
  const db = await getDb()

  const area = input.lifeAreaKey
    ? model.lifeAreas.find((a) => a.key === input.lifeAreaKey)
    : [...model.lifeAreas].sort((a, b) => a.readiness - b.readiness)[0]

  const result = await generateObject(
    {
      purpose: 'mission.generate',
      system: tutorSystemPrompt(model, MISSION_SYSTEM),
      prompt: `${learnerContext(model, { phraseLimit: 25 })}

Design ${input.count ?? 3} missions${area ? ` for the "${area.name}" area (currently ${Math.round(area.readiness)}% ready)` : ''}.

Use the language they already know — a mission should feel like a stretch, not a wall. Where they live matters: use the shops, offices and situations that actually exist there.`,
      schema: missionsSchema,
      schemaName: 'missions',
      temperature: 0.85,
    },
    { userId: input.userId, engine: 'tutor', redactTerms: redactionTerms(model) },
  )

  const created: Mission[] = []

  for (const m of result.data.missions) {
    const [matchedArea] = await db
      .select({ id: lifeAreas.id })
      .from(lifeAreas)
      .where(and(eq(lifeAreas.userId, input.userId), eq(lifeAreas.key, m.lifeAreaKey)))
      .limit(1)

    const phrasesForMission = m.preparationPhrases.length
      ? await teachPhrases(
          input.userId,
          m.preparationPhrases.map((p) => ({
            text: p.text,
            translation: p.translation,
            context: `Preparation for: ${m.title}`,
            register: 'neutral' as const,
            difficulty: 2,
            lifeAreaKeys: [m.lifeAreaKey],
            grammarPatterns: [],
            vocab: [],
            examples: [],
            languageCode: model.targetLanguageCode,
            translationLanguageCode: model.explanationLanguageCode,
          })),
          'mission',
        )
      : []

    const [row] = await db
      .insert(missions)
      .values({
        userId: input.userId,
        lifeAreaId: matchedArea?.id ?? area?.id ?? null,
        title: m.title,
        description: m.description,
        successCriteria: m.successCriteria,
        tier: m.tier,
        preparationPhraseIds: phrasesForMission.map((p) => p.id),
      })
      .returning()

    if (row) created.push(row)
  }

  return created
}

export async function listMissions(userId: string): Promise<Mission[]> {
  const db = await getDb()
  return db
    .select()
    .from(missions)
    .where(eq(missions.userId, userId))
    .orderBy(desc(missions.createdAt))
}

export async function completeMission(input: {
  userId: string
  missionId: string
  reflection: string
  selfRating: number
}): Promise<void> {
  const db = await getDb()

  const [mission] = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, input.missionId), eq(missions.userId, input.userId)))
    .limit(1)

  if (!mission) return

  // Real-world completion is strong evidence, weighted by how it actually went.
  const delta = (input.selfRating / 5) * 12

  await db
    .update(missions)
    .set({
      status: 'completed',
      reflection: input.reflection,
      selfRating: input.selfRating,
      readinessDelta: delta,
      completedAt: new Date(),
    })
    .where(eq(missions.id, mission.id))

  if (mission.lifeAreaId) {
    await recomputeAreaReadiness(input.userId, mission.lifeAreaId)
  }
}

export async function updateMissionStatus(
  userId: string,
  missionId: string,
  status: 'accepted' | 'skipped',
): Promise<void> {
  const db = await getDb()
  await db
    .update(missions)
    .set({ status })
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
}

/* -------------------------------------------------------------------------- */
/* Free tutor chat                                                            */
/* -------------------------------------------------------------------------- */

const CHAT_SYSTEM = `You are the learner's personal language coach, answering a direct question.

Answer plainly and usefully. Give real target-language examples rather than talking about the language in the abstract.

If the exchange reveals something worth remembering about them — an interest, a situation coming up, a job change — record it in learnedAboutUser. Do not interrogate them for it; just notice what they volunteer.

Suggest an action only when there is an obviously useful next step.`

export async function tutorChat(input: {
  userId: string
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<GeneratedTutorReply> {
  const model = await buildLearnerModel(input.userId)

  const historyText = (input.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Learner' : 'You'}: ${m.content}`)
    .join('\n')

  const result = await generateObject(
    {
      purpose: 'tutor.chat',
      system: tutorSystemPrompt(model, CHAT_SYSTEM),
      prompt: `${learnerContext(model, { phraseLimit: 20 })}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
Learner says:
${learnerText(input.message)}`,
      schema: tutorReplySchema,
      schemaName: 'tutor_reply',
      temperature: 0.7,
      maxTokens: 2000,
    },
    { userId: input.userId, engine: 'tutor', redactTerms: redactionTerms(model) },
  )

  if (result.data.learnedAboutUser?.length) {
    await noteInferredFacts(
      input.userId,
      result.data.learnedAboutUser.map((fact) => ({ fact, confidence: 0.7 })),
      'tutor_chat',
    )
  }

  return result.data
}

export function tutorSuggestions(model: LearnerModel): string[] {
  const weakest = [...model.lifeAreas].sort((a, b) => a.readiness - b.readiness)[0]
  return [
    'I have a German job interview next Friday.',
    weakest ? `What should I focus on for ${weakest.name.toLowerCase()}?` : 'What should I focus on next?',
    'Why is it "zum Supermarkt" and not "zu dem Supermarkt"?',
    "I'm going to Berlin for three weeks.",
  ]
}
