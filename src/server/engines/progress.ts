import 'server-only'

/**
 * Progress engine (§20).
 *
 * Measures what the product actually claims to deliver: can this person do the
 * things they need to do? Not lessons completed, not streaks, not XP.
 *
 * Two derived numbers matter:
 *   - SKILL SCORES, updated by confidence-weighted evidence rather than
 *     overwritten, so one bad session doesn't erase six weeks.
 *   - LIFE-AREA READINESS, computed from phrase mastery, objectives
 *     demonstrated, and real-world missions completed in that area.
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import { clamp } from '@/lib/utils'
import { getDb } from '@/server/db'
import {
  learnerErrors,
  learningSessions,
  lifeAreas,
  missions,
  phrases,
  progressSnapshots,
  roadmapObjectives,
  roadmapStages,
  roadmaps,
  skills,
  userPhrases,
  type SkillCategory,
} from '@/server/db/schema'

/* -------------------------------------------------------------------------- */
/* Skills                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Folds new evidence into a skill score.
 *
 * The learning rate falls as confidence rises: early estimates move fast
 * because we know little, later ones move slowly because we know a lot. This is
 * what stops the dashboard swinging wildly after a single activity.
 */
export async function applySkillEvidence(
  userId: string,
  evidence: Partial<Record<SkillCategory | string, number>>,
): Promise<void> {
  const db = await getDb()

  for (const [rawCategory, rawScore] of Object.entries(evidence)) {
    if (typeof rawScore !== 'number' || Number.isNaN(rawScore)) continue
    const category = rawCategory as SkillCategory
    const score = clamp(rawScore)

    const [existing] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.category, category)))
      .limit(1)

    if (!existing) {
      await db.insert(skills).values({ userId, category, score, confidence: 0.25 })
      await snapshot(userId, 'skill', category, score)
      continue
    }

    const learningRate = 0.35 * (1 - existing.confidence * 0.7)
    const nextScore = clamp(existing.score + (score - existing.score) * learningRate)
    const nextConfidence = Math.min(0.95, existing.confidence + 0.05)

    await db
      .update(skills)
      .set({ score: nextScore, confidence: nextConfidence, updatedAt: new Date() })
      .where(eq(skills.id, existing.id))

    await snapshot(userId, 'skill', category, nextScore)
  }
}

/** Snapshots are throttled to one per subject per day to keep trends readable. */
async function snapshot(
  userId: string,
  kind: 'skill' | 'life_area' | 'overall',
  subject: string,
  value: number,
): Promise<void> {
  const db = await getDb()
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000)

  const [recent] = await db
    .select({ id: progressSnapshots.id })
    .from(progressSnapshots)
    .where(
      and(
        eq(progressSnapshots.userId, userId),
        eq(progressSnapshots.subject, subject),
        gte(progressSnapshots.recordedAt, since),
      ),
    )
    .limit(1)

  if (recent) {
    await db.update(progressSnapshots).set({ value }).where(eq(progressSnapshots.id, recent.id))
    return
  }

  await db.insert(progressSnapshots).values({ userId, kind, subject, value })
}

/* -------------------------------------------------------------------------- */
/* Life-area readiness                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Readiness = "how well could you actually function here right now?"
 *
 *   50%  usable language in this area (phrase mastery, saturating around 25 phrases)
 *   30%  roadmap objectives demonstrated or mastered
 *   20%  real-world missions completed
 *
 * The mission term is deliberately heavy: doing the thing in real life is
 * stronger evidence than any in-app score.
 */
export async function recomputeAreaReadiness(userId: string, lifeAreaId?: string): Promise<void> {
  const db = await getDb()

  const areas = lifeAreaId
    ? await db.select().from(lifeAreas).where(eq(lifeAreas.id, lifeAreaId))
    : await db.select().from(lifeAreas).where(eq(lifeAreas.userId, userId))

  for (const area of areas) {
    const [phraseRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
        avgMastery: sql<number>`coalesce(avg(${userPhrases.mastery}), 0)`,
      })
      .from(userPhrases)
      .innerJoin(phrases, eq(phrases.id, userPhrases.phraseId))
      // `@>` rather than the `?` jsonb operator: `?` collides with driver
      // placeholder parsing in some Postgres clients.
      .where(
        and(
          eq(userPhrases.userId, userId),
          sql`${phrases.lifeAreaKeys} @> ${JSON.stringify([area.key])}::jsonb`,
        ),
      )

    const phraseCount = Number(phraseRow?.count ?? 0)
    const avgMastery = Number(phraseRow?.avgMastery ?? 0)
    // Volume saturates at 25 phrases; beyond that, mastery is what moves it.
    const volumeFactor = Math.min(1, phraseCount / 25)
    const languageScore = avgMastery * volumeFactor

    const [objectiveRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${roadmapObjectives.status} in ('demonstrated','mastered'))::int`,
      })
      .from(roadmapObjectives)
      .innerJoin(roadmapStages, eq(roadmapStages.id, roadmapObjectives.stageId))
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapStages.roadmapId))
      .where(and(eq(roadmaps.userId, userId), eq(roadmaps.lifeAreaId, area.id)))

    const totalObjectives = Number(objectiveRow?.total ?? 0)
    const doneObjectives = Number(objectiveRow?.done ?? 0)
    const objectiveScore = totalObjectives ? (doneObjectives / totalObjectives) * 100 : 0

    const [missionRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${missions.status} = 'completed')::int`,
      })
      .from(missions)
      .where(and(eq(missions.userId, userId), eq(missions.lifeAreaId, area.id)))

    const totalMissions = Number(missionRow?.total ?? 0)
    const doneMissions = Number(missionRow?.done ?? 0)
    const missionScore = totalMissions ? (doneMissions / totalMissions) * 100 : 0

    const readiness = clamp(languageScore * 0.5 + objectiveScore * 0.3 + missionScore * 0.2)

    await db
      .update(lifeAreas)
      .set({ readiness, updatedAt: new Date() })
      .where(eq(lifeAreas.id, area.id))

    await snapshot(userId, 'life_area', area.key, readiness)
  }
}

/* -------------------------------------------------------------------------- */
/* Roadmap progress                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Marks an objective as demonstrated when the learner produces language that
 * satisfies it. Two independent demonstrations promote it to mastered — once
 * could be luck or a lucky copy of the sample answer.
 */
export async function recordObjectiveEvidence(objectiveId: string): Promise<void> {
  const db = await getDb()

  const [objective] = await db
    .select()
    .from(roadmapObjectives)
    .where(eq(roadmapObjectives.id, objectiveId))
    .limit(1)

  if (!objective) return

  const evidenceCount = objective.evidenceCount + 1
  await db
    .update(roadmapObjectives)
    .set({
      evidenceCount,
      status: evidenceCount >= 2 ? 'mastered' : 'demonstrated',
      lastEvidenceAt: new Date(),
    })
    .where(eq(roadmapObjectives.id, objectiveId))

  await recomputeStageProgress(objective.stageId)
}

export async function recomputeStageProgress(stageId: string): Promise<void> {
  const db = await getDb()

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      weighted: sql<number>`sum(case ${roadmapObjectives.status}
        when 'mastered' then 1.0
        when 'demonstrated' then 0.6
        when 'in_progress' then 0.25
        else 0 end)`,
    })
    .from(roadmapObjectives)
    .where(eq(roadmapObjectives.stageId, stageId))

  const total = Number(row?.total ?? 0)
  if (!total) return

  const progress = clamp((Number(row?.weighted ?? 0) / total) * 100)

  const [stage] = await db
    .select()
    .from(roadmapStages)
    .where(eq(roadmapStages.id, stageId))
    .limit(1)

  if (!stage) return

  const status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : stage.status

  await db.update(roadmapStages).set({ progress, status }).where(eq(roadmapStages.id, stageId))

  // Completing a stage unlocks the next one.
  if (status === 'completed') {
    const next = await db
      .select()
      .from(roadmapStages)
      .where(
        and(
          eq(roadmapStages.roadmapId, stage.roadmapId),
          eq(roadmapStages.orderIndex, stage.orderIndex + 1),
        ),
      )
      .limit(1)

    if (next[0] && next[0].status === 'locked') {
      await db.update(roadmapStages).set({ status: 'available' }).where(eq(roadmapStages.id, next[0].id))
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Dashboard reads                                                            */
/* -------------------------------------------------------------------------- */

export type ProgressTrend = {
  subject: string
  current: number
  previous: number | null
  delta: number | null
  points: Array<{ value: number; at: Date }>
}

/** "Speaking confidence 42% → 61% over six weeks" — the trend that means something. */
export async function getTrends(userId: string, days = 42): Promise<ProgressTrend[]> {
  const db = await getDb()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select()
    .from(progressSnapshots)
    .where(and(eq(progressSnapshots.userId, userId), gte(progressSnapshots.recordedAt, since)))
    .orderBy(progressSnapshots.recordedAt)

  const bySubject = new Map<string, Array<{ value: number; at: Date }>>()
  for (const row of rows) {
    const list = bySubject.get(row.subject) ?? []
    list.push({ value: row.value, at: row.recordedAt })
    bySubject.set(row.subject, list)
  }

  return [...bySubject.entries()].map(([subject, points]) => {
    const current = points[points.length - 1]?.value ?? 0
    const previous = points.length > 1 ? points[0]!.value : null
    return {
      subject,
      current,
      previous,
      delta: previous === null ? null : Math.round(current - previous),
      points,
    }
  })
}

export type ProgressOverview = {
  skills: Array<{ category: SkillCategory; score: number; confidence: number }>
  areas: Array<{ key: string; name: string; readiness: number; priority: number }>
  phrases: { total: number; mastered: number; due: number }
  activity: { sessions: number; minutes: number; last: Date | null }
  errors: { active: number; improving: number; resolved: number }
  missions: { completed: number; open: number }
  trends: ProgressTrend[]
}

export async function getProgressOverview(userId: string): Promise<ProgressOverview> {
  const db = await getDb()

  const [skillRows, areaRows, phraseRow, sessionRows, errorRows, missionRows, trends] = await Promise.all([
    db.select().from(skills).where(eq(skills.userId, userId)),
    db
      .select()
      .from(lifeAreas)
      .where(and(eq(lifeAreas.userId, userId), eq(lifeAreas.isActive, true)))
      .orderBy(lifeAreas.priority),
    db
      .select({
        total: sql<number>`count(*)::int`,
        mastered: sql<number>`count(*) filter (where ${userPhrases.status} = 'mastered')::int`,
        due: sql<number>`count(*) filter (where ${userPhrases.dueAt} <= now())::int`,
      })
      .from(userPhrases)
      .where(eq(userPhrases.userId, userId)),
    db
      .select({
        startedAt: learningSessions.startedAt,
        durationSeconds: learningSessions.durationSeconds,
      })
      .from(learningSessions)
      .where(eq(learningSessions.userId, userId))
      .orderBy(desc(learningSessions.startedAt)),
    db
      .select({ status: learnerErrors.status, n: sql<number>`count(*)::int` })
      .from(learnerErrors)
      .where(eq(learnerErrors.userId, userId))
      .groupBy(learnerErrors.status),
    db
      .select({ status: missions.status, n: sql<number>`count(*)::int` })
      .from(missions)
      .where(eq(missions.userId, userId))
      .groupBy(missions.status),
    getTrends(userId),
  ])

  const errorCounts = { active: 0, improving: 0, resolved: 0 }
  for (const row of errorRows) {
    errorCounts[row.status as keyof typeof errorCounts] = Number(row.n)
  }

  const missionCounts = { completed: 0, open: 0 }
  for (const row of missionRows) {
    if (row.status === 'completed') missionCounts.completed = Number(row.n)
    else if (row.status !== 'skipped') missionCounts.open += Number(row.n)
  }

  return {
    skills: skillRows.map((s) => ({ category: s.category, score: s.score, confidence: s.confidence })),
    areas: areaRows.map((a) => ({ key: a.key, name: a.name, readiness: a.readiness, priority: a.priority })),
    phrases: {
      total: Number(phraseRow[0]?.total ?? 0),
      mastered: Number(phraseRow[0]?.mastered ?? 0),
      due: Number(phraseRow[0]?.due ?? 0),
    },
    activity: {
      sessions: sessionRows.length,
      minutes: Math.round(sessionRows.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60),
      last: sessionRows[0]?.startedAt ?? null,
    },
    errors: errorCounts,
    missions: missionCounts,
    trends,
  }
}

/**
 * "What can I do now that I couldn't do before?" (§20) — assembled from
 * objectives demonstrated and missions completed, newest first.
 */
export async function getNewCapabilities(userId: string, limit = 8): Promise<string[]> {
  const db = await getDb()

  const objectives = await db
    .select({ canDo: roadmapObjectives.canDo, at: roadmapObjectives.lastEvidenceAt })
    .from(roadmapObjectives)
    .innerJoin(roadmapStages, eq(roadmapStages.id, roadmapObjectives.stageId))
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapStages.roadmapId))
    .where(and(eq(roadmaps.userId, userId), inArray(roadmapObjectives.status, ['demonstrated', 'mastered'])))
    .orderBy(desc(roadmapObjectives.lastEvidenceAt))
    .limit(limit)

  const completedMissions = await db
    .select({ title: missions.title, at: missions.completedAt })
    .from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.status, 'completed')))
    .orderBy(desc(missions.completedAt))
    .limit(limit)

  return [
    ...objectives.map((o) => o.canDo),
    ...completedMissions.map((m) => `In the real world: ${m.title.toLowerCase()}`),
  ].slice(0, limit)
}
