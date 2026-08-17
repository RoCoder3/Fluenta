'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, Badge, Button, Card, Input, readinessTone } from '@/components/ui'
import { pct } from '@/lib/utils'
import { startConversationAction } from '@/server/actions/practice'

type ScenarioOption = {
  key: string
  title: string
  situation: string
  difficulty: number
  lifeAreaKey: string
  personaName: string
  personaRole: string
  register: string
  region: string
  readiness?: number
}

export function PracticeLauncher({ scenarios }: { scenarios: ScenarioOption[] }) {
  const router = useRouter()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const launch = (input: { scenarioKey?: string; customSituation?: string }, key: string) => {
    setPendingKey(key)
    setError(null)
    startTransition(async () => {
      try {
        const { conversationId } = await startConversationAction(input)
        router.push(`/practice/conversation/${conversationId}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start the conversation.')
        setPendingKey(null)
      }
    })
  }

  return (
    <>
      {error && (
        <Alert tone="critical" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {scenarios.map((scenario) => (
          <Card key={scenario.key} className="p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="font-display text-lg leading-tight">{scenario.title}</p>
              <Badge size="sm" tone={scenario.difficulty >= 4 ? 'caution' : 'neutral'}>
                {'●'.repeat(scenario.difficulty)}
                <span className="opacity-30">{'●'.repeat(5 - scenario.difficulty)}</span>
              </Badge>
            </div>

            <p className="text-sm text-ink-muted leading-relaxed flex-1">{scenario.situation}</p>

            <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-4">
              <Badge size="sm">{scenario.personaRole}</Badge>
              <Badge size="sm" tone="accent">
                {scenario.register}
              </Badge>
              <Badge size="sm">{scenario.region}</Badge>
              {scenario.readiness !== undefined && (
                <span
                  className={
                    readinessTone(scenario.readiness) === 'critical'
                      ? 'text-xs text-critical ml-auto'
                      : 'text-xs text-ink-faint ml-auto'
                  }
                >
                  {pct(scenario.readiness)} ready
                </span>
              )}
            </div>

            <Button
              variant="secondary"
              block
              disabled={pendingKey !== null}
              onClick={() => launch({ scenarioKey: scenario.key }, scenario.key)}
            >
              {pendingKey === scenario.key ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Setting the scene…
                </>
              ) : (
                'Start'
              )}
            </Button>
          </Card>
        ))}
      </div>

      <Card className="p-5 mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-accent" />
          <p className="font-display text-lg">Something else</p>
        </div>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          Describe a situation you&rsquo;re actually facing and it gets built for you.
        </p>
        <div className="flex gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Telling my landlord the boiler has been broken for a week"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim().length > 8) {
                launch({ customSituation: custom }, 'custom')
              }
            }}
          />
          <Button
            disabled={pendingKey !== null || custom.trim().length < 8}
            onClick={() => launch({ customSituation: custom }, 'custom')}
          >
            {pendingKey === 'custom' ? <Loader2 size={15} className="animate-spin" /> : 'Go'}
          </Button>
        </div>
      </Card>
    </>
  )
}
