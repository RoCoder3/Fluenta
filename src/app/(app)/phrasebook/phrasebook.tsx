'use client'

/**
 * Personal phrase library (§14).
 */

import { BookMarked, Loader2, Plus, Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import { GrammarDrawer } from '@/components/grammar-drawer'
import { PhraseCard, type PhraseCardData } from '@/components/phrase-card'
import { Alert, Badge, Button, Card, EmptyState, Input, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { savePhraseAction } from '@/server/actions/practice'

type Entry = PhraseCardData & { id: string; status: string; reps: number }

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'learning', label: 'Learning' },
  { key: 'review', label: 'In review' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'difficult', label: 'Difficult' },
  { key: 'favorite', label: 'Favorites' },
]

export function Phrasebook({
  entries,
  filter,
  query,
}: {
  entries: Entry[]
  filter: string
  query: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(query)
  const [adding, setAdding] = useState(false)
  const [grammarFor, setGrammarFor] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/phrasebook?${params.toString()}`)
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:py-10">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="font-display text-3xl">Phrasebook</h1>
          <Button size="sm" variant="secondary" onClick={() => setAdding(!adding)}>
            <Plus size={15} />
            Add
          </Button>
        </div>
        <p className="text-ink-muted leading-relaxed">
          Everything you&rsquo;ve met, with where you stand on each. Mastery only rises when you can
          use a phrase in several different ways — not when you&rsquo;ve seen it several times.
        </p>
      </header>

      {adding && <AddPhraseForm onClose={() => setAdding(false)} />}

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search German or English…"
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter') startTransition(() => setParam('q', search))
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => startTransition(() => setParam('filter', f.key === 'all' ? '' : f.key))}
            className={cn(
              'px-3 py-1.5 rounded-full text-[13px] border transition-all',
              filter === f.key
                ? 'bg-accent text-accent-ink border-accent'
                : 'bg-surface border-line-strong text-ink-muted hover:border-ink-faint',
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-ink-faint tabular-nums">
          {entries.length} {entries.length === 1 ? 'phrase' : 'phrases'}
        </span>
      </div>

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookMarked size={26} />}
            title={query ? 'Nothing matched' : 'Nothing here yet'}
            description={
              query
                ? 'Try a different search.'
                : 'Run a session and phrases start collecting here automatically.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id}>
              <PhraseCard phrase={entry} onAskGrammar={setGrammarFor} />
              {entry.reps > 0 && (
                <p className="text-[11px] text-ink-faint mt-1 ml-1">
                  {entry.reps} {entry.reps === 1 ? 'review' : 'reviews'} · {entry.status}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <GrammarDrawer
        open={grammarFor !== null}
        onClose={() => setGrammarFor(null)}
        triggerText={grammarFor ?? undefined}
        initialQuestion={grammarFor ? `Explain the grammar in: "${grammarFor}"` : ''}
      />
    </div>
  )
}

function AddPhraseForm({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [translation, setTranslation] = useState('')
  const [context, setContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Card className="p-5 mb-6 animate-fade-up">
      <p className="text-sm font-medium mb-3">Save a phrase you heard</p>
      <div className="space-y-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="German phrase" />
        <Input
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
          placeholder="What it means"
        />
        <Textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          placeholder="Where did you hear it? When would you say it?"
          className="min-h-[60px]"
        />
      </div>

      {error && (
        <Alert tone="critical" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="flex gap-2 mt-4">
        <Button
          size="sm"
          disabled={pending || !text.trim() || !translation.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              try {
                await savePhraseAction({ text, translation, context })
                onClose()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not save.')
              }
            })
          }
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>

      <p className="text-xs text-ink-faint mt-3">
        Saved phrases stay private to your account and enter your review queue.
      </p>
    </Card>
  )
}
