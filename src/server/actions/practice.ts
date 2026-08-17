'use server'

import { revalidatePath } from 'next/cache'

import type {
  GeneratedConversationAnalysis,
  GeneratedGoalPlan,
  GeneratedGrammar,
  GeneratedTutorReply,
} from '@/server/ai/schemas'
import { requireUser } from '@/server/auth'
import { endConversation, startConversation, takeTurn } from '@/server/engines/conversation'
import { recomputeAreaReadiness } from '@/server/engines/progress'
import {
  completeMission,
  explainGrammar,
  generateMissions,
  planGoal,
  tutorChat,
  updateMissionStatus,
} from '@/server/engines/tutor'
import { toggleFavorite } from '@/server/repositories/phrases'

/* -------------------------------------------------------------------------- */
/* Conversation (§11)                                                         */
/* -------------------------------------------------------------------------- */

export async function startConversationAction(input: {
  scenarioKey?: string
  customSituation?: string
}): Promise<{ conversationId: string }> {
  const user = await requireUser()
  const { conversation } = await startConversation({
    userId: user.id,
    scenarioKey: input.scenarioKey,
    customSituation: input.customSituation,
  })
  return { conversationId: conversation.id }
}

export async function sendConversationTurnAction(input: {
  conversationId: string
  message: string
  wasSpoken?: boolean
}): Promise<{ reply: string; translation: string; nudge?: string; shouldEnd: boolean }> {
  const user = await requireUser()
  return takeTurn({
    userId: user.id,
    conversationId: input.conversationId,
    learnerMessage: input.message,
    wasSpoken: input.wasSpoken,
  })
}

export async function endConversationAction(conversationId: string): Promise<GeneratedConversationAnalysis> {
  const user = await requireUser()
  const analysis = await endConversation({ userId: user.id, conversationId })
  await recomputeAreaReadiness(user.id)
  revalidatePath('/progress')
  return analysis
}

/* -------------------------------------------------------------------------- */
/* Missions (§21)                                                             */
/* -------------------------------------------------------------------------- */

export async function generateMissionsAction(lifeAreaKey?: string): Promise<void> {
  const user = await requireUser()
  await generateMissions({ userId: user.id, lifeAreaKey, count: 3 })
  revalidatePath('/missions')
}

export async function completeMissionAction(input: {
  missionId: string
  reflection: string
  selfRating: number
}): Promise<void> {
  const user = await requireUser()
  await completeMission({ userId: user.id, ...input })
  revalidatePath('/missions')
  revalidatePath('/progress')
  revalidatePath('/home')
}

export async function updateMissionStatusAction(
  missionId: string,
  status: 'accepted' | 'skipped',
): Promise<void> {
  const user = await requireUser()
  await updateMissionStatus(user.id, missionId, status)
  revalidatePath('/missions')
}

/* -------------------------------------------------------------------------- */
/* Grammar, on request only (§17)                                             */
/* -------------------------------------------------------------------------- */

export async function explainGrammarAction(input: {
  question: string
  triggerText?: string
}): Promise<GeneratedGrammar> {
  const user = await requireUser()
  const explanation = await explainGrammar({ userId: user.id, ...input })
  revalidatePath('/grammar')
  return explanation
}

/* -------------------------------------------------------------------------- */
/* Tutor & goals (§23)                                                        */
/* -------------------------------------------------------------------------- */

export async function tutorChatAction(input: {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<GeneratedTutorReply> {
  const user = await requireUser()
  return tutorChat({ userId: user.id, ...input })
}

export async function planGoalAction(input: {
  request: string
  deadline?: string
}): Promise<{ plan: GeneratedGoalPlan; goalId: string }> {
  const user = await requireUser()
  const { plan, goalId } = await planGoal({
    userId: user.id,
    request: input.request,
    deadline: input.deadline ? new Date(input.deadline) : null,
  })
  revalidatePath('/home')
  revalidatePath('/tutor')
  return { plan, goalId }
}

/* -------------------------------------------------------------------------- */
/* Phrasebook (§14)                                                           */
/* -------------------------------------------------------------------------- */

export async function toggleFavoriteAction(phraseId: string): Promise<boolean> {
  const user = await requireUser()
  const result = await toggleFavorite(user.id, phraseId)
  revalidatePath('/phrasebook')
  return result
}

export async function savePhraseAction(input: {
  text: string
  translation: string
  context: string
  lifeAreaKey?: string
}): Promise<void> {
  const user = await requireUser()
  const { teachPhrases } = await import('@/server/repositories/phrases')
  const { buildLearnerModel } = await import('@/server/learner/model')
  const model = await buildLearnerModel(user.id)

  await teachPhrases(
    user.id,
    [
      {
        text: input.text,
        translation: input.translation,
        context: input.context || 'Saved manually.',
        register: 'neutral',
        difficulty: 3,
        lifeAreaKeys: input.lifeAreaKey ? [input.lifeAreaKey] : [],
        grammarPatterns: [],
        vocab: [],
        examples: [],
        languageCode: model.targetLanguageCode,
        translationLanguageCode: model.explanationLanguageCode,
        source: 'user',
        createdByUserId: user.id,
        isPrivate: true,
      },
    ],
    'manual',
  )

  revalidatePath('/phrasebook')
}
