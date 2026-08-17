import { redirect } from 'next/navigation'

import { getCurrentUser, hasCompletedOnboarding } from '@/server/auth'
import { isLiveAi } from '@/server/ai/provider/registry'
import { countDue } from '@/server/engines/review'

import { AppNav } from './nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const onboarded = await hasCompletedOnboarding(user.id)
  if (!onboarded) redirect('/onboarding')

  const dueCount = await countDue(user.id)

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      <AppNav userName={user.name} dueCount={dueCount} liveAi={isLiveAi()} />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
    </div>
  )
}
