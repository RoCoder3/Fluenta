import 'server-only'

/**
 * The Personalization Engine (§34).
 *
 * Assembles everything the system knows about a learner into one object, and
 * serializes it into the compact brief that every AI engine puts in its prompt.
 *
 * There is no LLM call in this file. It is pure aggregation, which is exactly
 * why it exists: the engines stay small because the *context* is built once,
 * here, and correctly.
 */

import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'

import { getDb } from '@/server/db'
import {
  conversations,
  crossDomainItems,
  goals,
  learnerErrors,
  learnerProfiles,
  learningSessions,
  lifeAreas,
  missions,
  phrases,
  productionSubmissions,
  roadmapObjectives,
  roadmapStages,
  roadmaps,
  skills,
  userPhrases,
  users,
  type LearnerError,
  type LearnerProfile,
  type LifeArea,
  type Phrase,
  type Skill,
  type SkillCategory,
  type UserPhrase,
} from '@/server/db/schema'

export type KnownPhrase = Pick<
  Phrase,
  'id' | 'text' | 'translation' | 'context' | 'lifeAreaKeys' | 'grammarPatterns' | 'difficulty'
> & { mastery: number; status: UserPhrase['status'] }

export type LearnerModel = {
  userId: string
  name: string
  profile: LearnerProfile | null
  targetLanguageCode: string
  explanationLanguageCode: string

  lifeAreas: LifeArea[]
  activeGoals: Array<{ id: string; title: string; description: string | null; deadline: Date | null; kind: string }>

  skills: Record<SkillCategory, { score: number; confidence: number }>
  estimatedLevel: string

  /** Well-known phrases, usable as building blocks for new material. */
  knownPhrases: KnownPhrase[]
  /** Shaky phrases that new content should quietly reuse. */
  weakPhrases: KnownPhrase[]
  phraseCounts: { total: number; mastered: number; learning: number; due: number }

  recurringErrors: LearnerError[]

  recentActivity: {
    sessionsLast14Days: number
    lastSessionAt: Date | null
    conversationsCount: number
    writingCount: number
    speakingCount: number
    minutesLast14Days: number
  }

  currentFocus: {
    lifeAreaKey: string | null
    lifeAreaName: string | null
    stageName: string | null
    stageTier: string | null
    objectives: string[]
  }

  /** Area pairs worth bridging: both active, both with material. */
  bridgeCandidates: Array<[string, string]>
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

const ALL_SKILLS: SkillCategory[] = [
  'listening',
  'speaking',
  'reading',
  'writing',
  'vocabulary',
  'pronunciation',
  'confidence',
]

export async function buildLearnerModel(userId: string): Promise<LearnerModel> {
  const db = await getDb()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const [
    userRows,
    profileRows,
    areaRows,
    goalRows,
    skillRows,
    errorRows,
    sessionRows,
    conversationCount,
    writingCount,
    speakingCount,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(learnerProfiles).where(eq(learnerProfiles.userId, userId)).limit(1),
    db
      .select()
      .from(lifeAreas)
      .where(and(eq(lifeAreas.userId, userId), eq(lifeAreas.isActive, true)))
      .orderBy(lifeAreas.priority),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
      .orderBy(goals.createdAt),
    db.select().from(skills).where(eq(skills.userId, userId)),
    db
      .select()
      .from(learnerErrors)
      .where(and(eq(learnerErrors.userId, userId), inArray(learnerErrors.status, ['active', 'improving'])))
      .orderBy(desc(learnerErrors.frequency))
      .limit(12),
    db
      .select({
        startedAt: learningSessions.startedAt,
        durationSeconds: learningSessions.durationSeconds,
        completedAt: learningSessions.completedAt,
      })
      .from(learningSessions)
      .where(and(eq(learningSessions.userId, userId), gte(learningSessions.startedAt, fourteenDaysAgo))),
    countRows(db, conversations, eq(conversations.userId, userId)),
    countRows(
      db,
      productionSubmissions,
      and(eq(productionSubmissions.userId, userId), eq(productionSubmissions.mode, 'writing')),
    ),
    countRows(
      db,
      productionSubmissions,
      and(eq(productionSubmissions.userId, userId), eq(productionSubmissions.mode, 'speaking')),
    ),
  ])

  const user = userRows[0]
  const profile = profileRows[0] ?? null

  const [knownPhrases, weakPhrases, counts, focus] = await Promise.all([
    fetchPhrases(userId, { minMastery: 60, limit: 60 }),
    fetchPhrases(userId, { maxMastery: 60, limit: 30 }),
    fetchPhraseCounts(userId),
    fetchCurrentFocus(userId),
  ])

  const lastSession = await db
    .select({ startedAt: learningSessions.startedAt })
    .from(learningSessions)
    .where(eq(learningSessions.userId, userId))
    .orderBy(desc(learningSessions.startedAt))
    .limit(1)

  return {
    userId,
    name: user?.name ?? 'Learner',
    profile,
    targetLanguageCode: profile?.targetLanguageCode ?? 'de',
    explanationLanguageCode: profile?.explanationLanguageCode ?? 'en',
    lifeAreas: areaRows,
    activeGoals: goalRows.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      deadline: g.deadline,
      kind: g.kind,
    })),
    skills: normalizeSkills(skillRows),
    estimatedLevel: profile?.estimatedLevel ?? 'A1',
    knownPhrases,
    weakPhrases,
    phraseCounts: counts,
    recurringErrors: errorRows,
    recentActivity: {
      sessionsLast14Days: sessionRows.length,
      lastSessionAt: lastSession[0]?.startedAt ?? null,
      conversationsCount: conversationCount,
      writingCount,
      speakingCount,
      minutesLast14Days: Math.round(
        sessionRows.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60,
      ),
    },
    currentFocus: focus,
    bridgeCandidates: computeBridgeCandidates(areaRows, knownPhrases),
  }
}

/* -------------------------------------------------------------------------- */
/* Sub-queries                                                                */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRows(db: any, table: any, where: any): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where)
  return Number(rows[0]?.n ?? 0)
}

async function fetchPhrases(
  userId: string,
  opts: { minMastery?: number; maxMastery?: number; limit: number },
): Promise<KnownPhrase[]> {
  const db = await getDb()
  const conditions = [eq(userPhrases.userId, userId)]
  if (opts.minMastery !== undefined) conditions.push(gte(userPhrases.mastery, opts.minMastery))
  if (opts.maxMastery !== undefined) conditions.push(lte(userPhrases.mastery, opts.maxMastery))

  const rows = await db
    .select({
      id: phrases.id,
      text: phrases.text,
      translation: phrases.translation,
      context: phrases.context,
      lifeAreaKeys: phrases.lifeAreaKeys,
      grammarPatterns: phrases.grammarPatterns,
      difficulty: phrases.difficulty,
      mastery: userPhrases.mastery,
      status: userPhrases.status,
    })
    .from(userPhrases)
    .innerJoin(phrases, eq(phrases.id, userPhrases.phraseId))
    .where(and(...conditions))
    .orderBy(desc(userPhrases.updatedAt))
    .limit(opts.limit)

  return rows
}

async function fetchPhraseCounts(userId: string) {
  const db = await getDb()
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      mastered: sql<number>`count(*) filter (where ${userPhrases.status} = 'mastered')::int`,
      learning: sql<number>`count(*) filter (where ${userPhrases.status} = 'learning')::int`,
      due: sql<number>`count(*) filter (where ${userPhrases.dueAt} <= now())::int`,
    })
    .from(userPhrases)
    .where(eq(userPhrases.userId, userId))

  return {
    total: Number(row?.total ?? 0),
    mastered: Number(row?.mastered ?? 0),
    learning: Number(row?.learning ?? 0),
    due: Number(row?.due ?? 0),
  }
}

/**
 * The highest-priority life area with an unfinished stage. This is what "what
 * should I do next" resolves to when the learner has not chosen explicitly.
 */
async function fetchCurrentFocus(userId: string): Promise<LearnerModel['currentFocus']> {
  const db = await getDb()

  const rows = await db
    .select({
      areaKey: lifeAreas.key,
      areaName: lifeAreas.name,
      stageId: roadmapStages.id,
      stageName: roadmapStages.name,
      stageTier: roadmapStages.tier,
      priority: lifeAreas.priority,
    })
    .from(roadmaps)
    .innerJoin(roadmapStages, eq(roadmapStages.roadmapId, roadmaps.id))
    .innerJoin(lifeAreas, eq(lifeAreas.id, roadmaps.lifeAreaId))
    .where(
      and(
        eq(roadmaps.userId, userId),
        eq(roadmaps.status, 'active'),
        eq(lifeAreas.isActive, true),
        inArray(roadmapStages.status, ['available', 'in_progress']),
      ),
    )
    .orderBy(lifeAreas.priority, roadmapStages.orderIndex)
    .limit(1)

  const focus = rows[0]
  if (!focus) {
    return { lifeAreaKey: null, lifeAreaName: null, stageName: null, stageTier: null, objectives: [] }
  }

  const objectiveRows = await db
    .select({ canDo: roadmapObjectives.canDo })
    .from(roadmapObjectives)
    .where(
      and(
        eq(roadmapObjectives.stageId, focus.stageId),
        inArray(roadmapObjectives.status, ['not_started', 'in_progress']),
      ),
    )
    .orderBy(roadmapObjectives.orderIndex)
    .limit(6)

  return {
    lifeAreaKey: focus.areaKey,
    lifeAreaName: focus.areaName,
    stageName: focus.stageName,
    stageTier: focus.stageTier,
    objectives: objectiveRows.map((o) => o.canDo),
  }
}

function normalizeSkills(rows: Skill[]): LearnerModel['skills'] {
  const out = {} as LearnerModel['skills']
  for (const category of ALL_SKILLS) {
    const found = rows.find((r) => r.category === category)
    out[category] = { score: found?.score ?? 0, confidence: found?.confidence ?? 0.2 }
  }
  return out
}

/**
 * Which life areas are worth bridging (§6): both active, and both already
 * carrying phrases the learner knows — you cannot combine what isn't there.
 */
function computeBridgeCandidates(areas: LifeArea[], known: KnownPhrase[]): Array<[string, string]> {
  const withMaterial = areas
    .map((a) => a.key)
    .filter((key) => known.some((p) => p.lifeAreaKeys.includes(key)))

  const pairs: Array<[string, string]> = []
  for (let i = 0; i < withMaterial.length; i++) {
    for (let j = i + 1; j < withMaterial.length; j++) {
      const a = withMaterial[i]
      const b = withMaterial[j]
      if (a && b) pairs.push([a, b])
    }
  }
  return pairs.slice(0, 8)
}

/* -------------------------------------------------------------------------- */
/* Prompt serialization                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Renders the model as the learner brief that goes into every generation
 * prompt. Deliberately compact — this is prepended to a lot of calls, and a
 * bloated brief costs tokens on every one of them.
 *
 * The learner's *name* is never included: engines address the learner as "the
 * learner", and redaction in the registry is a second line of defence.
 */
export function renderLearnerBrief(
  model: LearnerModel,
  opts: { includePhrases?: boolean; includeErrors?: boolean; phraseLimit?: number } = {},
): string {
  const { includePhrases = true, includeErrors = true, phraseLimit = 25 } = opts
  const p = model.profile
  const lines: string[] = []

  lines.push('## Learner')
  if (p?.city || p?.country) lines.push(`Lives in: ${[p.city, p.country].filter(Boolean).join(', ')}`)
  if (p?.regionPreference) lines.push(`Relevant regional standard: ${p.regionPreference}`)
  if (p?.profession) lines.push(`Profession: ${p.profession}${p.industry ? ` (${p.industry})` : ''}`)
  if (p?.interests?.length) lines.push(`Interests: ${p.interests.join(', ')}`)
  if (p?.dailyActivities?.length) lines.push(`Daily life: ${p.dailyActivities.join(', ')}`)
  if (p?.motivationSummary) lines.push(`Why they need the language: ${p.motivationSummary}`)
  lines.push(`Estimated level: ${model.estimatedLevel}`)
  if (p?.preferences?.formalityDefault) {
    lines.push(`Default address form: ${p.preferences.formalityDefault}`)
  }

  const s = model.skills
  lines.push(
    `Skills (0-100): speaking ${r(s.speaking.score)}, listening ${r(s.listening.score)}, ` +
      `reading ${r(s.reading.score)}, writing ${r(s.writing.score)}, vocabulary ${r(s.vocabulary.score)}`,
  )

  if (model.lifeAreas.length) {
    lines.push('')
    lines.push('## Life areas (priority order, with readiness)')
    for (const area of model.lifeAreas) {
      const subs = area.subAreas?.map((sa) => sa.name).slice(0, 5).join(', ')
      lines.push(`- ${area.name} [${area.key}] — ${r(area.readiness)}% ready${subs ? ` · ${subs}` : ''}`)
    }
  }

  if (model.activeGoals.length) {
    lines.push('')
    lines.push('## Active goals')
    for (const g of model.activeGoals.slice(0, 5)) {
      const due = g.deadline ? ` (by ${g.deadline.toISOString().slice(0, 10)})` : ''
      lines.push(`- ${g.title}${due}`)
    }
  }

  if (model.currentFocus.lifeAreaKey) {
    lines.push('')
    lines.push(
      `## Current focus\n${model.currentFocus.lifeAreaName} — stage "${model.currentFocus.stageName}" (${model.currentFocus.stageTier})`,
    )
    for (const o of model.currentFocus.objectives.slice(0, 5)) lines.push(`- ${o}`)
  }

  if (includePhrases && model.knownPhrases.length) {
    lines.push('')
    lines.push('## Language the learner already knows (reuse this — do not re-teach it)')
    for (const ph of model.knownPhrases.slice(0, phraseLimit)) {
      lines.push(`- ${ph.text}`)
    }
  }

  if (includePhrases && model.weakPhrases.length) {
    lines.push('')
    lines.push('## Shaky — work these back in naturally, without announcing it')
    for (const ph of model.weakPhrases.slice(0, 12)) {
      lines.push(`- ${ph.text}`)
    }
  }

  if (includeErrors && model.recurringErrors.length) {
    lines.push('')
    lines.push('## Recurring mistakes (expose them to correct examples; do NOT drill)')
    for (const e of model.recurringErrors.slice(0, 8)) {
      lines.push(`- ${e.label} (${e.frequency}×, ${e.severity})`)
    }
  }

  return lines.join('\n')
}

function r(n: number): number {
  return Math.round(n)
}

/**
 * The single sentence the dashboard shows as "biggest weakness". Comparing
 * production against comprehension is the most common real gap, so it is
 * checked first.
 */
export function describeBiggestGap(model: LearnerModel): string {
  const s = model.skills
  const comprehension = (s.listening.score + s.reading.score) / 2
  const production = (s.speaking.score + s.writing.score) / 2

  if (model.phraseCounts.total < 10) {
    return 'You are just getting started — the first sessions will map out where you actually stand.'
  }
  if (comprehension - production > 15) {
    return 'You understand German noticeably better than you can produce it. More speaking, less input.'
  }
  if (s.speaking.score < s.writing.score - 12) {
    return 'Your writing is ahead of your speaking. You need time under pressure, not more vocabulary.'
  }
  const weakestArea = [...model.lifeAreas].sort((a, b) => a.readiness - b.readiness)[0]
  if (weakestArea && weakestArea.readiness < 40) {
    return `${weakestArea.name} is your thinnest area — you have the least usable language there.`
  }
  if (model.recurringErrors[0]) {
    return `${model.recurringErrors[0].label} keeps coming back. You'll see more correct examples of it in context.`
  }
  return 'Your skills are developing evenly. Keep pushing into unscripted speaking.'
}
