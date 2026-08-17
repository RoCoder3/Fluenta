'use client'

/**
 * Shared studio for free writing and speaking practice (§12, §13).
 *
 * One component because the flow is identical — pick a prompt, produce, get
 * feedback — and only the input surface differs.
 */

import { ArrowLeft, Loader2, Mic, Square } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import { Alert, Button, Card, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from '@/lib/use-speech-recognition'
import { evaluateSpeakingAction, evaluateWritingAction } from '@/server/actions/learning'
import type { GeneratedEvaluation } from '@/server/ai/schemas'

import { EvaluationPanel } from '../learn/[sessionId]/runner'

type PromptOption = { key: string; label: string; prompt: string; areaKey: string }

export function ProductionStudio({
  mode,
  title,
  subtitle,
  prompts,
  lang,
}: {
  mode: 'writing' | 'speaking'
  title: string
  subtitle: string
  prompts: PromptOption[]
  lang: string
}) {
  const [selected, setSelected] = useState<PromptOption>(prompts[0]!)
  const [custom, setCustom] = useState('')
  const [text, setText] = useState('')
  const [evaluation, setEvaluation] = useState<GeneratedEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const speech = useSpeechRecognition(lang)
  const activePrompt = custom.trim() || selected.prompt
  const content = mode === 'speaking' ? speech.transcript : text

  const submit = () =>
    startTransition(async () => {
      setError(null)
      try {
        const result =
          mode === 'speaking'
            ? await evaluateSpeakingAction({
                prompt: activePrompt,
                transcript: speech.transcript,
                durationSeconds: speech.seconds,
                lifeAreaKey: selected.areaKey,
              })
            : await evaluateWritingAction({
                prompt: activePrompt,
                content: text,
                format: selected.key,
                lifeAreaKey: selected.areaKey,
              })
        setEvaluation(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not evaluate that.')
      }
    })

  const reset = () => {
    setEvaluation(null)
    setText('')
    speech.reset()
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:py-10">
      <Link
        href="/practice"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-5"
      >
        <ArrowLeft size={15} />
        Practice
      </Link>

      <header className="mb-7">
        <h1 className="font-display text-3xl mb-2">{title}</h1>
        <p className="text-ink-muted leading-relaxed">{subtitle}</p>
      </header>

      {evaluation ? (
        <>
          <Card className="p-4 mb-5 bg-canvas">
            <p className="text-sm text-ink-muted leading-relaxed">{activePrompt}</p>
          </Card>
          <EvaluationPanel
            evaluation={evaluation}
            learnerText={content}
            spoken={mode === 'speaking'}
          />
          <Button onClick={reset} variant="secondary" block size="lg" className="mt-6">
            Try another
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            {prompts.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setSelected(p)
                  setCustom('')
                }}
                className={cn(
                  'px-3.5 py-2 rounded-full text-sm border transition-all',
                  selected.key === p.key && !custom.trim()
                    ? 'bg-accent text-accent-ink border-accent'
                    : 'bg-surface border-line-strong text-ink-muted hover:border-ink-faint',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Card className="p-5 mb-5">
            <p className="text-[15px] leading-relaxed">{activePrompt}</p>
          </Card>

          <details className="mb-5">
            <summary className="text-sm text-ink-muted cursor-pointer hover:text-ink">
              Or write your own prompt
            </summary>
            <Textarea
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              rows={2}
              placeholder="Describe what you want to practise…"
              className="mt-3 min-h-[64px]"
            />
          </details>

          {mode === 'writing' ? (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="Write in German. Don't polish it — write the way you'd actually send it."
              className="min-h-[180px]"
            />
          ) : speech.supported ? (
            <Card className="p-8 flex flex-col items-center">
              <button
                type="button"
                onClick={speech.listening ? speech.stop : speech.start}
                className={cn(
                  'h-20 w-20 rounded-full flex items-center justify-center transition-all',
                  speech.listening
                    ? 'bg-critical text-white animate-pulse-ring'
                    : 'bg-accent text-accent-ink hover:opacity-90',
                )}
                aria-label={speech.listening ? 'Stop recording' : 'Start recording'}
              >
                {speech.listening ? <Square size={26} fill="currentColor" /> : <Mic size={28} />}
              </button>
              <p className="text-sm text-ink-muted mt-5">
                {speech.listening ? `Listening… ${speech.seconds}s` : 'Tap and start talking'}
              </p>
              {(speech.transcript || speech.interim) && (
                <p className="target-text text-[17px] leading-relaxed mt-6 w-full">
                  {speech.transcript}
                  {speech.interim && <span className="text-ink-faint"> {speech.interim}</span>}
                </p>
              )}
              {speech.error && (
                <Alert tone="caution" className="mt-4 w-full">
                  {speech.error}
                </Alert>
              )}
            </Card>
          ) : (
            <>
              <Alert tone="caution" className="mb-3">
                Speech recognition isn&rsquo;t available in this browser. Type what you would say —
                it still counts as production.
              </Alert>
              <Textarea
                value={speech.transcript}
                onChange={(e) => speech.setTranscript(e.target.value)}
                rows={5}
                placeholder="Write what you would say out loud…"
              />
            </>
          )}

          {error && (
            <Alert tone="critical" className="mt-4">
              {error}
            </Alert>
          )}

          <Button
            onClick={submit}
            disabled={pending || content.trim().length < 3 || speech.listening}
            block
            size="lg"
            className="mt-5"
          >
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Reading it carefully…
              </>
            ) : (
              'Get feedback'
            )}
          </Button>
        </>
      )}
    </div>
  )
}
