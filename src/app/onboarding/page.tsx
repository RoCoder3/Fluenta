import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser, hasCompletedOnboarding } from '@/server/auth'
import { getDb } from '@/server/db'
import { languages } from '@/server/db/schema'
import { isLiveAi } from '@/server/ai/provider/registry'

import { OnboardingFlow } from './flow'

export const metadata: Metadata = { title: 'Set up' }

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  if (await hasCompletedOnboarding(user.id)) redirect('/home')

  const db = await getDb()
  const allLanguages = await db.select().from(languages)

  return (
    <OnboardingFlow
      userName={user.name}
      languages={allLanguages.map((l) => ({
        code: l.code,
        name: l.name,
        nativeName: l.nativeName,
        isTarget: l.isTarget,
        isExplanation: l.isExplanation,
      }))}
      liveAi={isLiveAi()}
    />
  )
}
