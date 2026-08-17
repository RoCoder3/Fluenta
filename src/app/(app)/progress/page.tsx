import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ProgressBar,
  SectionTitle,
  readinessTone,
} from '@/components/ui'
import { cn, pct, relativeTime, titleCase } from '@/lib/utils'
import { getCurrentUser } from '@/server/auth'
import { getErrorProfile } from '@/server/engines/feedback'
import { getNewCapabilities, getProgressOverview } from '@/server/engines/progress'
import { buildLearnerModel, describeBiggestGap } from '@/server/learner/model'

export const metadata: Metadata = { title: 'Progress' }

export default async function ProgressPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const [overview, errors, capabilities, model] = await Promise.all([
    getProgressOverview(user.id),
    getErrorProfile(user.id),
    getNewCapabilities(user.id, 10),
    buildLearnerModel(user.id),
  ])

  const trendFor = (subject: string) => overview.trends.find((t) => t.subject === subject)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:py-10">
      <header className="mb-7">
        <h1 className="font-display text-3xl mb-2">Progress</h1>
        <p className="text-ink-muted leading-relaxed max-w-2xl">
          Not lessons completed. What you can actually do now that you couldn&rsquo;t before.
        </p>
      </header>

      <Card raised className="p-5 mb-7">
        <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">The honest read</p>
        <p className="text-[15px] leading-relaxed">{describeBiggestGap(model)}</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 mb-7">
        {/* Skills */}
        <section>
          <SectionTitle>Language skills</SectionTitle>
          <Card>
            <CardBody className="pt-5 space-y-4">
              {overview.skills.length === 0 && (
                <p className="text-sm text-ink-muted">No measurements yet.</p>
              )}
              {overview.skills
                .sort((a, b) => b.score - a.score)
                .map((skill) => {
                  const trend = trendFor(skill.category)
                  return (
                    <div key={skill.category}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-sm capitalize">{skill.category}</span>
                        <span className="flex items-center gap-2">
                          {trend?.delta !== null && trend?.delta !== undefined && trend.delta !== 0 && (
                            <TrendPill delta={trend.delta} />
                          )}
                          <span className="text-xs tabular-nums text-ink-muted">
                            {pct(skill.score)}
                          </span>
                        </span>
                      </div>
                      <ProgressBar value={skill.score} />
                      {skill.confidence < 0.4 && (
                        <p className="text-[11px] text-ink-faint mt-1">
                          Low confidence — needs more evidence
                        </p>
                      )}
                    </div>
                  )
                })}
            </CardBody>
          </Card>
        </section>

        {/* Life-area readiness */}
        <section>
          <SectionTitle>Functional readiness</SectionTitle>
          <Card>
            <CardBody className="pt-5 space-y-4">
              {overview.areas.map((area) => {
                const trend = trendFor(area.key)
                return (
                  <div key={area.key}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-sm">{area.name}</span>
                      <span className="flex items-center gap-2">
                        {trend?.delta !== null && trend?.delta !== undefined && trend.delta !== 0 && (
                          <TrendPill delta={trend.delta} />
                        )}
                        <span className="text-xs tabular-nums text-ink-muted">
                          {pct(area.readiness)}
                        </span>
                      </span>
                    </div>
                    <ProgressBar value={area.readiness} tone={readinessTone(area.readiness)} />
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </section>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        <StatCard label="Phrases" value={String(overview.phrases.total)} sub={`${overview.phrases.mastered} mastered`} />
        <StatCard label="Due now" value={String(overview.phrases.due)} />
        <StatCard label="Sessions" value={String(overview.activity.sessions)} sub={`${overview.activity.minutes} min total`} />
        <StatCard
          label="Missions"
          value={String(overview.missions.completed)}
          sub={overview.missions.open > 0 ? `${overview.missions.open} open` : undefined}
        />
      </div>

      {/* Capabilities */}
      <section className="mb-7">
        <SectionTitle>What you can do now</SectionTitle>
        <Card>
          {capabilities.length ? (
            <CardBody className="pt-5">
              <ul className="space-y-2.5">
                {capabilities.map((c) => (
                  <li key={c} className="text-sm leading-relaxed flex gap-2.5">
                    <span className="text-positive mt-0.5">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
            </CardBody>
          ) : (
            <EmptyState
              title="Nothing demonstrated yet"
              description="Roadmap objectives appear here once you produce German that satisfies them."
            />
          )}
        </Card>
      </section>

      {/* Error memory */}
      <section>
        <SectionTitle>Your recurring patterns</SectionTitle>
        <p className="text-sm text-ink-muted mb-4 leading-relaxed">
          These are tracked so future material quietly contains more correct examples of them. They
          don&rsquo;t become drills.
        </p>

        {errors.length === 0 ? (
          <Card>
            <EmptyState
              title="No patterns yet"
              description="Produce some German and the system starts noticing what keeps tripping you up."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {errors.map((error) => (
              <Card key={error.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-medium">{error.label}</p>
                    <p className="text-xs text-ink-faint mt-0.5">
                      {titleCase(error.category)} · seen {error.frequency}×
                      {error.lastSeenAt && ` · last ${relativeTime(error.lastSeenAt)}`}
                    </p>
                  </div>
                  <Badge
                    tone={
                      error.status === 'resolved'
                        ? 'positive'
                        : error.status === 'improving'
                          ? 'caution'
                          : 'critical'
                    }
                    size="sm"
                  >
                    {error.status}
                  </Badge>
                </div>

                <p className="text-[13px] text-ink-muted leading-relaxed">{error.explanation}</p>

                {error.occurrences.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line space-y-1.5">
                    {error.occurrences.slice(0, 2).map((occurrence) => (
                      <div key={occurrence.id} className="text-[13px]">
                        <span className="text-ink-faint line-through decoration-critical/40">
                          {occurrence.said}
                        </span>
                        <span className="text-ink-faint mx-1.5">→</span>
                        <span className="target-text">{occurrence.corrected}</span>
                      </div>
                    ))}
                  </div>
                )}

                {error.cleanStreak > 0 && error.status !== 'resolved' && (
                  <p className="text-[11px] text-positive mt-2">
                    {error.cleanStreak} clean {error.cleanStreak === 1 ? 'run' : 'runs'} since last slip
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-1.5">{label}</p>
      <p className="font-display text-2xl tabular-nums">{value}</p>
      {sub && <p className="text-xs text-ink-faint mt-0.5">{sub}</p>}
    </Card>
  )
}

function TrendPill({ delta }: { delta: number }) {
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] tabular-nums',
        delta > 0 ? 'text-positive' : delta < 0 ? 'text-critical' : 'text-ink-faint',
      )}
    >
      <Icon size={12} />
      {delta > 0 ? '+' : ''}
      {delta}
    </span>
  )
}
