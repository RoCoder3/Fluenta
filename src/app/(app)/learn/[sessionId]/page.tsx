import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { languages } from '@/server/db/schema'
import { getSession } from '@/server/engines/content'
import { buildLearnerModel } from '@/server/learner/model'
import { eq } from 'drizzle-orm'

import { SessionRunner } from './runner'

export const metadata: Metadata = { title: 'Session' }

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const data = await getSession(sessionId, user.id)
  if (!data) notFound()

  const model = await buildLearnerModel(user.id)
  const db = await getDb()
  const [language] = await db
    .select({ speechTag: languages.speechTag })
    .from(languages)
    .where(eq(languages.code, model.targetLanguageCode))
    .limit(1)

  return (
    <SessionRunner
      sessionId={sessionId}
      title={data.session.title}
      lang={language?.speechTag ?? 'de-DE'}
      areaKey={data.area?.key}
      activities={data.activities.map((a) => ({
        id: a.id,
        kind: a.kind,
        payload: a.payload,
      }))}
    />
  )
}
