import 'server-only'

/**
 * Review engine — contextual spaced repetition (§15).
 *
 * Two departures from a standard SRS:
 *
 *   1. RECALL MODE MATTERS. Recognizing a phrase is not knowing it. Each review
 *      happens in one of six modes, from `recognize` (easiest) to `spoken`
 *      (hardest), and a phrase is only "mastered" once it has survived several
 *      *different* modes. Answering the same cloze twenty times does not count.
 *
 *   2. MASTERY IS NOT THE SCHEDULER. Interval scheduling is FSRS-like and
 *      handles *when* to show something. Mastery is computed separately from
 *      accuracy, context diversity and recency, and drives what the learner is
 *      shown about their own progress.
 */

import { and, asc, eq, lte, sql } from 'drizzle-orm'

import { getDb } from '@/server/db'
import { phrases, userPhrases, type ContextPerformance, type UserPhrase } from '@/server/db/schema'
import { clamp } from '@/lib/utils'

export type RecallMode = keyof ContextPerformance

/** Ordered by cognitive demand — used to weight mastery. */
export const RECALL_MODES: RecallMode[] = [
  'recognize',
  'cloze',
  'translate',
  'produce',
  'situational',
  'spoken',
]

const MODE_WEIGHT: Record<RecallMode, number> = {
  recognize: 0.4,
  cloze: 0.7,
  translate: 0.85,
  produce: 1.0,
  situational: 1.15,
  spoken: 1.25,
}

/** Learner's own signal, combined with correctness. */
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

export type ReviewOutcome = {
  phraseId: string
  mode: RecallMode
  correct: boolean
  grade: ReviewGrade
  responseMs?: number
}

/* -------------------------------------------------------------------------- */
/* Scheduling                                                                 */
/* -------------------------------------------------------------------------- */

const MIN_STABILITY = 0.5
const MAX_INTERVAL_DAYS = 365

function nextStability(current: UserPhrase, outcome: ReviewOutcome): number {
  const s = Math.max(current.stability, MIN_STABILITY)
  const d = current.difficultyFactor // 1 (easy) … 10 (hard)

  if (!outcome.correct || outcome.grade === 'again') {
    // Lapse: collapse stability but keep some credit for prior exposure.
    return Math.max(MIN_STABILITY, s * 0.35)
  }

  const gradeBoost = { again: 0, hard: 1.1, good: 1.6, easy: 2.3 }[outcome.grade]
  // Harder recall modes earn a bigger interval — producing it means more than recognizing it.
  const modeBoost = MODE_WEIGHT[outcome.mode]
  const difficultyPenalty = 1 - (d - 5) * 0.05

  return Math.min(MAX_INTERVAL_DAYS, s * gradeBoost * modeBoost * Math.max(0.5, difficultyPenalty) + 0.6)
}

function nextDifficulty(current: UserPhrase, outcome: ReviewOutcome): number {
  const delta = { again: 1.0, hard: 0.35, good: -0.1, easy: -0.5 }[outcome.grade]
  return clamp(current.difficultyFactor + delta, 1, 10)
}

/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

function emptyPerformance(): ContextPerformance {
  return RECALL_MODES.reduce((acc, mode) => {
    acc[mode] = { attempts: 0, correct: 0, lastAt: null }
    return acc
  }, {} as ContextPerformance)
}

/**
 * Mastery blends three things:
 *   - accuracy, weighted by how demanding each mode is
 *   - context diversity: how many distinct modes have been passed
 *   - recency: knowledge decays if it hasn't been touched
 *
 * The diversity term is what stops a phrase reaching "mastered" through
 * repetition of a single easy mode.
 */
export function computeMastery(perf: ContextPerformance, lastReviewedAt: Date | null): number {
  let weightedCorrect = 0
  let weightedAttempts = 0
  let modesPassed = 0

  for (const mode of RECALL_MODES) {
    const p = perf[mode]
    if (!p || p.attempts === 0) continue
    const w = MODE_WEIGHT[mode]
    weightedCorrect += p.correct * w
    weightedAttempts += p.attempts * w
    if (p.correct >= 1) modesPassed++
  }

  if (weightedAttempts === 0) return 0

  const accuracy = weightedCorrect / weightedAttempts
  const diversity = Math.min(1, modesPassed / 4) // four distinct modes = full credit

  const daysSince = lastReviewedAt
    ? (Date.now() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0
  const recency = Math.exp(-daysSince / 45) // gentle decay, ~half after 30 days

  const raw = accuracy * 0.55 + diversity * 0.3 + recency * 0.15
  return clamp(Math.round(raw * 100))
}

function statusFor(mastery: number, lapses: number, modesPassed: number): UserPhrase['status'] {
  if (mastery >= 80 && modesPassed >= 3) return 'mastered'
  if (lapses >= 3 && mastery < 50) return 'difficult'
  if (mastery >= 40) return 'review'
  return 'learning'
}

/* -------------------------------------------------------------------------- */
/* Recording a review                                                         */
/* -------------------------------------------------------------------------- */

export async function recordReview(userId: string, outcome: ReviewOutcome): Promise<UserPhrase | null> {
  const db = await getDb()

  const [current] = await db
    .select()
    .from(userPhrases)
    .where(and(eq(userPhrases.userId, userId), eq(userPhrases.phraseId, outcome.phraseId)))
    .limit(1)

  if (!current) return null

  const perf = current.contextPerformance ?? emptyPerformance()
  const bucket = perf[outcome.mode] ?? { attempts: 0, correct: 0, lastAt: null }
  perf[outcome.mode] = {
    attempts: bucket.attempts + 1,
    correct: bucket.correct + (outcome.correct ? 1 : 0),
    lastAt: new Date().toISOString(),
  }

  const stability = nextStability(current, outcome)
  const difficultyFactor = nextDifficulty(current, outcome)
  const intervalDays = Math.max(0.02, stability)
  const now = new Date()
  const mastery = computeMastery(perf, now)
  const modesPassed = RECALL_MODES.filter((m) => (perf[m]?.correct ?? 0) >= 1).length
  const lapses = current.lapses + (outcome.correct ? 0 : 1)

  const avgResponseMs = outcome.responseMs
    ? Math.round(((current.avgResponseMs ?? outcome.responseMs) * 3 + outcome.responseMs) / 4)
    : current.avgResponseMs

  const [updated] = await db
    .update(userPhrases)
    .set({
      contextPerformance: perf,
      stability,
      difficultyFactor,
      intervalDays,
      reps: current.reps + 1,
      lapses,
      mastery,
      status: statusFor(mastery, lapses, modesPassed),
      dueAt: new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000),
      lastReviewedAt: now,
      avgResponseMs,
      updatedAt: now,
    })
    .where(eq(userPhrases.id, current.id))
    .returning()

  return updated ?? null
}

/* -------------------------------------------------------------------------- */
/* Choosing what to review                                                    */
/* -------------------------------------------------------------------------- */

export type DueItem = {
  userPhraseId: string
  phraseId: string
  text: string
  translation: string
  context: string
  mastery: number
  lifeAreaKeys: string[]
  /** The mode this item should be tested in — the point of the whole engine. */
  mode: RecallMode
}

/**
 * Picks the next recall mode for a phrase: the easiest mode it has not yet
 * passed, so every phrase is progressively pushed toward production.
 */
export function nextModeFor(perf: ContextPerformance | null, mastery: number): RecallMode {
  if (!perf) return 'recognize'
  const unpassed = RECALL_MODES.find((m) => (perf[m]?.correct ?? 0) === 0)
  if (unpassed) {
    // Don't jump straight to spoken production on a barely-known phrase.
    const index = RECALL_MODES.indexOf(unpassed)
    if (mastery < 30 && index > 1) return RECALL_MODES[1]!
    return unpassed
  }
  // Everything passed once — rotate through the harder end.
  return mastery >= 70 ? 'situational' : 'produce'
}

export async function getDueItems(userId: string, limit = 12): Promise<DueItem[]> {
  const db = await getDb()

  const rows = await db
    .select({
      userPhraseId: userPhrases.id,
      phraseId: phrases.id,
      text: phrases.text,
      translation: phrases.translation,
      context: phrases.context,
      mastery: userPhrases.mastery,
      lifeAreaKeys: phrases.lifeAreaKeys,
      contextPerformance: userPhrases.contextPerformance,
    })
    .from(userPhrases)
    .innerJoin(phrases, eq(phrases.id, userPhrases.phraseId))
    .where(and(eq(userPhrases.userId, userId), lte(userPhrases.dueAt, new Date())))
    .orderBy(asc(userPhrases.dueAt))
    .limit(limit)

  return rows.map((r) => ({
    userPhraseId: r.userPhraseId,
    phraseId: r.phraseId,
    text: r.text,
    translation: r.translation,
    context: r.context,
    mastery: r.mastery,
    lifeAreaKeys: r.lifeAreaKeys,
    mode: nextModeFor(r.contextPerformance, r.mastery),
  }))
}

export async function countDue(userId: string): Promise<number> {
  const db = await getDb()
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userPhrases)
    .where(and(eq(userPhrases.userId, userId), lte(userPhrases.dueAt, new Date())))
  return Number(row?.n ?? 0)
}

/* -------------------------------------------------------------------------- */
/* Building a review question                                                 */
/* -------------------------------------------------------------------------- */

export type ReviewQuestion = {
  mode: RecallMode
  instruction: string
  /** Shown to the learner; for cloze this has the blank in it. */
  display: string
  expected: string
  hint?: string
  /** Whether the answer should be typed, spoken, or self-graded. */
  answerType: 'typed' | 'spoken' | 'self_graded'
}

/**
 * Turns a due item into an actual question. Deliberately never asks
 * "what does this word mean?" — every mode puts the phrase in a situation.
 */
export function buildReviewQuestion(item: DueItem): ReviewQuestion {
  switch (item.mode) {
    case 'recognize':
      return {
        mode: item.mode,
        instruction: 'Do you know what this means?',
        display: item.text,
        expected: item.translation,
        answerType: 'self_graded',
      }

    case 'cloze': {
      const words = item.text.split(' ')
      // Blank the longest word — usually the content-bearing one.
      const target = words.reduce((a, b) => (b.replace(/\W/g, '').length > a.replace(/\W/g, '').length ? b : a), '')
      const blanked = item.text.replace(target, '_'.repeat(Math.max(3, target.replace(/\W/g, '').length)))
      return {
        mode: item.mode,
        instruction: 'Fill in the gap.',
        display: blanked,
        expected: target.replace(/[.,!?]/g, ''),
        hint: item.translation,
        answerType: 'typed',
      }
    }

    case 'translate':
      return {
        mode: item.mode,
        instruction: 'Say this in German.',
        display: item.translation,
        expected: item.text,
        answerType: 'typed',
      }

    case 'produce':
      return {
        mode: item.mode,
        instruction: 'Write the German for this, without looking.',
        display: item.translation,
        expected: item.text,
        hint: item.context,
        answerType: 'typed',
      }

    case 'situational':
      return {
        mode: item.mode,
        instruction: 'You are in this situation. What do you say?',
        display: item.context,
        expected: item.text,
        answerType: 'typed',
      }

    case 'spoken':
      return {
        mode: item.mode,
        instruction: 'Say it out loud.',
        display: item.context,
        expected: item.text,
        hint: item.translation,
        answerType: 'spoken',
      }
  }
}

/** Forgiving comparison — accent, case and punctuation slips are not failures. */
export function answerMatches(given: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const a = norm(given)
  const b = norm(expected)
  if (a === b) return true
  if (!a) return false

  // Allow a small edit distance on longer answers — a typo is not a knowledge gap.
  if (b.length > 12 && levenshtein(a, b) <= Math.floor(b.length * 0.12)) return true
  return false
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[n] ?? 0
}
