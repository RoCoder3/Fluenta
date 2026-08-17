import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Phrase dedupe key: lowercase, strip punctuation, collapse whitespace. */
export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:„"“”'’\-–—()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function pct(value: number): string {
  return `${Math.round(clamp(value))}%`
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'never'
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const rem = Math.round(seconds % 60)
  return rem ? `${mins}m ${rem}s` : `${mins}m`
}

/** Deterministic pick — same inputs give the same choice, so UI doesn't flicker. */
export function pickStable<T>(items: T[], seed: string): T | undefined {
  if (!items.length) return undefined
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return items[Math.abs(h) % items.length]
}

export function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}
