'use client'

/**
 * Grammar section (§17).
 *
 * Present, but deliberately secondary. The page leads by telling the learner
 * they probably don't need it, and there are no exercises anywhere — only
 * answers to questions they actually asked.
 */

import { BookOpen, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { Alert, Button, Card, EmptyState, SectionTitle, Textarea } from '@/components/ui'
import { relativeTime } from '@/lib/utils'
import { explainGrammarAction } from '@/server/actions/practice'
import type { GeneratedGrammar } from '@/server/ai/schemas'

type HistoryEntry = {
  id: string
  question: string
  simple: string
  detailed: string | null
  examples: Array<{ text: string; translation: string; note?: string }>
  comparison: string | null
  createdAt: string
}

const COMMON_QUESTIONS = [
  'Why is it "zum Supermarkt" and not "zu dem Supermarkt"?',
  'When do I use "der", "die" or "das"? Is there any logic to it?',
  'Why does the verb go to the end after "weil"?',
  'What is the difference between "du" and "Sie", really?',
  'Why do Germans say "doch" and "mal" all the time?',
]

export function GrammarPage({ history }: { history: HistoryEntry[] }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<GeneratedGrammar | null>(null)
  const [showDetailed, setShowDetailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ask = (text: string) => {
    if (text.trim().length < 5) return
    startTransition(async () => {
      setError(null)
      setShowDetailed(false)
      setQuestion(text)
      try {
        setAnswer(await explainGrammarAction({ question: text }))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate an explanation.')
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:py-10">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={20} className="text-accent" />
          <h1 className="font-display text-3xl">Grammar</h1>
        </div>
        <p className="text-ink-muted leading-relaxed max-w-2xl">
          Grammar is here when you want it. Most of it you&rsquo;ll absorb from meeting patterns
          repeatedly in real sentences, which is why nothing in this app drills you on cases. But
          sometimes you just want to know why &mdash; so ask.
        </p>
      </header>

      <Card className="p-5 mb-7">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder='e.g. "Why is it dem here and not den?"'
          className="min-h-[70px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(question)
          }}
        />
        <Button
          onClick={() => ask(question)}
          disabled={pending || question.trim().length < 5}
          className="mt-3"
        >
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Thinking…
            </>
          ) : (
            'Explain'
          )}
        </Button>
      </Card>

      {error && (
        <Alert tone="critical" className="mb-6">
          {error}
        </Alert>
      )}

      {answer && (
        <Card raised className="p-6 mb-8 animate-fade-up">
          <p className="text-[15px] leading-relaxed">{answer.simple}</p>

          {answer.examples.length > 0 && (
            <div className="mt-5 space-y-3">
              {answer.examples.map((example) => (
                <div key={example.text} className="flex items-start gap-2">
                  <AudioButton text={example.text} size="sm" showSlow={false} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="target-text text-[16px]">{example.text}</p>
                    <p className="text-[13px] text-ink-muted mt-0.5">{example.translation}</p>
                    {example.note && (
                      <p className="text-xs text-ink-faint mt-0.5">{example.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {answer.comparison && (
            <div className="mt-5 rounded-lg bg-accent-soft/50 border border-accent/20 px-4 py-3">
              <p className="text-[13px] leading-relaxed">{answer.comparison}</p>
            </div>
          )}

          {answer.detailed && !showDetailed && (
            <Button variant="quiet" size="sm" className="mt-5" onClick={() => setShowDetailed(true)}>
              Give me the full version
            </Button>
          )}

          {showDetailed && answer.detailed && (
            <div className="mt-5 pt-5 border-t border-line animate-fade-up">
              <p className="text-sm leading-relaxed text-ink-muted">{answer.detailed}</p>
            </div>
          )}

          <p className="text-xs text-ink-faint mt-6 pt-4 border-t border-line leading-relaxed">
            No exercises follow. You&rsquo;ll meet this pattern in context repeatedly, which is where
            it actually becomes automatic.
          </p>
        </Card>
      )}

      {!answer && (
        <section className="mb-8">
          <SectionTitle>Things people usually ask</SectionTitle>
          <div className="space-y-2">
            {COMMON_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                disabled={pending}
                className="w-full text-left px-4 py-3 rounded-[10px] border border-line-strong bg-surface text-sm hover:border-accent transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Things you&rsquo;ve asked</SectionTitle>
        {history.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing yet"
              description="Questions you ask here or from a phrase card are kept, so you can come back to them."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <Card key={entry.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-medium">{entry.question}</p>
                  <span className="text-xs text-ink-faint shrink-0">
                    {relativeTime(entry.createdAt)}
                  </span>
                </div>
                <p className="text-[13px] text-ink-muted leading-relaxed">{entry.simple}</p>
                {entry.examples.length > 0 && (
                  <p className="target-text text-[14px] mt-2">{entry.examples[0]!.text}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
