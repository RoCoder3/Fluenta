'use client'

/**
 * Onboarding (§7).
 *
 * Progressive, not a questionnaire: one decision per screen, and the free-text
 * step does most of the work — the AI extracts profession, city, interests and
 * life areas from a paragraph rather than making the learner fill in fields.
 */

import { ArrowLeft, ArrowRight, Check, GripVertical, Loader2, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { Alert, Badge, Button, Card, Input, Label, ProgressBar, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  completeOnboardingAction,
  processIntakeAction,
  saveBasicsAction,
  saveLifeAreasAction,
  startAssessmentAction,
  submitAssessmentAction,
} from '@/server/actions/onboarding'
import type { GeneratedAssessmentItems, GeneratedAssessmentResult } from '@/server/ai/schemas'

type LanguageOption = {
  code: string
  name: string
  nativeName: string
  isTarget: boolean
  isExplanation: boolean
}

type AreaDraft = {
  key: string
  name: string
  description: string
  priority: number
  subAreas: string[]
}

const MOTIVATIONS = [
  { key: 'work', label: 'Work' },
  { key: 'moving', label: 'Moving / already moved' },
  { key: 'travel', label: 'Travel' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'social', label: 'Social life' },
  { key: 'daily_life', label: 'Daily life' },
  { key: 'education', label: 'Education' },
  { key: 'hobbies', label: 'Hobbies' },
  { key: 'other', label: 'Something else' },
]

const STEPS = ['Language', 'Your situation', 'Life areas', 'Where you stand', 'Ready'] as const

export function OnboardingFlow({
  userName,
  languages,
  liveAi,
}: {
  userName: string
  languages: LanguageOption[]
  liveAi: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Step 1
  const [targetLanguage, setTargetLanguage] = useState('de')
  const [explanationLanguage, setExplanationLanguage] = useState('en')
  const [motivations, setMotivations] = useState<string[]>([])

  // Step 2
  const [rawIntake, setRawIntake] = useState('')
  const [motivationSummary, setMotivationSummary] = useState('')

  // Step 3
  const [areas, setAreas] = useState<AreaDraft[]>([])
  const [newAreaName, setNewAreaName] = useState('')

  // Step 4
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [items, setItems] = useState<GeneratedAssessmentItems['items']>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [selfAssessment, setSelfAssessment] = useState({
    speaking: 2,
    listening: 2,
    reading: 2,
    writing: 2,
  })

  // Step 5
  const [result, setResult] = useState<GeneratedAssessmentResult | null>(null)

  const targets = languages.filter((l) => l.isTarget)
  const explanations = languages.filter((l) => l.isExplanation)

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
  }

  /* ---------------------------------------------------------------- step 1 */

  const submitBasics = () =>
    startTransition(async () => {
      setError(null)
      try {
        await saveBasicsAction({
          targetLanguageCode: targetLanguage,
          explanationLanguageCode: explanationLanguage,
          nativeLanguageCode: explanationLanguage,
          motivations,
        })
        setStep(1)
      } catch (e) {
        fail(e)
      }
    })

  /* ---------------------------------------------------------------- step 2 */

  const submitIntake = () =>
    startTransition(async () => {
      setError(null)
      try {
        const { extraction, suggestedAreas } = await processIntakeAction(rawIntake)
        setMotivationSummary(extraction.motivationSummary)
        setAreas(
          suggestedAreas.map((a) => ({
            key: a.key,
            name: a.name,
            description: a.description,
            priority: a.priority,
            subAreas: a.subAreas,
          })),
        )
        setStep(2)
      } catch (e) {
        fail(e)
      }
    })

  /* ---------------------------------------------------------------- step 3 */

  const submitAreas = () =>
    startTransition(async () => {
      setError(null)
      try {
        await saveLifeAreasAction(
          areas.map((a, i) => ({
            key: a.key,
            name: a.name,
            description: a.description,
            priority: i + 1,
            subAreas: a.subAreas,
          })),
        )
        const { assessmentId: id, items: generated } = await startAssessmentAction()
        setAssessmentId(id)
        setItems(generated)
        setStep(3)
      } catch (e) {
        fail(e)
      }
    })

  /* ---------------------------------------------------------------- step 4 */

  const submitAssessment = () =>
    startTransition(async () => {
      setError(null)
      if (!assessmentId) return
      try {
        const scored = await submitAssessmentAction({
          assessmentId,
          responses: items.map((item) => ({ id: item.id, answer: answers[item.id] ?? '' })),
          selfAssessment,
        })
        setResult(scored)
        setStep(4)
      } catch (e) {
        fail(e)
      }
    })

  /* ---------------------------------------------------------------- step 5 */

  const finish = () =>
    startTransition(async () => {
      setError(null)
      try {
        await completeOnboardingAction({
          preferences: {
            sessionMinutes: 10,
            dailyGoalMinutes: 10,
            correctionStyle: 'gentle',
            grammarAppetite: 'on_request',
            preferSpeaking: true,
            formalityDefault: 'mixed',
          },
          startingTier: result?.recommendedStartingStage ?? 'survival',
        })
        router.push('/home')
      } catch (e) {
        fail(e)
      }
    })

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-display">Fluenta</span>
            <span className="text-xs text-ink-faint tabular-nums">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <ProgressBar value={((step + 1) / STEPS.length) * 100} />
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-2xl px-6 py-10">
        {error && (
          <Alert tone="critical" className="mb-6">
            {error}
          </Alert>
        )}

        {step === 0 && (
          <Section
            title={`Hello, ${userName}.`}
            subtitle="Two quick things, then we get to the part that matters."
          >
            <div className="space-y-7">
              <div>
                <Label>What do you want to learn?</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {targets.map((lang) => (
                    <ChoiceCard
                      key={lang.code}
                      selected={targetLanguage === lang.code}
                      onClick={() => setTargetLanguage(lang.code)}
                      title={lang.name}
                      subtitle={lang.nativeName}
                    />
                  ))}
                </div>
                {targets.length === 1 && (
                  <p className="text-xs text-ink-faint mt-2">
                    More target languages are coming — the whole system is language-neutral underneath.
                  </p>
                )}
              </div>

              <div>
                <Label>Explanations in</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {explanations
                    .filter((l) => l.code !== targetLanguage)
                    .map((lang) => (
                      <ChoiceCard
                        key={lang.code}
                        selected={explanationLanguage === lang.code}
                        onClick={() => setExplanationLanguage(lang.code)}
                        title={lang.name}
                        compact
                      />
                    ))}
                </div>
              </div>

              <div>
                <Label>Why do you need it? Pick everything that applies.</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {MOTIVATIONS.map((m) => {
                    const on = motivations.includes(m.key)
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() =>
                          setMotivations((prev) =>
                            on ? prev.filter((x) => x !== m.key) : [...prev, m.key],
                          )
                        }
                        className={cn(
                          'px-3.5 py-2 rounded-full text-sm border transition-all',
                          on
                            ? 'bg-accent text-accent-ink border-accent'
                            : 'bg-surface border-line-strong text-ink-muted hover:border-ink-faint',
                        )}
                      >
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <Nav
              onNext={submitBasics}
              nextDisabled={motivations.length === 0 || pending}
              pending={pending}
            />
          </Section>
        )}

        {step === 1 && (
          <Section
            title="Tell us about your situation."
            subtitle="Write it however you like. This one paragraph shapes everything the app builds for you, so be concrete."
          >
            <Textarea
              value={rawIntake}
              onChange={(e) => setRawIntake(e.target.value)}
              rows={7}
              maxLength={2000}
              placeholder="I live in Zurich and work in IT. I can understand quite a lot of German but I'm terrible at speaking — I switch to English the moment it gets hard. I mostly need it at work, for dealing with the Kreisbüro and my landlord, and I'd like to actually make Swiss friends instead of only hanging out with expats."
              className="min-h-[180px]"
            />
            <p className="text-xs text-ink-faint mt-2">
              Useful to include: where you live, what you do, what you find hard, and the situations you keep avoiding.
            </p>

            {!liveAi && (
              <Alert tone="caution" className="mt-4">
                No AI key is configured, so this step uses built-in defaults instead of reading your
                text closely. Everything still works — add <code>ANTHROPIC_API_KEY</code> for a
                genuinely personalized extraction.
              </Alert>
            )}

            <Nav
              onBack={() => setStep(0)}
              onNext={submitIntake}
              nextLabel="Analyze my situation"
              nextDisabled={rawIntake.trim().length < 20 || pending}
              pending={pending}
            />
          </Section>
        )}

        {step === 2 && (
          <Section
            title="Here's what we heard."
            subtitle="These are the areas of your life we'll build German around. Reorder them so the most urgent is first, and add anything we missed."
          >
            {motivationSummary && (
              <Alert tone="accent" className="mb-5">
                {motivationSummary}
              </Alert>
            )}

            <div className="space-y-2">
              {areas.map((area, index) => (
                <Card key={area.key} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <span className="text-xs tabular-nums text-ink-faint w-5 text-center">
                        {index + 1}
                      </span>
                      <GripVertical size={13} className="text-ink-faint" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[15px]">{area.name}</p>
                      {area.description && (
                        <p className="text-sm text-ink-muted mt-0.5 leading-relaxed">
                          {area.description}
                        </p>
                      )}
                      {area.subAreas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {area.subAreas.slice(0, 6).map((sub) => (
                            <Badge key={sub}>{sub}</Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setAreas(move(areas, index, -1))}
                        disabled={index === 0}
                        className="text-ink-faint hover:text-ink disabled:opacity-25 p-0.5"
                        aria-label="Move up"
                      >
                        <ArrowLeft size={14} className="rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAreas(move(areas, index, 1))}
                        disabled={index === areas.length - 1}
                        className="text-ink-faint hover:text-ink disabled:opacity-25 p-0.5"
                        aria-label="Move down"
                      >
                        <ArrowRight size={14} className="rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAreas(areas.filter((_, i) => i !== index))}
                        className="text-ink-faint hover:text-critical p-0.5"
                        aria-label="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <Input
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Add an area we missed…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAreaName.trim()) {
                    e.preventDefault()
                    setAreas([
                      ...areas,
                      {
                        key: `custom_${newAreaName.toLowerCase().replace(/\W+/g, '_')}`,
                        name: newAreaName.trim(),
                        description: '',
                        priority: areas.length + 1,
                        subAreas: [],
                      },
                    ])
                    setNewAreaName('')
                  }
                }}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (!newAreaName.trim()) return
                  setAreas([
                    ...areas,
                    {
                      key: `custom_${newAreaName.toLowerCase().replace(/\W+/g, '_')}`,
                      name: newAreaName.trim(),
                      description: '',
                      priority: areas.length + 1,
                      subAreas: [],
                    },
                  ])
                  setNewAreaName('')
                }}
              >
                <Plus size={15} />
              </Button>
            </div>

            <Nav
              onBack={() => setStep(1)}
              onNext={submitAreas}
              nextLabel="Check my level"
              nextDisabled={areas.length === 0 || pending}
              pending={pending}
            />
          </Section>
        )}

        {step === 3 && (
          <Section
            title="Where do you stand?"
            subtitle="Under four minutes. Guess when you're unsure — a wrong guess tells us something too."
          >
            <Card className="p-5 mb-6">
              <p className="text-sm font-medium mb-4">First, your own read on it.</p>
              <div className="space-y-4">
                {(['speaking', 'listening', 'reading', 'writing'] as const).map((skill) => (
                  <div key={skill}>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="text-sm capitalize">{skill}</span>
                      <span className="text-xs text-ink-faint">
                        {['Nothing', 'A little', 'Basics', 'Comfortable', 'Strong'][selfAssessment[skill] - 1]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={selfAssessment[skill]}
                      onChange={(e) =>
                        setSelfAssessment({ ...selfAssessment, [skill]: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-4">
              {items.map((item, index) => (
                <Card key={item.id} className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge size="sm">{item.skill}</Badge>
                    <Badge size="sm">{item.level}</Badge>
                    <span className="text-xs text-ink-faint ml-auto tabular-nums">
                      {index + 1}/{items.length}
                    </span>
                  </div>

                  <div className="flex items-start gap-2 mb-3">
                    <p className="text-[15px] leading-relaxed flex-1">{item.prompt}</p>
                    {item.audioText && (
                      <AudioButton text={item.audioText} className="shrink-0 mt-0.5" />
                    )}
                  </div>

                  {item.audioText && (
                    <p className="text-xs text-ink-faint mb-3">
                      Play the audio — the text is intentionally hidden.
                    </p>
                  )}

                  {item.kind === 'multiple_choice' && item.options ? (
                    <div className="space-y-2">
                      {item.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAnswers({ ...answers, [item.id]: option })}
                          className={cn(
                            'w-full text-left px-3.5 py-2.5 rounded-[10px] border text-sm transition-all',
                            answers[item.id] === option
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
                      value={answers[item.id] ?? ''}
                      onChange={(e) => setAnswers({ ...answers, [item.id]: e.target.value })}
                      placeholder={
                        item.kind === 'free_production'
                          ? 'Write what you can — imperfect German is exactly what we need to see.'
                          : 'Your answer…'
                      }
                      rows={item.kind === 'free_production' ? 4 : 2}
                    />
                  )}
                </Card>
              ))}
            </div>

            <Nav
              onBack={() => setStep(2)}
              onNext={submitAssessment}
              nextLabel="See my profile"
              nextDisabled={pending}
              pending={pending}
            />
          </Section>
        )}

        {step === 4 && result && (
          <Section
            title="Your starting point."
            subtitle="One number was never going to be enough — here's the honest breakdown."
          >
            <Card raised className="p-6 mb-5">
              <div className="flex items-baseline justify-between mb-5">
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-faint mb-1">Overall</p>
                  <p className="font-display text-4xl">{result.overallLevel}</p>
                </div>
                <Badge tone="accent" size="md">
                  Starting at: {result.recommendedStartingStage}
                </Badge>
              </div>

              <div className="space-y-3">
                {result.dimensions.map((d) => (
                  <div key={d.dimension}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm capitalize">{d.dimension}</span>
                      <span className="text-xs text-ink-faint">
                        {d.level} · {Math.round(d.score)}%
                      </span>
                    </div>
                    <ProgressBar value={d.score} />
                    <p className="text-xs text-ink-muted mt-1 leading-relaxed">{d.comment}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Alert tone="accent" className="mb-5">
              <span className="font-medium">The gap that matters: </span>
              {result.biggestGap}
            </Alert>

            <p className="text-sm text-ink-muted leading-relaxed mb-6">{result.summary}</p>

            <Card className="p-5">
              <p className="text-sm font-medium mb-2">What happens next</p>
              <ul className="text-sm text-ink-muted space-y-1.5 leading-relaxed">
                <li className="flex gap-2">
                  <Check size={15} className="text-accent mt-0.5 shrink-0" />
                  A roadmap is generated for each of your top life areas.
                </li>
                <li className="flex gap-2">
                  <Check size={15} className="text-accent mt-0.5 shrink-0" />
                  Stages you&rsquo;ve already outgrown are skipped, not repeated.
                </li>
                <li className="flex gap-2">
                  <Check size={15} className="text-accent mt-0.5 shrink-0" />
                  Your first session and a few real-world missions are waiting.
                </li>
              </ul>
            </Card>

            <Nav
              onNext={finish}
              nextLabel="Build my roadmap"
              nextDisabled={pending}
              pending={pending}
              pendingLabel="Generating your roadmap…"
            />
          </Section>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-3xl mb-2 text-balance">{title}</h1>
      {subtitle && <p className="text-ink-muted mb-8 leading-relaxed">{subtitle}</p>}
      {children}
    </div>
  )
}

function ChoiceCard({
  selected,
  onClick,
  title,
  subtitle,
  compact,
}: {
  selected: boolean
  onClick: () => void
  title: string
  subtitle?: string
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-[10px] border transition-all',
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
        selected ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-ink-faint',
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      {subtitle && <span className="block text-xs text-ink-muted mt-0.5">{subtitle}</span>}
    </button>
  )
}

function Nav({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  pending,
  pendingLabel = 'Working…',
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  pending?: boolean
  pendingLabel?: string
}) {
  return (
    <div className="flex items-center gap-3 mt-8">
      {onBack && (
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft size={16} />
          Back
        </Button>
      )}
      <Button onClick={onNext} disabled={nextDisabled} size="lg" className="ml-auto">
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {pendingLabel}
          </>
        ) : (
          <>
            {nextLabel}
            <ArrowRight size={16} />
          </>
        )}
      </Button>
    </div>
  )
}

function move<T>(list: T[], index: number, direction: number): T[] {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  if (item) next.splice(target, 0, item)
  return next
}
