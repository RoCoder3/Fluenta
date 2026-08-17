'use client'

import { ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, Button } from '@/components/ui'
import { startSessionAction } from '@/server/actions/learning'

export function StartSessionButton({
  lifeAreaKey,
  type = 'daily',
  label = 'Start session',
  variant = 'primary',
}: {
  lifeAreaKey?: string
  type?: 'daily' | 'focused' | 'review_only'
  label?: string
  variant?: 'primary' | 'secondary'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <Button
        variant={variant}
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            try {
              const { sessionId } = await startSessionAction({ lifeAreaKey, type })
              router.push(`/learn/${sessionId}`)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not start the session.')
            }
          })
        }
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Building your session…
          </>
        ) : (
          <>
            {label}
            <ArrowRight size={16} />
          </>
        )}
      </Button>
      {error && (
        <Alert tone="critical" className="w-full mt-2">
          {error}
        </Alert>
      )}
    </>
  )
}
