import { redirect } from 'next/navigation'

import { getCurrentUser, hasCompletedOnboarding } from '@/server/auth'
import { getActiveLanguage, getEnrollments, getTargetLanguages } from '@/server/learner/language'
import { isLiveAi } from '@/server/ai/provider/registry'
import { countDue } from '@/server/engines/review'

import { AppNav } from './nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const onboarded = await hasCompletedOnboarding(user.id)
  if (!onboarded) redirect('/onboarding')

  const activeLanguage = await getActiveLanguage(user.id)
  const [dueCount, targets, enrollments] = await Promise.all([
    countDue(user.id, activeLanguage),
    getTargetLanguages(),
    getEnrollments(user.id, activeLanguage),
  ])

  // Everything learnable, annotated with how far this learner has got in it.
  const languages = targets.map((t) => {
    const enrollment = enrollments.find((e) => e.languageCode === t.code)
    return {
      code: t.code,
      name: t.name,
      nativeName: t.nativeName,
      enrolled: Boolean(enrollment),
      onboarded: enrollment?.onboarded ?? false,
    }
  })

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      <AppNav
        userName={user.name}
        dueCount={dueCount}
        liveAi={isLiveAi()}
        languages={languages}
        activeLanguage={activeLanguage}
      />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
    </div>
  )
}
