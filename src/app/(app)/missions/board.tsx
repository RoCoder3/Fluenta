'use client'

/**
 * Missions (§21) — things the learner does in the real world.
 *
 * Completion requires a written reflection, not a checkbox: the reflection is
 * what feeds readiness and gives the learner something honest to look back on.
 */

import { Check, CircleCheck, Compass, Loader2, Plus, X } from 'lucide-react'
import { useState, useTransition } from 'react'

import { PhraseCard } from '@/components/phrase-card'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Textarea,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  completeMissionAction,
  generateMissionsAction,
  updateMissionStatusAction,
} from '@/server/actions/practice'

type MissionView = {
  id: string
  title: string
  description: string
  tier: string
  status: string
  successCriteria: string[]
  reflection: string | null
  selfRating: number | null
  areaName: string | null
  phrases: Array<{ id: string; text: string; translation: string; context: string; register: string }>
}

export function MissionBoard({
  missions,
  areas,
}: {
  missions: MissionView[]
  areas: Array<{ key: string; name: string; readiness: number }>
}) {
  const [error, setError] = useState<string | null>(null)
  const [generating, startGenerating] = useTransition()

  const open = missions.filter((m) => m.status === 'suggested' || m.status === 'accepted')
  const done = missions.filter((m) => m.status === 'completed')

  const weakest = [...areas].sort((a, b) => a.readiness - b.readiness)[0]

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:py-10">
      <header className="mb-7">
        <h1 className="font-display text-3xl mb-2">Missions</h1>
        <p className="text-ink-muted leading-relaxed max-w-2xl">
          Things to do away from this screen, with actual people. Doing one is stronger evidence of
          progress than anything you can score in an app — which is why they count for so much toward
          your readiness.
        </p>
      </header>

      {error && (
        <Alert tone="critical" className="mb-5">
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2 mb-8">
        <Button
          disabled={generating}
          onClick={() =>
            startGenerating(async () => {
              setError(null)
              try {
                await generateMissionsAction(weakest?.key)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not generate missions.')
              }
            })
          }
        >
          {generating ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Designing missions…
            </>
          ) : (
            <>
              <Plus size={15} />
              New missions{weakest ? ` for ${weakest.name.toLowerCase()}` : ''}
            </>
          )}
        </Button>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Compass size={26} />}
            title="No missions yet"
            description="Generate a few and go use your German where it counts."
          />
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <section className="mb-10">
              <SectionTitle>Open</SectionTitle>
              <div className="space-y-3">
                {open.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} onError={setError} />
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <SectionTitle>Completed</SectionTitle>
              <div className="space-y-3">
                {done.map((mission) => (
                  <Card key={mission.id} className="p-5">
                    <div className="flex items-start gap-3">
                      <CircleCheck size={18} className="text-positive mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{mission.title}</p>
                        {mission.reflection && (
                          <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                            &ldquo;{mission.reflection}&rdquo;
                          </p>
                        )}
                        {mission.selfRating && (
                          <p className="text-xs text-ink-faint mt-2">
                            Went {['badly', 'poorly', 'okay', 'well', 'very well'][mission.selfRating - 1]}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function MissionCard({
  mission,
  onError,
}: {
  mission: MissionView
  onError: (message: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [reflection, setReflection] = useState('')
  const [rating, setRating] = useState(3)
  const [pending, startTransition] = useTransition()

  const tierTone = { beginner: 'positive', intermediate: 'caution', advanced: 'critical' } as const

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-display text-lg leading-tight">{mission.title}</p>
        <Badge tone={tierTone[mission.tier as keyof typeof tierTone] ?? 'neutral'} size="sm">
          {mission.tier}
        </Badge>
      </div>

      {mission.areaName && (
        <Badge size="sm" className="mb-3">
          {mission.areaName}
        </Badge>
      )}

      <p className="text-sm text-ink-muted leading-relaxed">{mission.description}</p>

      {mission.successCriteria.length > 0 && (
        <ul className="mt-3.5 space-y-1.5">
          {mission.successCriteria.map((criterion) => (
            <li key={criterion} className="flex gap-2 text-[13px] text-ink-muted">
              <Check size={14} className="text-ink-faint mt-0.5 shrink-0" />
              {criterion}
            </li>
          ))}
        </ul>
      )}

      {mission.phrases.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[13px] text-accent hover:underline underline-offset-4"
          >
            {expanded ? 'Hide' : `Prepare with ${mission.phrases.length} phrases`}
          </button>
          {expanded && (
            <div className="mt-3 space-y-2 animate-fade-up">
              {mission.phrases.map((phrase) => (
                <PhraseCard key={phrase.id} phrase={phrase} compact />
              ))}
            </div>
          )}
        </div>
      )}

      {!completing ? (
        <div className="flex gap-2 mt-5">
          <Button size="sm" onClick={() => setCompleting(true)}>
            I did it
          </Button>
          {mission.status === 'suggested' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await updateMissionStatusAction(mission.id, 'skipped')
                  } catch (e) {
                    onError(e instanceof Error ? e.message : 'Could not skip.')
                  }
                })
              }
            >
              <X size={14} />
              Not for me
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-5 pt-5 border-t border-line animate-fade-up">
          <p className="text-sm font-medium mb-2">How did it go?</p>
          <div className="flex gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-xs border transition-all',
                  rating === value
                    ? 'bg-accent text-accent-ink border-accent'
                    : 'border-line-strong text-ink-muted hover:border-ink-faint',
                )}
              >
                {['Badly', 'Poorly', 'Okay', 'Well', 'Great'][value - 1]}
              </button>
            ))}
          </div>

          <Textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={3}
            placeholder="What actually happened? What did you not have the words for?"
            className="min-h-[80px]"
          />

          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              disabled={pending || reflection.trim().length < 5}
              onClick={() =>
                startTransition(async () => {
                  onError(null)
                  try {
                    await completeMissionAction({
                      missionId: mission.id,
                      reflection,
                      selfRating: rating,
                    })
                  } catch (e) {
                    onError(e instanceof Error ? e.message : 'Could not save.')
                  }
                })
              }
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : 'Log it'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCompleting(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
