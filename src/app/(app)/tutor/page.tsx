import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'

import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { goals } from '@/server/db/schema'
import { tutorSuggestions } from '@/server/engines/tutor'
import { buildLearnerModel } from '@/server/learner/model'

import { TutorConsole } from './console'

export const metadata: Metadata = { title: 'AI Tutor' }

export default async function TutorPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const db = await getDb()
  const [model, activeGoals] = await Promise.all([
    buildLearnerModel(user.id),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, user.id), eq(goals.status, 'active')))
      .orderBy(desc(goals.createdAt))
      .limit(6),
  ])

  return (
    <TutorConsole
      suggestions={tutorSuggestions(model)}
      goals={activeGoals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        kind: g.kind,
        deadline: g.deadline?.toISOString() ?? null,
      }))}
    />
  )
}
