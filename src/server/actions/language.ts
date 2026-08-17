'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { languages } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import {
  getEnrollments,
  hasCompletedOnboardingFor,
  setActiveLanguage,
  type Enrollment,
} from '@/server/learner/language'

/**
 * Switches the learner to another language.
 *
 * Two outcomes, and the difference is the whole feature:
 *
 *   - They have studied it before → the switch is instant. Their phrases,
 *     roadmaps, errors and readiness for that language are still there, scoped
 *     by its code, and simply become visible again.
 *   - They have not → they go through onboarding for it, once. The app cannot
 *     personalize a language it has never asked them anything about, and
 *     borrowing their answers from another language would produce a roadmap
 *     built on the wrong assumptions.
 *
 * Nothing is deleted or migrated either way.
 */
export async function switchLanguageAction(languageCode: string): Promise<void> {
  const user = await requireUser()
  const db = await getDb()

  const [language] = await db
    .select({ code: languages.code, isTarget: languages.isTarget })
    .from(languages)
    .where(eq(languages.code, languageCode))
    .limit(1)

  if (!language?.isTarget) {
    throw new Error(`"${languageCode}" is not available to learn.`)
  }

  await setActiveLanguage(user.id, language.code)

  const ready = await hasCompletedOnboardingFor(user.id, language.code)

  // Layout-level revalidation: the nav, the due count and every page's content
  // all change with the language, so revalidating one route is not enough.
  revalidatePath('/', 'layout')

  redirect(ready ? '/home' : '/onboarding')
}

/** The languages this learner has started, for the switcher menu. */
export async function listEnrollmentsAction(): Promise<Enrollment[]> {
  const user = await requireUser()
  return getEnrollments(user.id)
}
