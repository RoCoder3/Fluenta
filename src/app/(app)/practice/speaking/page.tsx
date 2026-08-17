import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { languages } from '@/server/db/schema'
import { buildLearnerModel } from '@/server/learner/model'

import { ProductionStudio } from '../studio'

export const metadata: Metadata = { title: 'Speaking' }

const PROMPTS = [
  {
    key: 'day',
    label: 'Your day',
    prompt: 'Talk for one minute about what you did today. Keep going even when you get stuck.',
    areaKey: 'daily_life',
  },
  {
    key: 'job',
    label: 'Explain your job',
    prompt:
      'Explain what you do for work to someone outside your field. No jargon — they should actually understand it.',
    areaKey: 'work',
  },
  {
    key: 'problem',
    label: 'Explain a problem',
    prompt:
      'Describe a problem you ran into recently and what you did about it. Past tense, roughly a minute.',
    areaKey: 'work',
  },
  {
    key: 'opinion',
    label: 'Give an opinion',
    prompt:
      'Say what you think about working from home, and give at least one reason. Then give the counter-argument.',
    areaKey: 'social',
  },
  {
    key: 'plans',
    label: 'Weekend plans',
    prompt: 'Say what you are planning this weekend, and why.',
    areaKey: 'social',
  },
  {
    key: 'story',
    label: 'Tell a story',
    prompt:
      'Tell a short story about something that happened to you — something mildly annoying or funny works best.',
    areaKey: 'social',
  },
]

export default async function SpeakingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const model = await buildLearnerModel(user.id)
  const db = await getDb()
  const [language] = await db
    .select({ speechTag: languages.speechTag })
    .from(languages)
    .where(eq(languages.code, model.targetLanguageCode))
    .limit(1)

  const activeKeys = new Set(model.lifeAreas.map((a) => a.key))
  const sorted = [...PROMPTS].sort(
    (a, b) => Number(activeKeys.has(b.areaKey)) - Number(activeKeys.has(a.areaKey)),
  )

  return (
    <ProductionStudio
      mode="speaking"
      title="Speaking practice"
      subtitle="The goal is not a perfect accent. It is whether you can be understood, and whether you can keep going when a sentence falls apart mid-way."
      prompts={sorted}
      lang={language?.speechTag ?? 'de-DE'}
    />
  )
}
