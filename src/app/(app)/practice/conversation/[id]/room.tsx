'use client'

/**
 * Conversation room (§11).
 *
 * The partner stays in character and never corrects. Everything the learner got
 * wrong is held back until they end the conversation, at which point the full
 * debrief appears. That deferral is the whole design.
 */

import {
  ArrowLeft,
  Check,
  CircleAlert,
  Languages,
  Lightbulb,
  Loader2,
  Mic,
  Send,
  Square,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { PhraseCard } from '@/components/phrase-card'
import { Alert, Badge, Button, Card, SectionTitle, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from '@/lib/use-speech-recognition'
import { endConversationAction, sendConversationTurnAction } from '@/server/actions/practice'
import type { GeneratedConversationAnalysis } from '@/server/ai/schemas'
import type { ConversationAnalysis, Persona } from '@/server/db/schema'

type Turn = {
  id: string
  role: 'learner' | 'partner' | 'narrator'
  text: string
  translation?: string | null
}

export function ConversationRoom({
  conversationId,
  lang,
  scenarioTitle,
  situation,
  persona,
  status,
  initialTurns,
  initialAnalysis,
}: {
  conversationId: string
  lang: string
  scenarioTitle: string
  situation: string
  persona: Persona
  status: string
  initialTurns: Turn[]
  initialAnalysis: ConversationAnalysis | null
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns)
  const [message, setMessage] = useState('')
  const [nudge, setNudge] = useState<string | null>(null)
  const [showTranslations, setShowTranslations] = useState(false)
  const [analysis, setAnalysis] = useState<GeneratedConversationAnalysis | null>(
    (initialAnalysis as GeneratedConversationAnalysis) ?? null,
  )
  const [ended, setEnded] = useState(status === 'completed')
  const [error, setError] = useState<string | null>(null)
  const [sending, startSending] = useTransition()
  const [ending, startEnding] = useTransition()

  const speech = useSpeechRecognition(lang)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length, analysis])

  const send = (text: string, wasSpoken: boolean) => {
    if (!text.trim()) return
    const optimistic: Turn = { id: `local-${Date.now()}`, role: 'learner', text: text.trim() }
    setTurns((prev) => [...prev, optimistic])
    setMessage('')
    speech.reset()
    setNudge(null)
    setError(null)

    startSending(async () => {
      try {
        const reply = await sendConversationTurnAction({
          conversationId,
          message: text.trim(),
          wasSpoken,
        })
        setTurns((prev) => [
          ...prev,
          {
            id: `partner-${Date.now()}`,
            role: 'partner',
            text: reply.reply,
            translation: reply.translation,
          },
        ])
        if (reply.nudge) setNudge(reply.nudge)
        if (reply.shouldEnd) setNudge('This conversation has reached a natural end. Wrap it up when ready.')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send that.')
        setTurns((prev) => prev.filter((t) => t.id !== optimistic.id))
      }
    })
  }

  const finish = () =>
    startEnding(async () => {
      setError(null)
      try {
        setAnalysis(await endConversationAction(conversationId))
        setEnded(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate the debrief.')
      }
    })

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-6 py-3.5 flex items-center gap-3">
          <Link href="/practice" className="text-ink-faint hover:text-ink shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{scenarioTitle}</p>
            <p className="text-xs text-ink-faint truncate">
              {persona.name} · {persona.role} · {persona.register}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTranslations(!showTranslations)}
            className={cn(
              'p-2 rounded-lg transition-colors shrink-0',
              showTranslations ? 'text-accent bg-accent-soft' : 'text-ink-faint hover:text-ink',
            )}
            aria-label="Toggle translations"
            title="Show English"
          >
            <Languages size={17} />
          </button>
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-2xl px-6 py-6">
        <Card className="p-4 mb-5 bg-canvas">
          <p className="text-sm text-ink-muted leading-relaxed">{situation}</p>
          <p className="text-xs text-ink-faint mt-2">
            {persona.name} is {persona.personality.toLowerCase()}
          </p>
        </Card>

        <div className="space-y-4">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={cn('flex gap-2.5', turn.role === 'learner' && 'flex-row-reverse')}
            >
              {turn.role === 'partner' && (
                <AudioButton text={turn.text} lang={lang} size="sm" className="shrink-0 mt-1" />
              )}
              <div
                className={cn(
                  'max-w-[78%] rounded-2xl px-4 py-2.5 animate-fade-up',
                  turn.role === 'learner'
                    ? 'bg-accent text-accent-ink rounded-br-md'
                    : 'bg-surface border border-line rounded-bl-md',
                )}
              >
                <p
                  className={cn(
                    'text-[16px] leading-snug',
                    turn.role === 'partner' && 'target-text',
                  )}
                >
                  {turn.text}
                </p>
                {showTranslations && turn.translation && (
                  <p className="text-[13px] opacity-70 mt-1.5">{turn.translation}</p>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-2.5">
              <div className="bg-surface border border-line rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 size={15} className="animate-spin text-ink-faint" />
              </div>
            </div>
          )}
        </div>

        {nudge && !ended && (
          <Alert tone="accent" className="mt-5">
            <span className="flex items-start gap-2">
              <Lightbulb size={15} className="mt-0.5 shrink-0" />
              {nudge}
            </span>
          </Alert>
        )}

        {error && (
          <Alert tone="critical" className="mt-4">
            {error}
          </Alert>
        )}

        {analysis && <AnalysisPanel analysis={analysis} lang={lang} />}

        <div ref={bottomRef} />
      </div>

      {!ended && (
        <div className="sticky bottom-0 border-t border-line bg-canvas/95 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl px-6 py-4">
            {speech.transcript && (
              <p className="target-text text-[15px] mb-2">{speech.transcript}</p>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={1}
                placeholder={`Reply in German (${persona.register})…`}
                className="min-h-[46px] max-h-32 py-3"
                disabled={sending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(message, false)
                  }
                }}
              />

              {speech.supported && (
                <Button
                  variant={speech.listening ? 'danger' : 'secondary'}
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  disabled={sending}
                  aria-label={speech.listening ? 'Stop recording' : 'Speak instead'}
                  onClick={() => {
                    if (speech.listening) {
                      speech.stop()
                      setTimeout(() => {
                        if (speech.transcript.trim()) send(speech.transcript, true)
                      }, 350)
                    } else {
                      speech.start()
                    }
                  }}
                >
                  {speech.listening ? <Square size={16} fill="currentColor" /> : <Mic size={17} />}
                </Button>
              )}

              <Button
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={sending || !message.trim()}
                onClick={() => send(message, false)}
                aria-label="Send"
              >
                <Send size={16} />
              </Button>
            </div>

            <div className="flex items-center justify-between mt-2.5">
              <p className="text-xs text-ink-faint">
                Mistakes are fine — nothing gets corrected until you finish.
              </p>
              <Button variant="quiet" size="sm" onClick={finish} disabled={ending || turns.length < 2}>
                {ending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Reviewing…
                  </>
                ) : (
                  'End & review'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnalysisPanel({
  analysis,
  lang,
}: {
  analysis: GeneratedConversationAnalysis
  lang: string
}) {
  return (
    <div className="mt-8 pt-8 border-t border-line space-y-7 animate-fade-up">
      <div>
        <h2 className="font-display text-2xl mb-1">Conversation analysis</h2>
        <p className="text-sm text-ink-muted">Now we can talk about the German.</p>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] text-ink-faint mb-1">Fluency</p>
            <p className="font-display text-2xl tabular-nums">{Math.round(analysis.fluency.score)}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-faint mb-1">Comprehension</p>
            <p className="font-display text-2xl tabular-nums">
              {Math.round(analysis.comprehension.score)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-ink-faint mb-1">Task</p>
            <p className="font-display text-2xl">
              {analysis.taskSuccess.achieved ? (
                <Check size={26} className="text-positive" />
              ) : (
                <CircleAlert size={24} className="text-caution" />
              )}
            </p>
          </div>
        </div>
        <p className="text-sm text-ink-muted mt-4 leading-relaxed">{analysis.taskSuccess.comment}</p>
      </Card>

      {analysis.didWell.length > 0 && (
        <section>
          <SectionTitle>What you did well</SectionTitle>
          <ul className="space-y-2">
            {analysis.didWell.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed">
                <Check size={15} className="text-positive mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.mistakes.length > 0 && (
        <section>
          <SectionTitle>Worth fixing</SectionTitle>
          <div className="space-y-3">
            {analysis.mistakes.map((m, i) => (
              <Card key={i} className="p-4">
                <p className="text-sm text-ink-faint line-through decoration-critical/40">{m.said}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <AudioButton text={m.better} lang={lang} size="sm" showSlow={false} />
                  <p className="target-text text-[16px]">{m.better}</p>
                </div>
                <p className="text-[13px] text-ink-muted mt-2 leading-relaxed">{m.why}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {analysis.naturalAlternatives.length > 0 && (
        <section>
          <SectionTitle>More natural</SectionTitle>
          <div className="space-y-2.5">
            {analysis.naturalAlternatives.map((alt, i) => (
              <Card key={i} className="p-4">
                <p className="text-sm text-ink-faint">{alt.instead}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <AudioButton text={alt.say} lang={lang} size="sm" showSlow={false} />
                  <p className="target-text text-[16px]">{alt.say}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {analysis.usefulPhrases.length > 0 && (
        <section>
          <SectionTitle>Added to your phrasebook</SectionTitle>
          <div className="space-y-2">
            {analysis.usefulPhrases.map((p) => (
              <PhraseCard key={p.text} phrase={{ ...p, register: 'neutral' }} lang={lang} compact />
            ))}
          </div>
        </section>
      )}

      {analysis.missingVocabulary.length > 0 && (
        <section>
          <SectionTitle>Words you needed</SectionTitle>
          <div className="space-y-2">
            {analysis.missingVocabulary.map((v) => (
              <div key={v.lemma} className="flex items-baseline gap-2 text-sm">
                <span className="target-text">{v.lemma}</span>
                <span className="text-ink-faint">— {v.translation}</span>
                <span className="text-xs text-ink-faint ml-auto">{v.whyUseful}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Alert tone="accent">
        <span className="font-medium">Next: </span>
        {analysis.nextStep}
      </Alert>

      <div className="flex gap-2">
        <Link href="/practice" className="flex-1">
          <Button variant="secondary" block>
            Another conversation
          </Button>
        </Link>
        <Link href="/home" className="flex-1">
          <Button block>Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
