import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'

import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Create account' }

export default async function SignUpPage() {
  const user = await getCurrentUser()
  if (user) redirect(user.onboardingCompletedAt ? '/home' : '/onboarding')
  return <AuthForm mode="signup" />
}
