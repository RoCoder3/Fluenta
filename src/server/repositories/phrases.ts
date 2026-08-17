import 'server-only'

/**
 * Phrase persistence.
 *
 * The corpus is shared across learners and deduped on (languageCode,
 * normalized). Two people learning "Ich möchte einen Termin vereinbaren" get
 * the same phrase row and their own `user_phrases` state on top of it — which
 * is what makes generated content accumulate into an asset rather than
 * duplicating forever.
 */

import { and, eq, inArray, sql } from 'drizzle-orm'

import { normalizePhrase } from '@/lib/utils'
import { getDb } from '@/server/db'
import { phraseExamples, phrases, userPhrases, type Phrase, type UserPhrase } from '@/server/db/schema'
import type { GeneratedPhrase } from '@/server/ai/schemas'

export type PhraseInput = GeneratedPhrase & {
  languageCode?: string
  translationLanguageCode?: string
  source?: 'seed' | 'ai' | 'user' | 'ingested'
  createdByUserId?: string
  isPrivate?: boolean
}

/**
 * Inserts a phrase, or returns the existing row if this exact phrase is
 * already in the corpus. Examples are only added the first time.
 */
export async function upsertPhrase(input: PhraseInput): Promise<Phrase> {
  const db = await getDb()
  const languageCode = input.languageCode ?? 'de'
  const normalized = normalizePhrase(input.text)

  const [existing] = await db
    .select()
    .from(phrases)
    .where(and(eq(phrases.languageCode, languageCode), eq(phrases.normalized, normalized)))
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(phrases)
    .values({
      languageCode,
      translationLanguageCode: input.translationLanguageCode ?? 'en',
      text: input.text.trim(),
      normalized,
      translation: input.translation.trim(),
      literal: input.literal ?? null,
      context: input.context,
      register: input.register,
      regionTag: input.regionTag ?? null,
      naturalnessNote: input.naturalnessNote ?? null,
      difficulty: input.difficulty,
      cefrHint: input.cefrHint ?? null,
      pronunciation: input.pronunciation ?? null,
      lifeAreaKeys: input.lifeAreaKeys ?? [],
      grammarPatterns: input.grammarPatterns ?? [],
      vocab: input.vocab ?? [],
      tags: [],
      source: input.source ?? 'ai',
      createdByUserId: input.createdByUserId ?? null,
      isPrivate: input.isPrivate ?? false,
    })
    .onConflictDoNothing()
    .returning()

  if (created) {
    if (input.examples?.length) {
      await db.insert(phraseExamples).values(
        input.examples.map((e) => ({
          phraseId: created.id,
          text: e.text,
          translation: e.translation,
          note: e.note ?? null,
        })),
      )
    }
    return created
  }

  // Lost a race with a concurrent insert — re-read.
  const [raced] = await db
    .select()
    .from(phrases)
    .where(and(eq(phrases.languageCode, languageCode), eq(phrases.normalized, normalized)))
    .limit(1)

  if (!raced) throw new Error(`Failed to upsert phrase: ${input.text}`)
  return raced
}

export async function upsertPhrases(inputs: PhraseInput[]): Promise<Phrase[]> {
  const out: Phrase[] = []
  for (const input of inputs) {
    out.push(await upsertPhrase(input))
  }
  return out
}

/**
 * Attaches a phrase to a learner so it enters their review queue. Idempotent —
 * re-teaching an already-known phrase must not reset its mastery.
 */
export async function attachToLearner(
  userId: string,
  phraseId: string,
  acquiredVia: UserPhrase['acquiredVia'] = 'lesson',
): Promise<UserPhrase> {
  const db = await getDb()

  const [existing] = await db
    .select()
    .from(userPhrases)
    .where(and(eq(userPhrases.userId, userId), eq(userPhrases.phraseId, phraseId)))
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(userPhrases)
    .values({ userId, phraseId, acquiredVia, dueAt: new Date() })
    .onConflictDoNothing()
    .returning()

  if (created) return created

  const [raced] = await db
    .select()
    .from(userPhrases)
    .where(and(eq(userPhrases.userId, userId), eq(userPhrases.phraseId, phraseId)))
    .limit(1)

  if (!raced) throw new Error('Failed to attach phrase to learner')
  return raced
}

/** Teach a batch: dedupe into the corpus, then put each in the learner's queue. */
export async function teachPhrases(
  userId: string,
  inputs: PhraseInput[],
  acquiredVia: UserPhrase['acquiredVia'] = 'lesson',
): Promise<Phrase[]> {
  const stored = await upsertPhrases(inputs)
  for (const phrase of stored) {
    await attachToLearner(userId, phrase.id, acquiredVia)
  }
  return stored
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export type LibraryFilter = 'all' | 'learning' | 'mastered' | 'review' | 'difficult' | 'favorite' | 'recent'

export type LibraryEntry = Phrase & {
  mastery: number
  status: UserPhrase['status']
  isFavorite: boolean
  dueAt: Date
  lastReviewedAt: Date | null
  reps: number
  userPhraseId: string
}

export async function getLibrary(
  userId: string,
  filter: LibraryFilter = 'all',
  search = '',
): Promise<LibraryEntry[]> {
  const db = await getDb()

  const conditions = [eq(userPhrases.userId, userId)]
  if (filter === 'learning') conditions.push(eq(userPhrases.status, 'learning'))
  if (filter === 'mastered') conditions.push(eq(userPhrases.status, 'mastered'))
  if (filter === 'review') conditions.push(eq(userPhrases.status, 'review'))
  if (filter === 'difficult') conditions.push(eq(userPhrases.status, 'difficult'))
  if (filter === 'favorite') conditions.push(eq(userPhrases.isFavorite, true))

  if (search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`
    conditions.push(sql`(lower(${phrases.text}) like ${term} or lower(${phrases.translation}) like ${term})`)
  }

  const rows = await db
    .select({
      phrase: phrases,
      mastery: userPhrases.mastery,
      status: userPhrases.status,
      isFavorite: userPhrases.isFavorite,
      dueAt: userPhrases.dueAt,
      lastReviewedAt: userPhrases.lastReviewedAt,
      reps: userPhrases.reps,
      userPhraseId: userPhrases.id,
      updatedAt: userPhrases.updatedAt,
    })
    .from(userPhrases)
    .innerJoin(phrases, eq(phrases.id, userPhrases.phraseId))
    .where(and(...conditions))
    .orderBy(sql`${userPhrases.updatedAt} desc`)
    .limit(300)

  return rows.map((r) => ({
    ...r.phrase,
    mastery: r.mastery,
    status: r.status,
    isFavorite: r.isFavorite,
    dueAt: r.dueAt,
    lastReviewedAt: r.lastReviewedAt,
    reps: r.reps,
    userPhraseId: r.userPhraseId,
  }))
}

export async function getPhraseWithExamples(phraseId: string) {
  const db = await getDb()
  const [phrase] = await db.select().from(phrases).where(eq(phrases.id, phraseId)).limit(1)
  if (!phrase) return null
  const examples = await db.select().from(phraseExamples).where(eq(phraseExamples.phraseId, phraseId))
  return { phrase, examples }
}

export async function toggleFavorite(userId: string, phraseId: string): Promise<boolean> {
  const db = await getDb()
  const [current] = await db
    .select({ id: userPhrases.id, isFavorite: userPhrases.isFavorite })
    .from(userPhrases)
    .where(and(eq(userPhrases.userId, userId), eq(userPhrases.phraseId, phraseId)))
    .limit(1)

  if (!current) return false
  await db
    .update(userPhrases)
    .set({ isFavorite: !current.isFavorite, updatedAt: new Date() })
    .where(eq(userPhrases.id, current.id))
  return !current.isFavorite
}

/** Phrases the learner already has, for engines that must avoid re-teaching. */
export async function getKnownTexts(userId: string, limit = 200): Promise<string[]> {
  const db = await getDb()
  const rows = await db
    .select({ text: phrases.text })
    .from(userPhrases)
    .innerJoin(phrases, eq(phrases.id, userPhrases.phraseId))
    .where(eq(userPhrases.userId, userId))
    .limit(limit)
  return rows.map((r) => r.text)
}

export async function findPhrasesByIds(ids: string[]): Promise<Phrase[]> {
  if (!ids.length) return []
  const db = await getDb()
  return db.select().from(phrases).where(inArray(phrases.id, ids))
}
