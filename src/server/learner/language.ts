import 'server-only'

/**
 * Which language a learner is currently studying, and which they have started.
 *
 * Every per-learner read and write is scoped by the active language, so this is
 * the one place that answers "scoped to what?". Engines that already hold a
 * `LearnerModel` should use `model.targetLanguageCode` rather than calling in
 * here again — it is the same answer, already loaded.
 */

import { and, asc, eq } from 'drizzle-orm'

import { getDb } from '@/server/db'
import { languages, learnerProfiles, users } from '@/server/db/schema'

/** Used only when a learner has no profile at all — a brand-new account. */
export const FALLBACK_LANGUAGE = 'de'

export type Enrollment = {
  languageCode: string
  name: string
  nativeName: string
  onboarded: boolean
  isActive: boolean
}

/**
 * The language this learner is studying right now.
 *
 * Falls back through the account pointer, then any profile they have, then
 * German. The fallbacks exist for accounts created before multi-language
 * support and for the window between signup and the first onboarding step.
 */
export async function getActiveLanguage(userId: string): Promise<string> {
  const db = await getDb()

  const [user] = await db
    .select({ active: users.activeTargetLanguageCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (user?.active) return user.active

  const [profile] = await db
    .select({ code: learnerProfiles.targetLanguageCode })
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, userId))
    .orderBy(asc(learnerProfiles.createdAt))
    .limit(1)

  return profile?.code ?? FALLBACK_LANGUAGE
}

/** Every language this learner has started, with whether its setup is finished. */
export async function getEnrollments(userId: string): Promise<Enrollment[]> {
  const db = await getDb()
  const active = await getActiveLanguage(userId)

  const rows = await db
    .select({
      languageCode: learnerProfiles.targetLanguageCode,
      onboardingCompletedAt: learnerProfiles.onboardingCompletedAt,
      name: languages.name,
      nativeName: languages.nativeName,
    })
    .from(learnerProfiles)
    .innerJoin(languages, eq(languages.code, learnerProfiles.targetLanguageCode))
    .where(eq(learnerProfiles.userId, userId))
    .orderBy(asc(learnerProfiles.createdAt))

  return rows.map((r) => ({
    languageCode: r.languageCode,
    name: r.name,
    nativeName: r.nativeName,
    onboarded: r.onboardingCompletedAt !== null,
    isActive: r.languageCode === active,
  }))
}

/** Has this learner finished setting up the language they are currently in? */
export async function hasCompletedOnboardingFor(
  userId: string,
  languageCode: string,
): Promise<boolean> {
  const db = await getDb()
  const [row] = await db
    .select({ completedAt: learnerProfiles.onboardingCompletedAt })
    .from(learnerProfiles)
    .where(
      and(
        eq(learnerProfiles.userId, userId),
        eq(learnerProfiles.targetLanguageCode, languageCode),
      ),
    )
    .limit(1)

  return Boolean(row?.completedAt)
}

/**
 * Point the account at a different language.
 *
 * Deliberately does nothing else. Switching is not a migration: the other
 * language's rows are already there, scoped by their own code, and simply
 * become visible again. That is what makes switching back free.
 */
export async function setActiveLanguage(userId: string, languageCode: string): Promise<void> {
  const db = await getDb()
  await db
    .update(users)
    .set({ activeTargetLanguageCode: languageCode, updatedAt: new Date() })
    .where(eq(users.id, userId))
}

/** Languages a learner is allowed to pick as something to study. */
export async function getTargetLanguages() {
  const db = await getDb()
  return db
    .select({
      code: languages.code,
      name: languages.name,
      nativeName: languages.nativeName,
      variants: languages.variants,
    })
    .from(languages)
    .where(eq(languages.isTarget, true))
    .orderBy(asc(languages.name))
}
