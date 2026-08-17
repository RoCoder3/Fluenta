import { ArrowRight, Blend, Compass, Sparkles, Target } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  SectionTitle,
  readinessTone,
} from '@/components/ui'
import { pct, relativeTime } from '@/lib/utils'
import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { goals, missions } from '@/server/db/schema'
import { getNewCapabilities } from '@/server/engines/progress'
import { countDue } from '@/server/engines/review'
import { buildLearnerModel, describeBiggestGap } from '@/server/learner/model'
import { and, desc, eq } from 'drizzle-orm'

import { StartSessionButton } from './start-session'

export const metadata: Metadata = { title: 'Home' }

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const db = await getDb()
  const [model, dueCount, capabilities, openMissions, activeGoals] = await Promise.all([
    buildLearnerModel(user.id),
    countDue(user.id),
    getNewCapabilities(user.id, 4),
    db
      .select()
      .from(missions)
      .where(and(eq(missions.userId, user.id), eq(missions.status, 'suggested')))
      .limit(2),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, user.id), eq(goals.status, 'active')))
      .orderBy(desc(goals.createdAt))
      .limit(1),
  ])

  const objective = activeGoals[0]?.title ?? model.currentFocus.lifeAreaName
  const sortedAreas = [...model.lifeAreas].sort((a, b) => a.priority - b.priority)
  const firstName = user.name.split(' ')[0]

  // Today's plan is assembled here rather than generated, so it's instant and honest.
  const plan = buildTodaysPlan({ dueCount, model })

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:py-10">
      <header className="mb-8">
        <p className="text-sm text-ink-muted mb-1">{greeting()}, {firstName}.</p>
        <h1 className="font-display text-3xl text-balance">
          {objective ? (
            <>
              Working toward: <span className="text-accent">{objective.toLowerCase()}</span>
            </>
          ) : (
            'Your German command center'
          )}
        </h1>
      </header>

      {/* Today's plan — the primary action on the page */}
      <Card raised className="mb-6 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <SectionTitle className="mb-1">Today&rsquo;s plan</SectionTitle>
              <p className="font-display text-xl">{plan.totalMinutes}-minute session</p>
            </div>
            {dueCount > 0 && (
              <Badge tone="critical" size="md">
                {dueCount} due
              </Badge>
            )}
          </div>

          <ol className="space-y-2.5 mb-6">
            {plan.steps.map((step, i) => (
              <li key={step} className="flex items-baseline gap-3 text-sm">
                <span className="text-xs tabular-nums text-ink-faint w-4 shrink-0">{i + 1}</span>
                <span className="text-ink-muted">{step}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2.5">
            <StartSessionButton lifeAreaKey={model.currentFocus.lifeAreaKey ?? undefined} />
            {dueCount > 0 && (
              <StartSessionButton
                type="review_only"
                label={`Review ${dueCount} only`}
                variant="secondary"
              />
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          {/* Life-area readiness */}
          <section>
            <SectionTitle
              action={
                <Link href="/progress" className="text-xs text-ink-muted hover:text-ink">
                  Details
                </Link>
              }
            >
              Life-area readiness
            </SectionTitle>
            <Card>
              <CardBody className="pt-5 space-y-4">
                {sortedAreas.length === 0 && (
                  <p className="text-sm text-ink-muted">No life areas yet.</p>
                )}
                {sortedAreas.map((area) => (
                  <div key={area.id}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <Link
                        href={`/learn?area=${area.key}`}
                        className="text-sm font-medium hover:text-accent transition-colors"
                      >
                        {area.name}
                      </Link>
                      <span className="text-xs tabular-nums text-ink-muted">
                        {pct(area.readiness)}
                      </span>
                    </div>
                    <ProgressBar value={area.readiness} tone={readinessTone(area.readiness)} />
                  </div>
                ))}
              </CardBody>
            </Card>
          </section>

          {/* What you can do now */}
          <section>
            <SectionTitle>What you can do now</SectionTitle>
            <Card>
              {capabilities.length ? (
                <CardBody className="pt-5">
                  <ul className="space-y-2.5">
                    {capabilities.map((c) => (
                      <li key={c} className="flex gap-2.5 text-sm leading-relaxed">
                        <Target size={15} className="text-positive mt-0.5 shrink-0" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              ) : (
                <EmptyState
                  title="Nothing demonstrated yet"
                  description="Once you produce German that satisfies a roadmap objective, it shows up here as something you can now do."
                />
              )}
            </Card>
          </section>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* The honest read */}
          <section>
            <SectionTitle>Your biggest gap</SectionTitle>
            <Card>
              <CardBody className="pt-5">
                <p className="text-sm leading-relaxed">{describeBiggestGap(model)}</p>
              </CardBody>
            </Card>
          </section>

          {/* Snapshot */}
          <section>
            <SectionTitle>Snapshot</SectionTitle>
            <Card>
              <CardBody className="pt-5 space-y-3">
                <Stat label="Estimated level" value={model.estimatedLevel} />
                <Stat label="Phrases" value={`${model.phraseCounts.total}`} sub={`${model.phraseCounts.mastered} mastered`} />
                <Stat
                  label="Speaking"
                  value={pct(model.skills.speaking.score)}
                  sub={model.skills.speaking.confidence < 0.4 ? 'low confidence' : undefined}
                />
                <Stat label="Listening" value={pct(model.skills.listening.score)} />
                <Stat
                  label="Last session"
                  value={relativeTime(model.recentActivity.lastSessionAt)}
                />
              </CardBody>
            </Card>
          </section>

          {/* Cross-domain nudge */}
          {model.bridgeCandidates.length > 0 && (
            <Card className="border-accent/25 bg-accent-soft/40">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Blend size={16} className="text-accent" />
                  <CardTitle className="text-base">Connect your worlds</CardTitle>
                </div>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-ink-muted leading-relaxed mb-3">
                  You have material in{' '}
                  <span className="text-ink">{model.bridgeCandidates[0]![0].replace('_', ' ')}</span> and{' '}
                  <span className="text-ink">{model.bridgeCandidates[0]![1].replace('_', ' ')}</span>.
                  Real conversations mix them.
                </p>
                <Link href="/learn/cross-domain">
                  <Button size="sm" variant="secondary">
                    Build bridges
                    <ArrowRight size={14} />
                  </Button>
                </Link>
              </CardBody>
            </Card>
          )}

          {/* Missions */}
          {openMissions.length > 0 && (
            <section>
              <SectionTitle
                action={
                  <Link href="/missions" className="text-xs text-ink-muted hover:text-ink">
                    All
                  </Link>
                }
              >
                Out in the world
              </SectionTitle>
              <Card>
                <CardBody className="pt-5 space-y-3.5">
                  {openMissions.map((mission) => (
                    <Link key={mission.id} href="/missions" className="block group">
                      <div className="flex items-start gap-2.5">
                        <Compass size={15} className="text-caution mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium group-hover:text-accent transition-colors">
                            {mission.title}
                          </p>
                          <p className="text-xs text-ink-muted mt-0.5 line-clamp-2 leading-relaxed">
                            {mission.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </CardBody>
              </Card>
            </section>
          )}

          <Link href="/tutor" className="block">
            <Card className="hover:border-accent/40 transition-colors">
              <CardBody className="pt-5">
                <div className="flex items-center gap-2.5">
                  <Sparkles size={16} className="text-accent" />
                  <div>
                    <p className="text-sm font-medium">&ldquo;What do I need to learn?&rdquo;</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Got a trip, an interview, a dinner with the in-laws? Ask.
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-medium tabular-nums text-right">
        {value}
        {sub && <span className="block text-xs text-ink-faint font-normal">{sub}</span>}
      </span>
    </div>
  )
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Late night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The plan is assembled from real state (due count, weakest skill) rather than
 * generated — it must appear instantly and describe what will actually happen.
 */
function buildTodaysPlan({
  dueCount,
  model,
}: {
  dueCount: number
  model: Awaited<ReturnType<typeof buildLearnerModel>>
}): { steps: string[]; totalMinutes: number } {
  const steps: string[] = []
  let minutes = 0

  if (dueCount > 0) {
    steps.push(`Review ${Math.min(dueCount, 5)} phrases you're about to forget`)
    minutes += 2
  }

  const areaName = model.currentFocus.lifeAreaName ?? model.lifeAreas[0]?.name ?? 'everyday German'
  steps.push(`Listen to a short dialogue set in ${areaName.toLowerCase()}`)
  minutes += 2
  steps.push('Answer a few questions about what you heard')
  minutes += 1
  steps.push('Learn 4–6 new phrases with audio')
  minutes += 3

  const production = model.skills.speaking.score < model.skills.writing.score ? 'Speak' : 'Write'
  steps.push(`${production} for two minutes, then get feedback`)
  minutes += 3

  return { steps, totalMinutes: minutes }
}
