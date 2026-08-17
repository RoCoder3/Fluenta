import 'server-only'

/**
 * Conversation engine (§11).
 *
 * The defining rule: the partner NEVER corrects mid-conversation. Real
 * conversations don't stop to fix your dative, and interrupting is what makes
 * learners freeze. All feedback is deferred to the analysis at the end.
 */

import { and, desc, eq } from 'drizzle-orm'

import { generateObject } from '@/server/ai/provider/registry'
import {
  conversationAnalysisSchema,
  conversationSetupSchema,
  conversationTurnSchema,
  type GeneratedConversationAnalysis,
} from '@/server/ai/schemas'
import { contentPackFor } from '@/server/content'
import { getDb } from '@/server/db'
import {
  conversationAnalyses,
  conversationTurns,
  conversations,
  lifeAreas,
  type Conversation,
  type ConversationAnalysis,
  type Persona,
} from '@/server/db/schema'
import { buildLearnerModel, type LearnerModel } from '@/server/learner/model'
import { teachPhrases } from '@/server/repositories/phrases'

import { recordErrors } from './feedback'
import { applySkillEvidence } from './progress'
import { learnerContext, learnerText, redactionTerms, tutorSystemPrompt } from './prompts'

/* -------------------------------------------------------------------------- */
/* Starting a conversation                                                    */
/* -------------------------------------------------------------------------- */

const SETUP_SYSTEM = `You set up a roleplay scenario.

The persona must be a specific person, not a generic "waiter". Give them a name, a manner, and a way of speaking. A brusque clerk who uses official vocabulary without explaining it is a useful training partner; a patient teacher pretending to be a clerk is not.

Match the register to the situation: a colleague is du, an official is Sie.

The opening line must be exactly what that person would really say to open this interaction — including regional greetings where appropriate.`

export async function startConversation(input: {
  userId: string
  scenarioKey?: string
  customSituation?: string
}): Promise<{ conversation: Conversation; openingTurnId: string }> {
  const db = await getDb()
  const model = await buildLearnerModel(input.userId)

  const template = contentPackFor(model.targetLanguageCode).scenarios.find(
    (s) => s.key === input.scenarioKey,
  )

  let scenarioTitle: string
  let situation: string
  let persona: Persona
  let difficulty: number
  let lifeAreaKey: string

  if (template && !input.customSituation) {
    // Known scenario: use the authored template, no generation needed.
    scenarioTitle = template.title
    situation = template.situation
    persona = template.persona
    difficulty = template.difficulty
    lifeAreaKey = template.lifeAreaKey
  } else {
    const result = await generateObject(
      {
        purpose: 'conversation.turn',
        system: tutorSystemPrompt(model, SETUP_SYSTEM),
        prompt: `${learnerContext(model, { phraseLimit: 15 })}

Set up a roleplay for this situation:
${input.customSituation ?? template?.situation ?? 'a situation drawn from the learner\'s highest-priority life area'}

Pitch the partner's difficulty at the learner's level — slightly above, not far above. They should have to work, not drown.`,
        schema: conversationSetupSchema,
        schemaName: 'conversation_setup',
        temperature: 0.8,
      },
      { userId: input.userId, engine: 'conversation', redactTerms: redactionTerms(model) },
    )

    scenarioTitle = result.data.scenarioTitle
    situation = result.data.situation
    persona = result.data.persona
    difficulty = 3
    lifeAreaKey = model.lifeAreas[0]?.key ?? 'daily_life'
  }

  const [area] = await db
    .select({ id: lifeAreas.id })
    .from(lifeAreas)
    .where(
      and(
        eq(lifeAreas.userId, input.userId),
        eq(lifeAreas.targetLanguageCode, model.targetLanguageCode),
        eq(lifeAreas.key, lifeAreaKey),
      ),
    )
    .limit(1)

  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: input.userId,
      targetLanguageCode: model.targetLanguageCode,
      lifeAreaId: area?.id ?? null,
      scenarioKey: input.scenarioKey ?? 'custom',
      scenarioTitle,
      situation,
      persona,
      difficulty,
    })
    .returning()

  if (!conversation) throw new Error('Failed to start conversation')

  const [opening] = await db
    .insert(conversationTurns)
    .values({
      conversationId: conversation.id,
      orderIndex: 0,
      role: 'partner',
      text: persona.openingLine,
    })
    .returning({ id: conversationTurns.id })

  return { conversation, openingTurnId: opening?.id ?? '' }
}

/* -------------------------------------------------------------------------- */
/* Taking a turn                                                              */
/* -------------------------------------------------------------------------- */

const TURN_SYSTEM = `You are playing a character in a roleplay with a language learner.

ABSOLUTE RULES:
- Stay in character. You are not a tutor right now.
- NEVER correct the learner's German. Not even gently. Not even once. If they make a mistake, respond to what they meant and move on, exactly as a real person would.
- NEVER break into English unless your character genuinely would.
- Do not praise them. A shopkeeper does not say "well done".
- Keep replies to the length a real person would use. Usually one or two sentences.
- React to what they actually said. If they said something odd, react as a real person would — mild confusion is realistic and instructive.
- Only set nudge when the learner has plainly stalled (empty, one confused word, or an explicit request for help). Not otherwise.
- Set shouldEnd true when the interaction has genuinely concluded.`

export async function takeTurn(input: {
  userId: string
  conversationId: string
  learnerMessage: string
  wasSpoken?: boolean
}): Promise<{ reply: string; translation: string; nudge?: string; shouldEnd: boolean }> {
  const db = await getDb()
  const model = await buildLearnerModel(input.userId)

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.userId)))
    .limit(1)

  if (!conversation) throw new Error('Conversation not found')

  const history = await db
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.conversationId, conversation.id))
    .orderBy(conversationTurns.orderIndex)

  const nextIndex = history.length

  await db.insert(conversationTurns).values({
    conversationId: conversation.id,
    orderIndex: nextIndex,
    role: 'learner',
    text: input.learnerMessage,
    wasSpoken: input.wasSpoken ?? false,
  })

  const transcript = history
    .map((t) => `${t.role === 'learner' ? 'Learner' : conversation.persona.name}: ${t.text}`)
    .join('\n')

  const result = await generateObject(
    {
      purpose: 'conversation.turn',
      system: tutorSystemPrompt(model, TURN_SYSTEM),
      prompt: `You are ${conversation.persona.name}, ${conversation.persona.role}.
Personality: ${conversation.persona.personality}
You address the learner with: ${conversation.persona.register}
Region: ${conversation.persona.region}

Situation: ${conversation.situation}

Conversation so far:
${transcript}

Learner just said:
${learnerText(input.learnerMessage)}

Reply in character.`,
      schema: conversationTurnSchema,
      schemaName: 'conversation_turn',
      temperature: 0.9,
      tier: 'fast',
      maxTokens: 1000,
    },
    { userId: input.userId, engine: 'conversation', redactTerms: redactionTerms(model) },
  )

  await db.insert(conversationTurns).values({
    conversationId: conversation.id,
    orderIndex: nextIndex + 1,
    role: 'partner',
    text: result.data.reply,
    translation: result.data.translation,
  })

  return result.data
}

/* -------------------------------------------------------------------------- */
/* Ending & analysis                                                          */
/* -------------------------------------------------------------------------- */

const ANALYSIS_SYSTEM = `You review a completed roleplay and give the learner a debrief.

This is the moment where correction is welcome — the conversation is over and nothing is being interrupted.

Structure:
- didWell: be specific. "You handled the unexpected question about your insurance card without freezing" beats "good job".
- mistakes: only what matters. Errors that would confuse a native, or that keep recurring. Give the natural version, then a short reason.
- naturalAlternatives: things that were correct but not what a native would say. This is usually the most valuable section for an intermediate learner.
- missingVocabulary: words they visibly needed and worked around.
- fluency and comprehension: honest 0–100 with a real comment.
- taskSuccess: did they accomplish the objective? This can be true even with messy German.
- nextStep: one concrete thing to do next.

errorType slugs must be consistent and reusable: dative_accusative, article_gender, verb_second, verb_final_subordinate, preposition_case, word_order, literal_translation, register_mismatch, tense_choice.`

export async function endConversation(input: {
  userId: string
  conversationId: string
}): Promise<GeneratedConversationAnalysis> {
  const db = await getDb()
  const model = await buildLearnerModel(input.userId)

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.userId)))
    .limit(1)

  if (!conversation) throw new Error('Conversation not found')

  const turns = await db
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.conversationId, conversation.id))
    .orderBy(conversationTurns.orderIndex)

  const transcript = turns
    .map((t) => `${t.role === 'learner' ? 'LEARNER' : conversation.persona.name.toUpperCase()}: ${t.text}`)
    .join('\n')

  const learnerTurns = turns.filter((t) => t.role === 'learner')

  const result = await generateObject(
    {
      purpose: 'conversation.analyze',
      system: tutorSystemPrompt(model, ANALYSIS_SYSTEM),
      prompt: `${learnerContext(model, { phraseLimit: 20 })}

Scenario: ${conversation.scenarioTitle}
Situation: ${conversation.situation}
Partner: ${conversation.persona.name} (${conversation.persona.role}, ${conversation.persona.register})

Full transcript:
${learnerText(transcript)}

The learner took ${learnerTurns.length} turn(s), ${learnerTurns.filter((t) => t.wasSpoken).length} of them spoken aloud.

Debrief them.`,
      schema: conversationAnalysisSchema,
      schemaName: 'conversation_analysis',
      temperature: 0.4,
      maxTokens: 4000,
    },
    { userId: input.userId, engine: 'conversation', redactTerms: redactionTerms(model) },
  )

  const analysis = result.data

  await db.insert(conversationAnalyses).values({
    conversationId: conversation.id,
    analysis: analysis as ConversationAnalysis,
  })

  await db
    .update(conversations)
    .set({ status: 'completed', endedAt: new Date() })
    .where(eq(conversations.id, conversation.id))

  // Mistakes made here go into the same error memory as writing feedback.
  await recordErrors({
    userId: input.userId,
    languageCode: model.targetLanguageCode,
    sourceType: 'conversation',
    sourceId: conversation.id,
    corrections: analysis.mistakes.map((m) => ({
      original: m.said,
      corrected: m.better,
      why: m.why,
      severity: m.severity,
      errorType: m.errorType,
    })),
  })

  await applySkillEvidence(input.userId, model.targetLanguageCode, {
    speaking: analysis.fluency.score,
    listening: analysis.comprehension.score,
    confidence: analysis.taskSuccess.achieved ? analysis.fluency.score + 10 : analysis.fluency.score - 5,
  })

  if (analysis.usefulPhrases.length) {
    await teachPhrases(
      input.userId,
      analysis.usefulPhrases.map((p) => ({
        text: p.text,
        translation: p.translation,
        context: p.context,
        register: 'neutral' as const,
        difficulty: 3,
        lifeAreaKeys: [conversation.scenarioKey],
        grammarPatterns: [],
        vocab: [],
        examples: [],
        languageCode: model.targetLanguageCode,
        translationLanguageCode: model.explanationLanguageCode,
      })),
      'conversation',
    )
  }

  return analysis
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function getConversation(conversationId: string, userId: string) {
  const db = await getDb()

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)

  if (!conversation) return null

  const [turns, analysisRows] = await Promise.all([
    db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(conversationTurns.orderIndex),
    db
      .select()
      .from(conversationAnalyses)
      .where(eq(conversationAnalyses.conversationId, conversationId))
      .limit(1),
  ])

  return { conversation, turns, analysis: analysisRows[0]?.analysis ?? null }
}

export async function listConversations(userId: string, limit = 20) {
  const db = await getDb()
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.startedAt))
    .limit(limit)
}

/** Scenario suggestions, ordered so the learner's weakest areas come first. */
export function suggestScenarios(model: LearnerModel) {
  const priority = new Map(model.lifeAreas.map((a) => [a.key, a.readiness]))
  return [...contentPackFor(model.targetLanguageCode).scenarios].sort((a, b) => {
    const ra = priority.get(a.lifeAreaKey) ?? 100
    const rb = priority.get(b.lifeAreaKey) ?? 100
    return ra - rb
  })
}
