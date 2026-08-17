'use client'

import { BookOpen, Loader2, X } from 'lucide-react'
import { useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { Alert, Button, Textarea } from '@/components/ui'
import type { GeneratedGrammar } from '@/server/ai/schemas'
import { explainGrammarAction } from '@/server/actions/practice'

/**
 * Grammar on demand (§17).
 *
 * Deliberately a drawer rather than a section of the lesson: grammar is
 * available everywhere and interrupts nothing. The simple explanation shows
 * first; the detailed one only if asked for.
 */
export function GrammarDrawer({
  open,
  onClose,
  initialQuestion = '',
  triggerText,
}: {
  open: boolean
  onClose: () => void
  initialQuestion?: string
  triggerText?: string
}) {
  const [question, setQuestion] = useState(initialQuestion)
  const [explanation, setExplanation] = useState<GeneratedGrammar | null>(null)
  const [showDetailed, setShowDetailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) return null

  const ask = () =>
    startTransition(async () => {
      setError(null)
      setShowDetailed(false)
      try {
        const result = await explainGrammarAction({ question, triggerText })
        setExplanation(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate an explanation.')
      }
    })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto bg-surface border border-line rounded-t-2xl sm:rounded-2xl shadow-[var(--shadow-soft)] animate-fade-up">
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-accent" />
            <h2 className="font-display text-lg">Grammar, because you asked</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {triggerText && (
            <p className="text-sm text-ink-muted mb-3">
              About: <span className="target-text">{triggerText}</span>
            </p>
          )}

          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder='e.g. "Why is it dem here?" or "When do I use zum instead of zu dem?"'
            rows={2}
            className="min-h-[70px]"
          />

          <Button
            onClick={ask}
            disabled={pending || question.trim().length < 3}
            className="mt-3"
            block
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

          {error && (
            <Alert tone="critical" className="mt-4">
              {error}
            </Alert>
          )}

          {explanation && (
            <div className="mt-6 space-y-5 animate-fade-up">
              <p className="text-[15px] leading-relaxed">{explanation.simple}</p>

              {explanation.examples.length > 0 && (
                <div className="space-y-2.5">
                  {explanation.examples.map((ex) => (
                    <div key={ex.text} className="flex items-start gap-2">
                      <AudioButton text={ex.text} size="sm" showSlow={false} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="target-text text-[15px]">{ex.text}</p>
                        <p className="text-[13px] text-ink-muted mt-0.5">{ex.translation}</p>
                        {ex.note && <p className="text-xs text-ink-faint mt-0.5">{ex.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {explanation.comparison && (
                <div className="rounded-lg bg-accent-soft/50 border border-accent/20 px-3.5 py-3">
                  <p className="text-[13px] leading-relaxed">{explanation.comparison}</p>
                </div>
              )}

              {explanation.detailed && !showDetailed && (
                <Button variant="quiet" size="sm" onClick={() => setShowDetailed(true)}>
                  Give me the full version
                </Button>
              )}

              {showDetailed && explanation.detailed && (
                <div className="pt-4 border-t border-line animate-fade-up">
                  <p className="text-sm leading-relaxed text-ink-muted">{explanation.detailed}</p>
                </div>
              )}

              <p className="text-xs text-ink-faint pt-2 border-t border-line leading-relaxed">
                You don&rsquo;t need to memorize this. You&rsquo;ll meet the pattern repeatedly in
                context, which is where it actually sticks.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
