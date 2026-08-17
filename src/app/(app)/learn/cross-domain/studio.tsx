'use client'

/**
 * Cross-Domain Fluency studio (§6).
 *
 * The learner picks two areas of their life; the engine recombines language
 * they already know from both into sentences that belong to neither. The
 * "built from" attribution is the point — it shows them they already had the
 * pieces.
 */

import { ArrowRight, Blend, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { Alert, Badge, Button, Card, EmptyState, SectionTitle } from '@/components/ui'
import { cn, relativeTime, titleCase } from '@/lib/utils'
import { generateCrossDomainAction } from '@/server/actions/learning'
import type { GeneratedCrossDomain } from '@/server/ai/schemas'

export function CrossDomainStudio({
  pairs,
  areaNames,
  recent,
}: {
  pairs: Array<[string, string]>
  areaNames: Record<string, string>
  recent: Array<{ id: string; lifeAreaKeys: string[]; content: Record<string, unknown>; createdAt: string }>
}) {
  const [selected, setSelected] = useState<[string, string] | null>(pairs[0] ?? null)
  const [result, setResult] = useState<GeneratedCrossDomain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const label = (key: string) => areaNames[key] ?? titleCase(key)

  const generate = () =>
    startTransition(async () => {
      setError(null)
      try {
        setResult(await generateCrossDomainAction(selected ?? undefined))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not build bridges yet.')
      }
    })

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:py-10">
      <header className="mb-7">
        <div className="flex items-center gap-2 mb-2">
          <Blend size={20} className="text-accent" />
          <h1 className="font-display text-3xl">Cross-domain fluency</h1>
        </div>
        <p className="text-ink-muted leading-relaxed">
          Real conversations don&rsquo;t respect topic boundaries. People talk about work, dinner and
          the gym in one breath. This takes language you already know from two parts of your life and
          recombines it into sentences you haven&rsquo;t met yet.
        </p>
      </header>

      {pairs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Blend size={26} />}
            title="Not enough material yet"
            description="Bridges are built from phrases you already know. Run sessions in two different life areas and this fills up."
          />
        </Card>
      ) : (
        <>
          <SectionTitle>Pick two areas to connect</SectionTitle>
          <div className="flex flex-wrap gap-2 mb-6">
            {pairs.map(([a, b]) => {
              const active = selected?.[0] === a && selected?.[1] === b
              return (
                <button
                  key={`${a}-${b}`}
                  type="button"
                  onClick={() => setSelected([a, b])}
                  className={cn(
                    'px-3.5 py-2 rounded-full text-sm border transition-all',
                    active
                      ? 'bg-accent text-accent-ink border-accent'
                      : 'bg-surface border-line-strong text-ink-muted hover:border-ink-faint',
                  )}
                >
                  {label(a)} <span className="opacity-50">+</span> {label(b)}
                </button>
              )
            })}
          </div>

          <Button onClick={generate} disabled={pending || !selected} size="lg">
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Finding the connections…
              </>
            ) : (
              <>
                Build bridges
                <ArrowRight size={16} />
              </>
            )}
          </Button>

          {error && (
            <Alert tone="critical" className="mt-4">
              {error}
            </Alert>
          )}
        </>
      )}

      {result && (
        <div className="mt-9 space-y-8 animate-fade-up">
          <Alert tone="accent">{result.bridgeInsight}</Alert>

          <section>
            <SectionTitle>New sentences from what you already know</SectionTitle>
            <div className="space-y-3">
              {result.bridgePhrases.map((phrase) => (
                <Card key={phrase.text} className="p-4">
                  <div className="flex items-start gap-2.5">
                    <AudioButton text={phrase.text} className="shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="target-text text-[17px] leading-snug">{phrase.text}</p>
                      <p className="text-sm text-ink-muted mt-1">{phrase.translation}</p>

                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {phrase.combines.map((key) => (
                          <Badge key={key} tone="accent" size="sm">
                            {label(key)}
                          </Badge>
                        ))}
                      </div>

                      {phrase.builtFrom.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-line">
                          <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-1.5">
                            Built from phrases you know
                          </p>
                          <ul className="space-y-1">
                            {phrase.builtFrom.map((source) => (
                              <li key={source} className="text-[13px] text-ink-muted">
                                {source}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {result.miniStory && (
            <section>
              <SectionTitle>A day in your life</SectionTitle>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-display text-lg target-text">{result.miniStory.title}</h3>
                  <AudioButton text={result.miniStory.text} className="shrink-0" />
                </div>
                <p className="target-text text-[17px] leading-relaxed">{result.miniStory.text}</p>
                <p className="text-sm text-ink-muted mt-4 leading-relaxed">
                  {result.miniStory.translation}
                </p>
                {result.miniStory.newElements.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-line">
                    <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
                      The only new pieces
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.miniStory.newElements.map((el) => (
                        <Badge key={el}>{el}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </section>
          )}

          <section>
            <SectionTitle>Now say it yourself</SectionTitle>
            <Card className="p-5">
              <p className="text-[15px] leading-relaxed mb-1">{result.speakingPrompt.prompt}</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                {result.speakingPrompt.situation}
              </p>
              {result.speakingPrompt.mustUse.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {result.speakingPrompt.mustUse.map((phrase) => (
                    <Badge key={phrase} tone="accent">
                      {phrase}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </div>
      )}

      {recent.length > 0 && !result && (
        <section className="mt-10">
          <SectionTitle>Earlier bridges</SectionTitle>
          <div className="space-y-2">
            {recent.map((item) => {
              const content = item.content as unknown as GeneratedCrossDomain
              return (
                <Card key={item.id} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {item.lifeAreaKeys.map((key) => (
                      <Badge key={key} size="sm">
                        {label(key)}
                      </Badge>
                    ))}
                    <span className="text-xs text-ink-faint ml-auto">
                      {relativeTime(item.createdAt)}
                    </span>
                  </div>
                  {content.bridgePhrases?.[0] && (
                    <p className="target-text text-[15px]">{content.bridgePhrases[0].text}</p>
                  )}
                </Card>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
