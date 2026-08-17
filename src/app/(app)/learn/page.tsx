import { Blend, CircleCheck, CircleDot, Lock, SkipForward } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'

import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ProgressBar,
  SectionTitle,
  readinessTone,
} from '@/components/ui'
import { pct } from '@/lib/utils'
import { getCurrentUser } from '@/server/auth'
import { getActiveLanguage } from '@/server/learner/language'
import { getDb } from '@/server/db'
import { roadmapObjectives, roadmapStages, roadmaps } from '@/server/db/schema'
import { countDue } from '@/server/engines/review'
import { buildLearnerModel } from '@/server/learner/model'

import { StartSessionButton } from '../home/start-session'

export const metadata: Metadata = { title: 'Learn' }

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>
}) {
  const { area: areaParam } = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const db = await getDb()
  const language = await getActiveLanguage(user.id)
  const [model, dueCount] = await Promise.all([
    buildLearnerModel(user.id),
    countDue(user.id, language),
  ])

  const selectedArea =
    model.lifeAreas.find((a) => a.key === areaParam) ??
    model.lifeAreas.find((a) => a.key === model.currentFocus.lifeAreaKey) ??
    model.lifeAreas[0]

  // Roadmap for the selected area, with stages and their objectives.
  const roadmapRows = selectedArea
    ? await db
        .select()
        .from(roadmaps)
        .where(
          and(
            eq(roadmaps.userId, user.id),
            eq(roadmaps.lifeAreaId, selectedArea.id),
            eq(roadmaps.status, 'active'),
          ),
        )
        .limit(1)
    : []

  const roadmap = roadmapRows[0]

  const stages = roadmap
    ? await db
        .select()
        .from(roadmapStages)
        .where(eq(roadmapStages.roadmapId, roadmap.id))
        .orderBy(roadmapStages.orderIndex)
    : []

  const objectivesByStage = new Map<string, Array<{ id: string; canDo: string; status: string }>>()
  for (const stage of stages) {
    const objectives = await db
      .select({
        id: roadmapObjectives.id,
        canDo: roadmapObjectives.canDo,
        status: roadmapObjectives.status,
      })
      .from(roadmapObjectives)
      .where(eq(roadmapObjectives.stageId, stage.id))
      .orderBy(roadmapObjectives.orderIndex)
    objectivesByStage.set(stage.id, objectives)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:py-10">
      <header className="mb-7">
        <h1 className="font-display text-3xl mb-2">Learn</h1>
        <p className="text-ink-muted leading-relaxed">
          Every area of your life has its own path from surviving to fluent.
        </p>
      </header>

      {/* Area picker */}
      <div className="flex flex-wrap gap-2 mb-7">
        {model.lifeAreas.map((area) => (
          <Link key={area.id} href={`/learn?area=${area.key}`}>
            <span
              className={
                selectedArea?.key === area.key
                  ? 'inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm border bg-accent text-accent-ink border-accent'
                  : 'inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm border bg-surface border-line-strong text-ink-muted hover:border-ink-faint transition-colors'
              }
            >
              {area.name}
              <span className="tabular-nums opacity-70 text-xs">{pct(area.readiness)}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 mb-8">
        <Card raised className="p-5">
          <p className="font-display text-lg mb-1">
            {selectedArea ? selectedArea.name : 'Today'}
          </p>
          <p className="text-sm text-ink-muted leading-relaxed mb-4">
            A full session: review, a dialogue, new phrases, and something you produce yourself.
          </p>
          <StartSessionButton lifeAreaKey={selectedArea?.key} label="Start session" />
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-1">
            <p className="font-display text-lg">Review</p>
            {dueCount > 0 && <Badge tone="critical">{dueCount} due</Badge>}
          </div>
          <p className="text-sm text-ink-muted leading-relaxed mb-4">
            {dueCount > 0
              ? "Phrases you're on the edge of forgetting, tested in a way you haven't been tested yet."
              : 'Nothing due right now. Come back when something is ready.'}
          </p>
          <StartSessionButton
            type="review_only"
            label="Review only"
            variant="secondary"
          />
        </Card>
      </div>

      {model.bridgeCandidates.length > 0 && (
        <Link href="/learn/cross-domain" className="block mb-8">
          <Card className="p-5 border-accent/25 bg-accent-soft/30 hover:border-accent/50 transition-colors">
            <div className="flex items-start gap-3">
              <Blend size={18} className="text-accent mt-0.5 shrink-0" />
              <div>
                <p className="font-display text-lg mb-1">Cross-domain fluency</p>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Recombine what you know from different parts of your life into sentences you
                  couldn&rsquo;t say before. This is where memorized language turns flexible.
                </p>
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* Roadmap */}
      <section>
        <SectionTitle>
          {selectedArea ? `${selectedArea.name} roadmap` : 'Roadmap'}
        </SectionTitle>

        {!roadmap ? (
          <Card>
            <EmptyState
              title="No roadmap for this area yet"
              description="Roadmaps are generated for your top three areas during onboarding. Run a session here and one will be built."
            />
          </Card>
        ) : (
          <>
            {roadmap.summary && (
              <p className="text-sm text-ink-muted leading-relaxed mb-5">{roadmap.summary}</p>
            )}
            <div className="space-y-3">
              {stages.map((stage) => {
                const objectives = objectivesByStage.get(stage.id) ?? []
                const locked = stage.status === 'locked'
                const skipped = stage.status === 'skipped'

                return (
                  <Card key={stage.id} className={locked ? 'opacity-55' : undefined}>
                    <CardBody className="pt-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2.5">
                          <StageIcon status={stage.status} />
                          <div>
                            <p className="font-medium">{stage.name}</p>
                            <p className="text-xs text-ink-faint capitalize">{stage.tier}</p>
                          </div>
                        </div>
                        {skipped ? (
                          <Badge tone="positive">Already past this</Badge>
                        ) : (
                          <span className="text-xs tabular-nums text-ink-muted">
                            {pct(stage.progress)}
                          </span>
                        )}
                      </div>

                      {!skipped && <ProgressBar value={stage.progress} className="mb-4" />}

                      {stage.description && (
                        <p className="text-sm text-ink-muted leading-relaxed mb-3">
                          {stage.description}
                        </p>
                      )}

                      <ul className="space-y-2">
                        {objectives.map((objective) => (
                          <li key={objective.id} className="flex items-start gap-2.5 text-sm">
                            <ObjectiveIcon status={objective.status} />
                            <span
                              className={
                                objective.status === 'mastered'
                                  ? 'text-ink-muted line-through decoration-positive/40'
                                  : ''
                              }
                            >
                              {objective.canDo}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {stage.status === 'in_progress' && (
                        <div className="mt-4">
                          <StartSessionButton
                            lifeAreaKey={selectedArea?.key}
                            label="Work on this stage"
                            variant="secondary"
                          />
                        </div>
                      )}
                    </CardBody>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function StageIcon({ status }: { status: string }) {
  if (status === 'completed' || status === 'skipped')
    return <CircleCheck size={18} className="text-positive" />
  if (status === 'locked') return <Lock size={16} className="text-ink-faint" />
  return <CircleDot size={18} className="text-accent" />
}

function ObjectiveIcon({ status }: { status: string }) {
  if (status === 'mastered') return <CircleCheck size={15} className="text-positive mt-0.5 shrink-0" />
  if (status === 'demonstrated')
    return <SkipForward size={15} className="text-caution mt-0.5 shrink-0" />
  return <CircleDot size={15} className="text-ink-faint mt-0.5 shrink-0" />
}
