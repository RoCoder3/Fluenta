'use client'

/**
 * Session runner (§10).
 *
 * Drives one session through its activities: review → input → comprehension →
 * expansion → output. Each activity type renders its own step; the runner owns
 * navigation, persistence and the completion summary.
 */

import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Eye,
  Loader2,
  Mic,
  Square,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { GrammarDrawer } from '@/components/grammar-drawer'
import { PhraseCard, type PhraseCardData } from '@/components/phrase-card'
import { Alert, Badge, Button, Card, ProgressBar, Textarea } from '@/components/ui'
import { splitSentences } from '@/lib/tts'
import { cn, formatDuration } from '@/lib/utils'
import { useSpeechRecognition } from '@/lib/use-speech-recognition'
import type { GeneratedEvaluation } from '@/server/ai/schemas'
import {
  completeSessionAction,
  evaluateSpeakingAction,
  evaluateWritingAction,
  saveActivityResponseAction,
  submitReviewAction,
} from '@/server/actions/learning'
import type { RecallMode } from '@/server/engines/review'

export type Activity = {
  id: string
  kind: string
  payload: Record<string, unknown>
}

export function SessionRunner({
  sessionId,
  title,
  activities,
  lang,
  areaKey,
}: {
  sessionId: string
  title: string
  activities: Activity[]
  lang: string
  areaKey?: string
}) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [grammarFor, setGrammarFor] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const activity = activities[index]
  const isLast = index === activities.length - 1

  const advance = () => {
    if (isLast) {
      startTransition(async () => {
        await completeSessionAction(sessionId)
        setFinished(true)
      })
    } else {
      setIndex((i) => i + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (finished) {
    return <SessionComplete title={title} onDone={() => router.push('/home')} />
  }

  if (!activity) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Alert tone="caution">This session has no activities. Start a new one from Home.</Alert>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-6 py-3.5">
          <div className="flex items-center justify-between gap-4 mb-2.5">
            <p className="text-sm font-medium truncate">{title}</p>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs tabular-nums text-ink-faint">
                {index + 1}/{activities.length}
              </span>
              <button
                onClick={() => router.push('/home')}
                className="text-ink-faint hover:text-ink"
                aria-label="Leave session"
              >
                <X size={17} />
              </button>
            </div>
          </div>
          <ProgressBar value={((index + 1) / activities.length) * 100} />
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-2xl px-6 py-8">
        <div key={activity.id} className="animate-fade-up">
          {activity.kind === 'review' && (
            <ReviewStep activity={activity} lang={lang} onDone={advance} />
          )}
          {activity.kind === 'dialogue' && (
            <DialogueStep activity={activity} lang={lang} onNext={advance} />
          )}
          {activity.kind === 'comprehension' && (
            <ComprehensionStep activity={activity} lang={lang} onNext={advance} />
          )}
          {(activity.kind === 'phrase_intro' || activity.kind === 'expansion') && (
            <PhraseStep
              activity={activity}
              lang={lang}
              onNext={advance}
              onAskGrammar={setGrammarFor}
              expansion={activity.kind === 'expansion'}
            />
          )}
          {activity.kind === 'production_written' && (
            <WritingStep activity={activity} areaKey={areaKey} onNext={advance} />
          )}
          {activity.kind === 'production_spoken' && (
            <SpeakingStep activity={activity} lang={lang} areaKey={areaKey} onNext={advance} />
          )}
        </div>

        {pending && (
          <p className="flex items-center gap-2 text-sm text-ink-muted mt-6">
            <Loader2 size={14} className="animate-spin" />
            Saving your session…
          </p>
        )}
      </div>

      <GrammarDrawer
        open={grammarFor !== null}
        onClose={() => setGrammarFor(null)}
        triggerText={grammarFor ?? undefined}
        initialQuestion={grammarFor ? `Why is this phrased this way: "${grammarFor}"?` : ''}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Review (§15)                                                               */
/* -------------------------------------------------------------------------- */

type ReviewItem = {
  phraseId: string
  text: string
  translation: string
  context: string
  mode: RecallMode
  question: {
    mode: RecallMode
    instruction: string
    display: string
    expected: string
    hint?: string
    answerType: 'typed' | 'spoken' | 'self_graded'
  }
}

function ReviewStep({
  activity,
  lang,
  onDone,
}: {
  activity: Activity
  lang: string
  onDone: () => void
}) {
  const items = (activity.payload.items as ReviewItem[]) ?? []
  const [cursor, setCursor] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<{ correct: boolean; expected: string } | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [questionStart, setQuestionStart] = useState(() => Date.now())
  const [pending, startTransition] = useTransition()

  const item = items[cursor]
  if (!item) {
    onDone()
    return null
  }

  const next = () => {
    if (cursor + 1 >= items.length) {
      onDone()
      return
    }
    setCursor((c) => c + 1)
    setAnswer('')
    setResult(null)
    setRevealed(false)
    setQuestionStart(Date.now())
  }

  const submit = (selfGrade?: 'again' | 'good' | 'easy') =>
    startTransition(async () => {
      const res = await submitReviewAction({
        phraseId: item.phraseId,
        mode: item.question.mode,
        answer,
        expected: item.question.expected,
        responseMs: Date.now() - questionStart,
        selfGrade,
      })
      setResult({ correct: res.correct, expected: res.expected })
    })

  return (
    <div>
      <StepHeader
        eyebrow="Review"
        title="Before anything new"
        subtitle="These are the phrases you're closest to forgetting."
      />

      <div className="flex items-center gap-2 mb-4">
        <Badge size="sm">{modeLabel(item.question.mode)}</Badge>
        <span className="text-xs text-ink-faint tabular-nums ml-auto">
          {cursor + 1} of {items.length}
        </span>
      </div>

      <Card className="p-6">
        <p className="text-sm text-ink-muted mb-4">{item.question.instruction}</p>

        <div className="flex items-start gap-2.5 mb-5">
          {item.question.mode === 'recognize' && (
            <AudioButton text={item.text} lang={lang} className="shrink-0 mt-1" />
          )}
          <p
            className={cn(
              'text-xl leading-snug',
              item.question.mode === 'recognize' || item.question.mode === 'cloze'
                ? 'target-text'
                : 'font-display',
            )}
          >
            {item.question.display}
          </p>
        </div>

        {item.question.hint && !result && (
          <p className="text-[13px] text-ink-faint mb-4">Hint: {item.question.hint}</p>
        )}

        {!result && item.question.answerType === 'self_graded' && (
          <>
            {revealed ? (
              <div className="animate-fade-up">
                <div className="rounded-[10px] bg-canvas border border-line px-4 py-3 mb-4">
                  <p className="text-[15px]">{item.question.expected}</p>
                </div>
                <p className="text-sm text-ink-muted mb-3">Did you know it?</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => submit('again')} disabled={pending}>
                    No
                  </Button>
                  <Button variant="secondary" onClick={() => submit('good')} disabled={pending}>
                    Roughly
                  </Button>
                  <Button onClick={() => submit('easy')} disabled={pending}>
                    Yes, easily
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setRevealed(true)} block>
                <Eye size={15} />
                Reveal
              </Button>
            )}
          </>
        )}

        {!result && item.question.answerType === 'typed' && (
          <>
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={2}
              placeholder="Type your answer…"
              className="min-h-[64px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
            />
            <Button onClick={() => submit()} disabled={pending || !answer.trim()} block className="mt-3">
              {pending ? <Loader2 size={15} className="animate-spin" /> : 'Check'}
            </Button>
          </>
        )}

        {!result && item.question.answerType === 'spoken' && (
          <SpokenAnswer
            lang={lang}
            onSubmit={(text) => {
              setAnswer(text)
              startTransition(async () => {
                const res = await submitReviewAction({
                  phraseId: item.phraseId,
                  mode: item.question.mode,
                  answer: text,
                  expected: item.question.expected,
                  responseMs: Date.now() - questionStart,
                })
                setResult({ correct: res.correct, expected: res.expected })
              })
            }}
          />
        )}

        {result && (
          <div className="animate-fade-up">
            <div
              className={cn(
                'rounded-[10px] px-4 py-3 border mb-4',
                result.correct
                  ? 'border-positive/30 bg-positive/5'
                  : 'border-caution/30 bg-caution/5',
              )}
            >
              <p className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                {result.correct ? (
                  <>
                    <Check size={15} className="text-positive" />
                    That&rsquo;s it
                  </>
                ) : (
                  'Not quite'
                )}
              </p>
              <div className="flex items-center gap-2">
                <AudioButton text={result.expected} lang={lang} size="sm" showSlow={false} />
                <p className="target-text text-[16px]">{result.expected}</p>
              </div>
              {!result.correct && answer.trim() && (
                <p className="text-[13px] text-ink-muted mt-2">You said: {answer}</p>
              )}
            </div>
            <Button onClick={next} block>
              {cursor + 1 >= items.length ? 'Done reviewing' : 'Next'}
              <ArrowRight size={15} />
            </Button>
          </div>
        )}
      </Card>

      <p className="text-xs text-ink-faint mt-4 text-center">
        Elapsed {formatDuration((Date.now() - startedAt) / 1000)}
      </p>
    </div>
  )
}

function modeLabel(mode: RecallMode): string {
  return {
    recognize: 'Recognize',
    cloze: 'Fill the gap',
    translate: 'Translate',
    produce: 'Produce',
    situational: 'In situation',
    spoken: 'Say it aloud',
  }[mode]
}

/* -------------------------------------------------------------------------- */
/* Dialogue (input)                                                           */
/* -------------------------------------------------------------------------- */

function DialogueStep({
  activity,
  lang,
  onNext,
}: {
  activity: Activity
  lang: string
  onNext: () => void
}) {
  const payload = activity.payload as {
    title?: string
    situation?: string
    rationale?: string
    lines?: Array<{ speaker: string; text: string; translation: string; note?: string }>
  }
  const [showTranslations, setShowTranslations] = useState(false)
  const lines = payload.lines ?? []

  const fullText = useMemo(() => lines.map((l) => l.text).join(' '), [lines])

  return (
    <div>
      <StepHeader eyebrow="Listen" title={payload.title ?? 'A conversation'} subtitle={payload.situation} />

      {payload.rationale && (
        <Alert tone="accent" className="mb-5">
          {payload.rationale}
        </Alert>
      )}

      <div className="flex items-center gap-2 mb-4">
        <AudioButton text={fullText} lang={lang} />
        <span className="text-[13px] text-ink-muted">Play the whole thing</span>
        <button
          type="button"
          onClick={() => setShowTranslations(!showTranslations)}
          className="ml-auto text-[13px] text-ink-muted hover:text-ink underline underline-offset-4"
        >
          {showTranslations ? 'Hide English' : 'Show English'}
        </button>
      </div>

      <Card className="divide-y divide-line">
        {lines.map((line, i) => (
          <div key={i} className="p-4 flex items-start gap-3">
            <AudioButton text={line.text} lang={lang} size="sm" className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-1">
                {line.speaker}
              </p>
              <p className="target-text text-[17px] leading-snug">{line.text}</p>
              {showTranslations && (
                <p className="text-sm text-ink-muted mt-1 animate-fade-up">{line.translation}</p>
              )}
              {line.note && (
                <p className="text-[12px] text-ink-faint mt-1.5 leading-relaxed">{line.note}</p>
              )}
            </div>
          </div>
        ))}
      </Card>

      <Button onClick={onNext} block size="lg" className="mt-6">
        I&rsquo;ve got it
        <ArrowRight size={16} />
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Comprehension                                                              */
/* -------------------------------------------------------------------------- */

function ComprehensionStep({
  activity,
  lang,
  onNext,
}: {
  activity: Activity
  lang: string
  onNext: () => void
}) {
  const payload = activity.payload as {
    questions?: Array<{
      question: string
      questionTranslation: string
      kind: string
      options?: string[]
      answer: string
      explanation: string
    }>
  }
  const questions = payload.questions ?? []
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const [, startTransition] = useTransition()

  const correctCount = questions.filter(
    (q, i) => (answers[i] ?? '').trim().toLowerCase() === q.answer.trim().toLowerCase(),
  ).length

  const check = () => {
    setChecked(true)
    startTransition(async () => {
      await saveActivityResponseAction({
        activityId: activity.id,
        response: { answers },
        evaluation: { score: questions.length ? (correctCount / questions.length) * 100 : 0 },
      })
    })
  }

  return (
    <div>
      <StepHeader eyebrow="Check" title="Did you follow that?" />

      <div className="space-y-4">
        {questions.map((q, i) => {
          const given = answers[i] ?? ''
          const isCorrect = given.trim().toLowerCase() === q.answer.trim().toLowerCase()
          return (
            <Card key={i} className="p-5">
              <div className="flex items-start gap-2 mb-3">
                <AudioButton text={q.question} lang={lang} size="sm" showSlow={false} className="shrink-0 mt-0.5" />
                <div>
                  <p className="target-text text-[16px] leading-snug">{q.question}</p>
                  <p className="text-[13px] text-ink-muted mt-0.5">{q.questionTranslation}</p>
                </div>
              </div>

              {q.kind === 'multiple_choice' && q.options ? (
                <div className="space-y-2">
                  {q.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={checked}
                      onClick={() => setAnswers({ ...answers, [i]: option })}
                      className={cn(
                        'w-full text-left px-3.5 py-2.5 rounded-[10px] border text-sm transition-all disabled:cursor-default',
                        checked && option === q.answer
                          ? 'border-positive bg-positive/5'
                          : checked && given === option
                            ? 'border-critical bg-critical/5'
                            : given === option
                              ? 'border-accent bg-accent-soft'
                              : 'border-line-strong hover:border-ink-faint',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : (
                <Textarea
                  value={given}
                  onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                  disabled={checked}
                  rows={2}
                  placeholder="Your answer…"
                  className="min-h-[60px]"
                />
              )}

              {checked && (
                <div className="mt-3 pt-3 border-t border-line animate-fade-up">
                  <p className={cn('text-sm mb-1', isCorrect ? 'text-positive' : 'text-caution')}>
                    {isCorrect ? 'Correct' : `Answer: ${q.answer}`}
                  </p>
                  <p className="text-[13px] text-ink-muted leading-relaxed">{q.explanation}</p>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {checked ? (
        <Button onClick={onNext} block size="lg" className="mt-6">
          Continue ({correctCount}/{questions.length})
          <ArrowRight size={16} />
        </Button>
      ) : (
        <Button
          onClick={check}
          block
          size="lg"
          className="mt-6"
          disabled={Object.keys(answers).length === 0}
        >
          Check answers
        </Button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Phrases                                                                    */
/* -------------------------------------------------------------------------- */

function PhraseStep({
  activity,
  lang,
  onNext,
  onAskGrammar,
  expansion,
}: {
  activity: Activity
  lang: string
  onNext: () => void
  onAskGrammar: (text: string) => void
  expansion?: boolean
}) {
  const payload = activity.payload as { phrases?: PhraseCardData[]; phraseIds?: string[] }
  const phrases = payload.phrases ?? []
  const ids = payload.phraseIds ?? []

  return (
    <div>
      <StepHeader
        eyebrow={expansion ? 'Expand' : 'Learn'}
        title={expansion ? 'Related ways to say it' : 'Your new phrases'}
        subtitle={
          expansion
            ? 'Same function, different wording — this is what makes you sound less scripted.'
            : 'Every one of these is something you could say this week.'
        }
      />

      <div className="space-y-3">
        {phrases.map((phrase, i) => (
          <PhraseCard
            key={`${phrase.text}-${i}`}
            phrase={{ ...phrase, id: ids[i] }}
            lang={lang}
            onAskGrammar={onAskGrammar}
          />
        ))}
      </div>

      <p className="text-xs text-ink-faint mt-4 text-center leading-relaxed">
        These are already in your review queue. You&rsquo;ll meet them again before you forget them.
      </p>

      <Button onClick={onNext} block size="lg" className="mt-5">
        Now use them
        <ArrowRight size={16} />
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Production — writing                                                       */
/* -------------------------------------------------------------------------- */

function WritingStep({
  activity,
  areaKey,
  onNext,
}: {
  activity: Activity
  areaKey?: string
  onNext: () => void
}) {
  const payload = activity.payload as {
    prompt?: string
    situation?: string
    hints?: string[]
    sampleAnswer?: string
  }
  const [text, setText] = useState('')
  const [evaluation, setEvaluation] = useState<GeneratedEvaluation | null>(null)
  const [showSample, setShowSample] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      setError(null)
      try {
        const result = await evaluateWritingAction({
          prompt: payload.prompt ?? '',
          content: text,
          format: 'session_response',
          lifeAreaKey: areaKey,
          activityId: activity.id,
        })
        setEvaluation(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not evaluate your answer.')
      }
    })

  return (
    <div>
      <StepHeader eyebrow="Write" title={payload.prompt ?? 'Write something'} subtitle={payload.situation} />

      {!evaluation ? (
        <>
          {payload.hints && payload.hints.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {payload.hints.map((hint) => (
                <Badge key={hint} tone="accent">
                  {hint}
                </Badge>
              ))}
            </div>
          )}

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Write in German. Getting it wrong is the point — that's what produces the feedback."
            className="min-h-[130px]"
            autoFocus
          />

          {error && (
            <Alert tone="critical" className="mt-3">
              {error}
            </Alert>
          )}

          <div className="flex gap-2 mt-4">
            <Button onClick={submit} disabled={pending || text.trim().length < 3} className="flex-1" size="lg">
              {pending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Reading it…
                </>
              ) : (
                'Get feedback'
              )}
            </Button>
            <Button variant="ghost" onClick={onNext} disabled={pending}>
              Skip
            </Button>
          </div>
        </>
      ) : (
        <EvaluationPanel
          evaluation={evaluation}
          learnerText={text}
          sampleAnswer={payload.sampleAnswer}
          showSample={showSample}
          onShowSample={() => setShowSample(true)}
          onNext={onNext}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Production — speaking                                                      */
/* -------------------------------------------------------------------------- */

function SpeakingStep({
  activity,
  lang,
  areaKey,
  onNext,
}: {
  activity: Activity
  lang: string
  areaKey?: string
  onNext: () => void
}) {
  const payload = activity.payload as {
    prompt?: string
    situation?: string
    hints?: string[]
    sampleAnswer?: string
  }
  const speech = useSpeechRecognition(lang)
  const [evaluation, setEvaluation] = useState<GeneratedEvaluation | null>(null)
  const [showSample, setShowSample] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      setError(null)
      try {
        const result = await evaluateSpeakingAction({
          prompt: payload.prompt ?? '',
          transcript: speech.transcript,
          durationSeconds: speech.seconds,
          lifeAreaKey: areaKey,
          activityId: activity.id,
        })
        setEvaluation(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not evaluate your answer.')
      }
    })

  if (evaluation) {
    return (
      <div>
        <StepHeader eyebrow="Speak" title={payload.prompt ?? 'Say something'} />
        <EvaluationPanel
          evaluation={evaluation}
          learnerText={speech.transcript}
          sampleAnswer={payload.sampleAnswer}
          showSample={showSample}
          onShowSample={() => setShowSample(true)}
          onNext={onNext}
          spoken
        />
      </div>
    )
  }

  return (
    <div>
      <StepHeader eyebrow="Speak" title={payload.prompt ?? 'Say something'} subtitle={payload.situation} />

      {payload.hints && payload.hints.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {payload.hints.map((hint) => (
            <Badge key={hint} tone="accent">
              {hint}
            </Badge>
          ))}
        </div>
      )}

      {!speech.supported ? (
        <>
          <Alert tone="caution" className="mb-4">
            Your browser doesn&rsquo;t support speech recognition. Type what you would say instead —
            it still counts as production practice.
          </Alert>
          <Textarea
            value={speech.transcript}
            onChange={(e) => speech.setTranscript(e.target.value)}
            rows={4}
            placeholder="Write what you would say out loud…"
          />
        </>
      ) : (
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
            <div className="mt-6 w-full">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
                What we heard
              </p>
              <p className="target-text text-[17px] leading-relaxed">
                {speech.transcript}
                {speech.interim && <span className="text-ink-faint"> {speech.interim}</span>}
              </p>
            </div>
          )}

          {speech.error && (
            <Alert tone="caution" className="mt-4 w-full">
              {speech.error}
            </Alert>
          )}
        </Card>
      )}

      {error && (
        <Alert tone="critical" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="flex gap-2 mt-5">
        <Button
          onClick={submit}
          disabled={pending || speech.transcript.trim().length < 3 || speech.listening}
          className="flex-1"
          size="lg"
        >
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Listening back…
            </>
          ) : (
            'Get feedback'
          )}
        </Button>
        {speech.transcript && !speech.listening && (
          <Button variant="secondary" onClick={speech.reset} disabled={pending}>
            Redo
          </Button>
        )}
        <Button variant="ghost" onClick={onNext} disabled={pending}>
          Skip
        </Button>
      </div>
    </div>
  )
}

function SpokenAnswer({ lang, onSubmit }: { lang: string; onSubmit: (text: string) => void }) {
  const speech = useSpeechRecognition(lang)

  if (!speech.supported) {
    return (
      <div>
        <Alert tone="caution" className="mb-3">
          Speech isn&rsquo;t supported here — type it instead.
        </Alert>
        <Textarea
          value={speech.transcript}
          onChange={(e) => speech.setTranscript(e.target.value)}
          rows={2}
          className="min-h-[60px]"
        />
        <Button
          onClick={() => onSubmit(speech.transcript)}
          disabled={!speech.transcript.trim()}
          block
          className="mt-3"
        >
          Check
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-4">
      <button
        type="button"
        onClick={speech.listening ? speech.stop : speech.start}
        className={cn(
          'h-16 w-16 rounded-full flex items-center justify-center transition-all',
          speech.listening ? 'bg-critical text-white animate-pulse-ring' : 'bg-accent text-accent-ink',
        )}
        aria-label={speech.listening ? 'Stop' : 'Record'}
      >
        {speech.listening ? <Square size={20} fill="currentColor" /> : <Mic size={22} />}
      </button>
      {speech.transcript && (
        <p className="target-text text-[16px] mt-4 text-center">{speech.transcript}</p>
      )}
      <Button
        onClick={() => onSubmit(speech.transcript)}
        disabled={!speech.transcript.trim() || speech.listening}
        block
        className="mt-4"
      >
        Check
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Feedback panel                                                             */
/* -------------------------------------------------------------------------- */

export function EvaluationPanel({
  evaluation,
  learnerText,
  sampleAnswer,
  showSample,
  onShowSample,
  onNext,
  spoken,
}: {
  evaluation: GeneratedEvaluation
  learnerText: string
  sampleAnswer?: string
  showSample?: boolean
  onShowSample?: () => void
  onNext?: () => void
  spoken?: boolean
}) {
  return (
    <div className="animate-fade-up space-y-5">
      <Card className="p-5">
        <p className="text-[15px] leading-relaxed">{evaluation.overallComment}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-line">
          <Metric label="Correct" value={evaluation.correctness} />
          <Metric label="Natural" value={evaluation.naturalness} />
          <Metric label="Task done" value={evaluation.taskCompletion} />
          {spoken && evaluation.fluency !== undefined ? (
            <Metric label="Fluency" value={evaluation.fluency} />
          ) : (
            <Metric label="Range" value={evaluation.vocabularyRange} />
          )}
        </div>
      </Card>

      {learnerText && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-1.5">
            {spoken ? 'What you said' : 'What you wrote'}
          </p>
          <p className="text-[15px] text-ink-muted leading-relaxed">{learnerText}</p>
        </div>
      )}

      {evaluation.strengths.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
            What worked
          </p>
          <ul className="space-y-1.5">
            {evaluation.strengths.map((s) => (
              <li key={s} className="flex gap-2 text-sm leading-relaxed">
                <Check size={15} className="text-positive mt-0.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.corrections.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
            Worth fixing
          </p>
          <div className="space-y-3">
            {evaluation.corrections.map((c, i) => (
              <Card key={i} className="p-4">
                <p className="text-sm text-ink-faint line-through decoration-critical/40">
                  {c.original}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <AudioButton text={c.corrected} size="sm" showSlow={false} />
                  <p className="target-text text-[16px]">{c.corrected}</p>
                </div>
                <p className="text-[13px] text-ink-muted mt-2 leading-relaxed">{c.why}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {evaluation.betterPhrasings.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
            Correct, but a native would say
          </p>
          <div className="space-y-3">
            {evaluation.betterPhrasings.map((b, i) => (
              <Card key={i} className="p-4">
                <p className="text-sm text-ink-faint">{b.instead}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <AudioButton text={b.say} size="sm" showSlow={false} />
                  <p className="target-text text-[16px]">{b.say}</p>
                </div>
                <p className="text-[13px] text-ink-muted mt-2 leading-relaxed">{b.why}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {evaluation.phrasesToLearn.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
            Language you reached for
          </p>
          <div className="space-y-2">
            {evaluation.phrasesToLearn.map((p) => (
              <PhraseCard key={p.text} phrase={{ ...p, register: 'neutral' }} compact />
            ))}
          </div>
          <p className="text-xs text-ink-faint mt-2">Added to your phrasebook.</p>
        </div>
      )}

      {sampleAnswer && (
        <div>
          {showSample ? (
            <Card className="p-4 animate-fade-up">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
                One way to say it
              </p>
              <div className="flex items-start gap-2">
                <AudioButton text={sampleAnswer} size="sm" className="shrink-0 mt-0.5" />
                <p className="target-text text-[16px] leading-relaxed">{sampleAnswer}</p>
              </div>
            </Card>
          ) : (
            <Button variant="quiet" size="sm" onClick={onShowSample}>
              <BookOpen size={14} />
              Show a sample answer
            </Button>
          )}
        </div>
      )}

      {onNext && (
        <Button onClick={onNext} block size="lg">
          Continue
          <ArrowRight size={16} />
        </Button>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint mb-1">{label}</p>
      <p className="font-display text-xl tabular-nums">{Math.round(value)}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function StepHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-6">
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink-faint mb-2">{eyebrow}</p>
      <h1 className="font-display text-2xl leading-tight text-balance">{title}</h1>
      {subtitle && <p className="text-ink-muted mt-2 leading-relaxed">{subtitle}</p>}
    </div>
  )
}

function SessionComplete({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-md text-center animate-fade-up">
        <CheckCircle2 size={36} className="text-positive mx-auto mb-5" />
        <h1 className="font-display text-3xl mb-3">Session done.</h1>
        <p className="text-ink-muted leading-relaxed mb-8">
          Everything you produced went into your error model, and the new phrases are scheduled for
          review before you forget them. That&rsquo;s the part that compounds.
        </p>
        <p className="text-sm text-ink-faint mb-6">{title}</p>
        <Button onClick={onDone} size="lg">
          Back to home
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}
