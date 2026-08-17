import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { buildLearnerModel } from '@/server/learner/model'

import { ProductionStudio } from '../studio'

export const metadata: Metadata = { title: 'Writing' }

/**
 * Practical formats only (§12) — the things a learner actually has to write in
 * a German-speaking country, not essay prompts.
 */
const FORMATS = [
  {
    key: 'colleague_reply',
    label: 'Reply to a colleague',
    prompt:
      'A colleague messages: "Kannst du heute noch kurz auf meine Frage im Ticket schauen? Ich bräuchte das bis morgen früh." Reply — you can do it, but not before this evening.',
    areaKey: 'work',
  },
  {
    key: 'landlord',
    label: 'Message your landlord',
    prompt:
      'Write to your landlord: the heating has not worked properly for four days, and you would like someone to look at it this week.',
    areaKey: 'housing',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp a friend',
    prompt:
      'Text a friend to suggest doing something this weekend. Keep it casual — this is du, not Sie.',
    areaKey: 'social',
  },
  {
    key: 'cancel_meeting',
    label: 'Cancel a meeting',
    prompt:
      'Write a short message explaining you cannot attend tomorrow\'s meeting, why, and what you propose instead.',
    areaKey: 'work',
  },
  {
    key: 'weekend',
    label: 'Describe your weekend',
    prompt: 'Write four or five sentences about what you actually did last weekend.',
    areaKey: 'social',
  },
  {
    key: 'official_email',
    label: 'Email an office',
    prompt:
      'Write to a municipal office asking what documents you need to bring to register your address, and what their opening hours are.',
    areaKey: 'bureaucracy',
  },
]

export default async function WritingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const model = await buildLearnerModel(user.id)
  const activeKeys = new Set(model.lifeAreas.map((a) => a.key))

  // Formats matching the learner's own life areas come first.
  const sorted = [...FORMATS].sort(
    (a, b) => Number(activeKeys.has(b.areaKey)) - Number(activeKeys.has(a.areaKey)),
  )

  return (
    <ProductionStudio
      mode="writing"
      title="Writing practice"
      subtitle="Real formats — the messages you actually have to send. Corrections, not a grammar worksheet."
      prompts={sorted}
      lang="de-DE"
    />
  )
}
