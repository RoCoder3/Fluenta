'use client'

/**
 * AI Tutor + "What do I need to learn?" (§23).
 *
 * Two modes on one page: free chat about the language, and goal planning that
 * turns "I have an interview next Friday" into a real roadmap in the database.
 */

import { CalendarClock, Loader2, Send, Sparkles, Target } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { PhraseCard } from '@/components/phrase-card'
import { Alert, Badge, Button, Card, Input, SectionTitle, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { planGoalAction, tutorChatAction } from '@/server/actions/practice'
import type { GeneratedGoalPlan, GeneratedTutorReply } from '@/server/ai/schemas'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  examples?: Array<{ text: string; translation: string }>
  action?: { label: string; kind: string }
}

export function TutorConsole({
  suggestions,
  goals,
}: {
  suggestions: string[]
  goals: Array<{ id: string; title: string; description: string | null; kind: string; deadline: string | null }>
}) {
  const [tab, setTab] = useState<'chat' | 'plan'>('chat')

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:py-10">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={20} className="text-accent" />
          <h1 className="font-display text-3xl">AI Tutor</h1>
        </div>
        <p className="text-ink-muted leading-relaxed">
          Ask anything about the language, or tell it what&rsquo;s coming up and get a plan built for
          it.
        </p>
      </header>

      <div className="flex gap-1.5 mb-6">
        {(
          [
            { key: 'chat', label: 'Ask anything' },
            { key: 'plan', label: 'What do I need to learn?' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 rounded-full text-sm border transition-all',
              tab === t.key
                ? 'bg-accent text-accent-ink border-accent'
                : 'bg-surface border-line-strong text-ink-muted hover:border-ink-faint',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'chat' ? <ChatPanel suggestions={suggestions} /> : <PlanPanel goals={goals} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function ChatPanel({ suggestions }: { suggestions: string[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = (text: string) => {
    if (!text.trim()) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, { role: 'user', content: text.trim() }])
    setInput('')
    setError(null)

    startTransition(async () => {
      try {
        const reply: GeneratedTutorReply = await tutorChatAction({ message: text.trim(), history })
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: reply.reply,
            examples: reply.targetLanguageExamples,
            action: reply.suggestedAction,
          },
        ])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not get a reply.')
      }
    })
  }

  return (
    <>
      {messages.length === 0 && (
        <div className="mb-6">
          <SectionTitle>Try asking</SectionTitle>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                className="w-full text-left px-4 py-3 rounded-[10px] border border-line-strong bg-surface text-sm hover:border-accent transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4 mb-5">
        {messages.map((message, i) => (
          <div
            key={i}
            className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3 animate-fade-up',
                message.role === 'user'
                  ? 'bg-accent text-accent-ink rounded-br-md'
                  : 'bg-surface border border-line rounded-bl-md',
              )}
            >
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>

              {message.examples && message.examples.length > 0 && (
                <div className="mt-3.5 pt-3.5 border-t border-line/60 space-y-2.5">
                  {message.examples.map((example) => (
                    <div key={example.text} className="flex items-start gap-2">
                      <AudioButton
                        text={example.text}
                        size="sm"
                        showSlow={false}
                        className="shrink-0 mt-0.5"
                      />
                      <div>
                        <p className="target-text text-[15px]">{example.text}</p>
                        <p className="text-[13px] text-ink-muted mt-0.5">{example.translation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {message.action && (
                <Link
                  href={
                    message.action.kind === 'start_conversation'
                      ? '/practice'
                      : message.action.kind === 'practice_writing'
                        ? '/practice/writing'
                        : message.action.kind === 'review'
                          ? '/learn'
                          : '/home'
                  }
                  className="inline-block mt-3"
                >
                  <Button size="sm" variant="secondary">
                    {message.action.label}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="bg-surface border border-line rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 size={15} className="animate-spin text-ink-faint" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <Alert tone="critical" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="flex items-end gap-2 sticky bottom-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder="Ask about a word, a pattern, or what to do next…"
          className="min-h-[46px] max-h-32 py-3"
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
        />
        <Button
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={pending || !input.trim()}
          onClick={() => send(input)}
          aria-label="Send"
        >
          <Send size={16} />
        </Button>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function PlanPanel({
  goals,
}: {
  goals: Array<{ id: string; title: string; description: string | null; kind: string; deadline: string | null }>
}) {
  const [request, setRequest] = useState('')
  const [deadline, setDeadline] = useState('')
  const [plan, setPlan] = useState<GeneratedGoalPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      setError(null)
      try {
        const result = await planGoalAction({ request, deadline: deadline || undefined })
        setPlan(result.plan)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not build a plan.')
      }
    })

  if (plan) {
    return (
      <div className="animate-fade-up space-y-7">
        <div>
          <Badge tone="accent" className="mb-3">
            {plan.kind === 'temporary' ? 'Time-boxed goal' : 'Ongoing goal'}
          </Badge>
          <h2 className="font-display text-2xl mb-2">{plan.title}</h2>
          <p className="text-ink-muted leading-relaxed">{plan.goalStatement}</p>
        </div>

        <section>
          <SectionTitle>What you need to be able to do</SectionTitle>
          <div className="space-y-2.5">
            {[...plan.requiredSkills]
              .sort((a, b) => a.priority - b.priority)
              .map((skill) => (
                <Card key={skill.skill} className="p-4">
                  <div className="flex items-start gap-2.5">
                    <Target
                      size={15}
                      className={cn(
                        'mt-0.5 shrink-0',
                        skill.priority === 1 ? 'text-critical' : 'text-ink-faint',
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium">{skill.skill}</p>
                      <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">{skill.why}</p>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </section>

        {plan.starterPhrases.length > 0 && (
          <section>
            <SectionTitle>Start with these</SectionTitle>
            <div className="space-y-2">
              {plan.starterPhrases.map((phrase) => (
                <PhraseCard key={phrase.text} phrase={phrase} />
              ))}
            </div>
            <p className="text-xs text-ink-faint mt-2">Added to your phrasebook and review queue.</p>
          </section>
        )}

        <section>
          <SectionTitle>The plan</SectionTitle>
          <ol className="space-y-2.5">
            {plan.plan.map((step, i) => (
              <li key={step.step} className="flex gap-3">
                <span className="text-xs tabular-nums text-ink-faint w-4 shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm">{step.step}</p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {step.focus} · about {step.estimatedSessions}{' '}
                    {step.estimatedSessions === 1 ? 'session' : 'sessions'}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Alert tone="accent">
          This is now a goal on your dashboard, with a roadmap attached. Sessions will pull from it.
        </Alert>

        <div className="flex gap-2">
          <Link href="/home" className="flex-1">
            <Button block>Go to home</Button>
          </Link>
          <Button variant="secondary" onClick={() => setPlan(null)}>
            Plan something else
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {goals.length > 0 && (
        <div className="mb-7">
          <SectionTitle>Your active goals</SectionTitle>
          <div className="space-y-2">
            {goals.map((goal) => (
              <Card key={goal.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{goal.title}</p>
                    {goal.description && (
                      <p className="text-[13px] text-ink-muted mt-0.5 leading-relaxed">
                        {goal.description}
                      </p>
                    )}
                  </div>
                  {goal.deadline && (
                    <Badge tone="caution" size="sm">
                      <CalendarClock size={11} />
                      {new Date(goal.deadline).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="p-5">
        <p className="text-sm font-medium mb-1">What&rsquo;s coming up?</p>
        <p className="text-[13px] text-ink-muted mb-4 leading-relaxed">
          A trip, an interview, meeting someone&rsquo;s family, a presentation. Describe it and
          you&rsquo;ll get a plan working backwards from it.
        </p>

        <Textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={3}
          placeholder="e.g. I have a German job interview next Friday for a backend role."
        />

        <div className="mt-3">
          <label className="text-[13px] text-ink-muted block mb-1.5">When is it? (optional)</label>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>

        {error && (
          <Alert tone="critical" className="mt-4">
            {error}
          </Alert>
        )}

        <Button
          onClick={submit}
          disabled={pending || request.trim().length < 10}
          block
          size="lg"
          className="mt-4"
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Working backwards from it…
            </>
          ) : (
            'Build my plan'
          )}
        </Button>
      </Card>
    </>
  )
}
