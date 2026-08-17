'use client'

import { BookOpen, ChevronDown, Star } from 'lucide-react'
import { useState, useTransition } from 'react'

import { AudioButton } from '@/components/audio-button'
import { Badge, ProgressBar } from '@/components/ui'
import { cn } from '@/lib/utils'
import { toggleFavoriteAction } from '@/server/actions/practice'

export type PhraseCardData = {
  id?: string
  text: string
  translation: string
  literal?: string | null
  context: string
  register?: string
  regionTag?: string | null
  naturalnessNote?: string | null
  pronunciation?: string | null
  difficulty?: number
  lifeAreaKeys?: string[]
  grammarPatterns?: string[]
  vocab?: Array<{ lemma: string; translation: string; article?: string; plural?: string }>
  examples?: Array<{ text: string; translation: string; note?: string }>
  mastery?: number
  isFavorite?: boolean
}

/**
 * The product's fundamental display unit (§2.4).
 *
 * Translation is visible, context is always present, and everything else —
 * examples, vocabulary, the literal gloss — is folded away behind one control
 * so the phrase itself stays the thing you look at.
 */
export function PhraseCard({
  phrase,
  lang = 'de-DE',
  defaultExpanded = false,
  onAskGrammar,
  compact,
}: {
  phrase: PhraseCardData
  lang?: string
  defaultExpanded?: boolean
  onAskGrammar?: (text: string) => void
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [favorite, setFavorite] = useState(phrase.isFavorite ?? false)
  const [, startTransition] = useTransition()

  const hasDetail =
    Boolean(phrase.examples?.length) ||
    Boolean(phrase.vocab?.length) ||
    Boolean(phrase.literal) ||
    Boolean(phrase.naturalnessNote)

  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface transition-colors',
        compact ? 'p-3.5' : 'p-4',
      )}
    >
      <div className="flex items-start gap-2.5">
        <AudioButton text={phrase.text} lang={lang} className="shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <p className={cn('target-text leading-snug', compact ? 'text-[16px]' : 'text-[18px]')}>
            {phrase.text}
          </p>
          <p className="text-sm text-ink-muted mt-1 leading-relaxed">{phrase.translation}</p>

          <p className="text-[13px] text-ink-faint mt-2 leading-relaxed">{phrase.context}</p>

          {(phrase.register || phrase.regionTag || phrase.mastery !== undefined) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {phrase.register && phrase.register !== 'neutral' && (
                <Badge size="sm">{phrase.register}</Badge>
              )}
              {phrase.regionTag && (
                <Badge size="sm" tone="accent">
                  {phrase.regionTag}
                </Badge>
              )}
              {phrase.mastery !== undefined && (
                <span className="flex items-center gap-1.5 ml-auto">
                  <ProgressBar value={phrase.mastery} className="w-14" />
                  <span className="text-[11px] tabular-nums text-ink-faint">
                    {Math.round(phrase.mastery)}%
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          {phrase.id && (
            <button
              type="button"
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => {
                setFavorite(!favorite)
                startTransition(async () => {
                  await toggleFavoriteAction(phrase.id!)
                })
              }}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                favorite ? 'text-caution' : 'text-ink-faint hover:text-caution',
              )}
            >
              <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
            </button>
          )}
          {hasDetail && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Show less' : 'Show more'}
              className="p-1.5 rounded-lg text-ink-faint hover:text-ink transition-colors"
            >
              <ChevronDown size={15} className={cn('transition-transform', expanded && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>

      {expanded && hasDetail && (
        <div className="mt-4 pt-4 border-t border-line space-y-4 animate-fade-up">
          {phrase.naturalnessNote && (
            <div className="rounded-lg bg-caution/5 border border-caution/20 px-3 py-2.5">
              <p className="text-[13px] leading-relaxed">
                <span className="font-medium">Worth knowing: </span>
                {phrase.naturalnessNote}
              </p>
            </div>
          )}

          {phrase.literal && (
            <p className="text-[13px] text-ink-faint">
              <span className="text-ink-muted">Word for word: </span>
              {phrase.literal}
            </p>
          )}

          {phrase.examples && phrase.examples.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
                Same expression, different situation
              </p>
              <div className="space-y-2.5">
                {phrase.examples.map((example) => (
                  <div key={example.text} className="flex items-start gap-2">
                    <AudioButton
                      text={example.text}
                      lang={lang}
                      size="sm"
                      showSlow={false}
                      className="shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="target-text text-[15px] leading-snug">{example.text}</p>
                      <p className="text-[13px] text-ink-muted mt-0.5">{example.translation}</p>
                      {example.note && (
                        <p className="text-[12px] text-ink-faint mt-1 leading-relaxed">{example.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {phrase.vocab && phrase.vocab.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
                Words carried by this phrase
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {phrase.vocab.map((v) => (
                  <span key={v.lemma} className="text-[13px]">
                    <span className="target-text">
                      {v.article ? `${v.article} ` : ''}
                      {v.lemma}
                    </span>
                    <span className="text-ink-faint"> — {v.translation}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {onAskGrammar && phrase.grammarPatterns && phrase.grammarPatterns.length > 0 && (
            <button
              type="button"
              onClick={() => onAskGrammar(phrase.text)}
              className="flex items-center gap-1.5 text-[13px] text-accent hover:underline underline-offset-4"
            >
              <BookOpen size={13} />
              Explain the grammar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
