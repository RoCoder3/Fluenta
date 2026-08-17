import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { listMissions } from '@/server/engines/tutor'
import { buildLearnerModel } from '@/server/learner/model'
import { findPhrasesByIds } from '@/server/repositories/phrases'

import { MissionBoard } from './board'

export const metadata: Metadata = { title: 'Missions' }

export default async function MissionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const [missions, model] = await Promise.all([listMissions(user.id), buildLearnerModel(user.id)])

  const areaNames = new Map(model.lifeAreas.map((a) => [a.id, a.name]))

  const enriched = await Promise.all(
    missions.map(async (mission) => ({
      id: mission.id,
      title: mission.title,
      description: mission.description,
      tier: mission.tier,
      status: mission.status,
      successCriteria: mission.successCriteria,
      reflection: mission.reflection,
      selfRating: mission.selfRating,
      areaName: mission.lifeAreaId ? (areaNames.get(mission.lifeAreaId) ?? null) : null,
      phrases: (await findPhrasesByIds(mission.preparationPhraseIds)).map((p) => ({
        id: p.id,
        text: p.text,
        translation: p.translation,
        context: p.context,
        register: p.register,
      })),
    })),
  )

  return (
    <MissionBoard
      missions={enriched}
      areas={model.lifeAreas.map((a) => ({ key: a.key, name: a.name, readiness: a.readiness }))}
    />
  )
}
