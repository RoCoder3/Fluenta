import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { languages } from '@/server/db/schema'
import { getConversation } from '@/server/engines/conversation'
import { buildLearnerModel } from '@/server/learner/model'

import { ConversationRoom } from './room'

export const metadata: Metadata = { title: 'Conversation' }

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const data = await getConversation(id, user.id)
  if (!data) notFound()

  const model = await buildLearnerModel(user.id)
  const db = await getDb()
  const [language] = await db
    .select({ speechTag: languages.speechTag })
    .from(languages)
    .where(eq(languages.code, model.targetLanguageCode))
    .limit(1)

  return (
    <ConversationRoom
      conversationId={id}
      lang={language?.speechTag ?? 'de-DE'}
      scenarioTitle={data.conversation.scenarioTitle}
      situation={data.conversation.situation}
      persona={data.conversation.persona}
      status={data.conversation.status}
      initialTurns={data.turns.map((t) => ({
        id: t.id,
        role: t.role,
        text: t.text,
        translation: t.translation,
      }))}
      initialAnalysis={data.analysis}
    />
  )
}
