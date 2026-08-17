import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser, hasCompletedOnboarding } from '@/server/auth'
import { getDb } from '@/server/db'
import { languages } from '@/server/db/schema'
import { isLiveAi } from '@/server/ai/provider/registry'
import { getActiveLanguage, getEnrollments } from '@/server/learner/language'

import { OnboardingFlow } from './flow'

export const metadata: Metadata = { title: 'Set up' }

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  if (await hasCompletedOnboarding(user.id)) redirect('/home')

  const db = await getDb()
  const [allLanguages, activeLanguage, enrollments] = await Promise.all([
    db.select().from(languages),
    getActiveLanguage(user.id),
    getEnrollments(user.id),
  ])

  /*
   * Reaching onboarding from the language switcher is a different situation
   * from reaching it after signup: the learner has already picked what they
   * want, and they already know how this works. The flow reads these to skip
   * the sales pitch and preselect their choice rather than asking twice.
   */
  const finishedAnother = enrollments.some((e) => e.onboarded && e.languageCode !== activeLanguage)

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
      initialTargetLanguage={activeLanguage}
      isAdditionalLanguage={finishedAnother}
    />
  )
}
