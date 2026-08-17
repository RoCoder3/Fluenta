'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Alert, Button, Card, Input, Label } from '@/components/ui'
import { signInAction, signUpAction, type FormState } from '@/server/actions/auth'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? 'One moment…' : label}
    </Button>
  )
}

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const isSignUp = mode === 'signup'
  const [state, formAction] = useActionState<FormState, FormData>(
    isSignUp ? signUpAction : signInAction,
    undefined,
  )

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="font-display text-lg mb-8 text-ink">
        Fluenta
      </Link>

      <Card raised className="w-full max-w-sm p-7">
        <h1 className="font-display text-2xl mb-1.5">
          {isSignUp ? 'Start with your life' : 'Welcome back'}
        </h1>
        <p className="text-sm text-ink-muted mb-6 leading-relaxed">
          {isSignUp
            ? 'A few questions about your situation, then a roadmap built for it.'
            : 'Pick up where you left off.'}
        </p>

        <form action={formAction} className="space-y-4">
          {isSignUp && (
            <div>
              <Label htmlFor="name">What should we call you?</Label>
              <Input id="name" name="name" autoComplete="name" required maxLength={80} />
            </div>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
              minLength={8}
            />
            {isSignUp && <p className="text-xs text-ink-faint mt-1.5">At least 8 characters.</p>}
          </div>

          {state?.error && <Alert tone="critical">{state.error}</Alert>}

          <SubmitButton label={isSignUp ? 'Create account' : 'Sign in'} />
        </form>

        <p className="text-sm text-ink-muted mt-6 text-center">
          {isSignUp ? 'Already have an account? ' : 'New here? '}
          <Link
            href={isSignUp ? '/signin' : '/signup'}
            className="text-accent underline underline-offset-4"
          >
            {isSignUp ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </Card>
    </div>
  )
}
