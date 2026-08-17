import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { getActiveLanguage } from '@/server/learner/language'
import { getGrammarHistory } from '@/server/engines/tutor'

import { GrammarPage as GrammarClient } from './grammar'

export const metadata: Metadata = { title: 'Grammar' }

export default async function GrammarPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const history = await getGrammarHistory(user.id, await getActiveLanguage(user.id), 25)

  return (
    <GrammarClient
      history={history.map((h) => ({
        id: h.id,
        question: h.question,
        simple: h.simple,
        detailed: h.detailed,
        examples: h.examples,
        comparison: h.comparison,
        createdAt: h.createdAt.toISOString(),
      }))}
    />
  )
}
