import { Mic, MessagesSquare, PenLine } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Badge, Card, SectionTitle } from '@/components/ui'
import { relativeTime } from '@/lib/utils'
import { getCurrentUser } from '@/server/auth'
import { listConversations, suggestScenarios } from '@/server/engines/conversation'
import { buildLearnerModel } from '@/server/learner/model'

import { PracticeLauncher } from './launcher'

export const metadata: Metadata = { title: 'Practice' }

export default async function PracticePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  const [model, past] = await Promise.all([
    buildLearnerModel(user.id),
    listConversations(user.id, 6),
  ])

  const scenarios = suggestScenarios(model)
  const readiness = Object.fromEntries(model.lifeAreas.map((a) => [a.key, a.readiness]))

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:py-10">
      <header className="mb-7">
        <h1 className="font-display text-3xl mb-2">Practice</h1>
        <p className="text-ink-muted leading-relaxed max-w-2xl">
          Understanding is not the goal. This is where you produce language under something
          resembling real conditions.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3 mb-9">
        <ModeCard
          icon={MessagesSquare}
          title="Conversation"
          body="Roleplay a real situation. Nobody corrects you mid-sentence — feedback comes after."
          href="#scenarios"
        />
        <ModeCard
          icon={PenLine}
          title="Writing"
          body="Emails, messages, explanations. Practical formats, not essays."
          href="/practice/writing"
        />
        <ModeCard
          icon={Mic}
          title="Speaking"
          body="Talk for two minutes about something real, then get an honest read."
          href="/practice/speaking"
        />
      </div>

      <section id="scenarios">
        <SectionTitle>Conversation scenarios</SectionTitle>
        <p className="text-sm text-ink-muted mb-4 leading-relaxed">
          Ordered by where you&rsquo;re weakest, not by difficulty.
        </p>
        <PracticeLauncher
          scenarios={scenarios.map((s) => ({
            key: s.key,
            title: s.title,
            situation: s.situation,
            difficulty: s.difficulty,
            lifeAreaKey: s.lifeAreaKey,
            personaName: s.persona.name,
            personaRole: s.persona.role,
            register: s.persona.register,
            region: s.persona.region,
            readiness: readiness[s.lifeAreaKey],
          }))}
        />
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Past conversations</SectionTitle>
          <div className="space-y-2">
            {past.map((conversation) => (
              <a key={conversation.id} href={`/practice/conversation/${conversation.id}`}>
                <Card className="p-4 hover:border-accent/40 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{conversation.scenarioTitle}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        with {conversation.persona.name} · {conversation.persona.register}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {conversation.status === 'completed' ? (
                        <Badge tone="positive" size="sm">
                          Reviewed
                        </Badge>
                      ) : (
                        <Badge tone="caution" size="sm">
                          Unfinished
                        </Badge>
                      )}
                      <span className="text-xs text-ink-faint">
                        {relativeTime(conversation.startedAt)}
                      </span>
                    </div>
                  </div>
                </Card>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ModeCard({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: typeof Mic
  title: string
  body: string
  href: string
}) {
  return (
    <a href={href}>
      <Card className="p-5 h-full hover:border-accent/40 transition-colors">
        <Icon size={18} className="text-accent mb-3" />
        <p className="font-display text-lg mb-1.5">{title}</p>
        <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
      </Card>
    </a>
  )
}
