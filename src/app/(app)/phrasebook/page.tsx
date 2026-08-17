import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { getLibrary, type LibraryFilter } from '@/server/repositories/phrases'

import { Phrasebook } from './phrasebook'

export const metadata: Metadata = { title: 'Phrasebook' }

export default async function PhrasebookPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const { filter, q } = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const validFilters: LibraryFilter[] = [
    'all',
    'learning',
    'review',
    'mastered',
    'difficult',
    'favorite',
  ]
  const active = validFilters.includes(filter as LibraryFilter) ? (filter as LibraryFilter) : 'all'

  const entries = await getLibrary(user.id, active, q ?? '')

  return (
    <Phrasebook
      filter={active}
      query={q ?? ''}
      entries={entries.map((e) => ({
        id: e.id,
        text: e.text,
        translation: e.translation,
        literal: e.literal,
        context: e.context,
        register: e.register,
        regionTag: e.regionTag,
        naturalnessNote: e.naturalnessNote,
        pronunciation: e.pronunciation,
        difficulty: e.difficulty,
        lifeAreaKeys: e.lifeAreaKeys,
        grammarPatterns: e.grammarPatterns,
        vocab: e.vocab,
        mastery: e.mastery,
        status: e.status,
        isFavorite: e.isFavorite,
        reps: e.reps,
      }))}
    />
  )
}
