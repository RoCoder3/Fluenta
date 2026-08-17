import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { buildLearnerModel } from '@/server/learner/model'
import { getRecentCrossDomain } from '@/server/engines/content'

import { CrossDomainStudio } from './studio'

export const metadata: Metadata = { title: 'Cross-domain' }

export default async function CrossDomainPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const [model, recent] = await Promise.all([
    buildLearnerModel(user.id),
    getRecentCrossDomain(user.id, 4),
  ])

  return (
    <CrossDomainStudio
      pairs={model.bridgeCandidates}
      areaNames={Object.fromEntries(model.lifeAreas.map((a) => [a.key, a.name]))}
      recent={recent.map((r) => ({
        id: r.id,
        lifeAreaKeys: r.lifeAreaKeys,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  )
}
