'use client'

/**
 * Switching what you are learning.
 *
 * Languages already started are listed first and switch instantly. Languages
 * available but not started are shown below a divider and are labelled as
 * needing setup, so the difference between "resume" and "start something new"
 * is visible before you click rather than discovered afterwards.
 */

import { Check, ChevronDown, Loader2, Plus } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'

import { cn } from '@/lib/utils'
import { switchLanguageAction } from '@/server/actions/language'

export type SwitcherLanguage = {
  code: string
  name: string
  nativeName: string
  /** Has the learner started this language at all? */
  enrolled: boolean
  /** Has its onboarding been completed? */
  onboarded: boolean
}

export function LanguageSwitcher({
  languages,
  activeCode,
  placement = 'above',
}: {
  languages: SwitcherLanguage[]
  activeCode: string
  /** The sidebar sits at the bottom of the screen, so its menu opens upward. */
  placement?: 'above' | 'below'
}) {
  const [open, setOpen] = useState(false)
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const active = languages.find((l) => l.code === activeCode)
  const started = languages.filter((l) => l.enrolled)
  const available = languages.filter((l) => !l.enrolled)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // One language and nothing else offered — a menu would be a dead end.
  if (languages.length < 2) return null

  function choose(code: string) {
    if (code === activeCode) {
      setOpen(false)
      return
    }
    setPendingCode(code)
    startTransition(async () => {
      try {
        await switchLanguageAction(code)
      } finally {
        setPendingCode(null)
        setOpen(false)
      }
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
          'border border-line text-ink-muted hover:text-ink hover:border-line-strong',
        )}
      >
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">Learning</span>
        <span className="flex-1 text-left font-medium text-ink truncate">
          {active?.name ?? activeCode.toUpperCase()}
        </span>
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 right-0 z-50 rounded-xl border border-line bg-surface shadow-lg overflow-hidden',
            placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {started.map((lang) => (
            <Row
              key={lang.code}
              lang={lang}
              active={lang.code === activeCode}
              pending={pendingCode === lang.code}
              onClick={() => choose(lang.code)}
            />
          ))}

          {available.length > 0 && (
            <>
              <div className="px-3 pt-2.5 pb-1 border-t border-line">
                <p className="text-[11px] uppercase tracking-wider text-ink-faint">Start a new one</p>
              </div>
              {available.map((lang) => (
                <Row
                  key={lang.code}
                  lang={lang}
                  active={false}
                  pending={pendingCode === lang.code}
                  onClick={() => choose(lang.code)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({
  lang,
  active,
  pending,
  onClick,
}: {
  lang: SwitcherLanguage
  active: boolean
  pending: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      disabled={pending}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas hover:text-ink',
      )}
    >
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{lang.name}</span>
        <span className="block text-xs text-ink-faint truncate">
          {lang.enrolled
            ? lang.onboarded
              ? lang.nativeName
              : 'Setup unfinished'
            : 'Needs a short setup'}
        </span>
      </span>
      {pending ? (
        <Loader2 size={14} className="animate-spin shrink-0" />
      ) : active ? (
        <Check size={15} className="shrink-0" />
      ) : !lang.enrolled ? (
        <Plus size={14} className="shrink-0 text-ink-faint" />
      ) : null}
    </button>
  )
}
