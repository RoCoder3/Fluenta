'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'

import { createSession, destroySession, loginUser, registerUser } from '@/server/auth'

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

const signUpSchema = credentialsSchema.extend({
  name: z.string().min(1, 'Tell us what to call you.').max(80),
})

export type FormState = { error?: string } | undefined

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const result = await registerUser(parsed.data)
  if (!result.ok) return { error: result.error }

  const ua = (await headers()).get('user-agent') ?? undefined
  await createSession(result.userId, ua)
  redirect('/onboarding')
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const result = await loginUser(parsed.data)
  if (!result.ok) return { error: result.error }

  const ua = (await headers()).get('user-agent') ?? undefined
  await createSession(result.userId, ua)
  redirect('/home')
}

export async function signOutAction(): Promise<void> {
  await destroySession()
  redirect('/')
}
