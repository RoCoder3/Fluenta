'use client'

import { Gauge, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { getTts } from '@/lib/tts'

/**
 * Audio playback for a phrase (§19).
 *
 * Every piece of target-language text in the app gets one of these. Normal and
 * slow playback are separate affordances rather than a settings toggle, because
 * a learner wants slow *for this one sentence*, not as a mode.
 */
export function AudioButton({
  text,
  lang = 'de-DE',
  size = 'md',
  showSlow = true,
  className,
}: {
  text: string
  lang?: string
  size?: 'sm' | 'md'
  showSlow?: boolean
  className?: string
}) {
  const [speaking, setSpeaking] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      getTts().stop()
    }
  }, [])

  const play = useCallback(
    (rate: number) => {
      const tts = getTts()
      if (!tts.available) {
        setUnavailable(true)
        return
      }
      setSpeaking(true)
      tts.speak(text, {
        lang,
        rate,
        onEnd: () => mounted.current && setSpeaking(false),
        onError: () => {
          if (!mounted.current) return
          setSpeaking(false)
          setUnavailable(true)
        },
      })
    },
    [text, lang],
  )

  const dims = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const icon = size === 'sm' ? 14 : 16

  if (unavailable) {
    return (
      <span className={cn('inline-flex items-center text-ink-faint', dims, className)} title="Audio is not available in this browser">
        <VolumeX size={icon} />
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <button
        type="button"
        onClick={() => play(1)}
        aria-label={`Play: ${text}`}
        className={cn(
          'inline-flex items-center justify-center rounded-lg transition-colors',
          dims,
          speaking ? 'text-accent bg-accent-soft' : 'text-ink-faint hover:text-accent hover:bg-accent-soft',
        )}
      >
        <Volume2 size={icon} className={speaking ? 'animate-pulse' : undefined} />
      </button>
      {showSlow && (
        <button
          type="button"
          onClick={() => play(0.6)}
          aria-label={`Play slowly: ${text}`}
          title="Play slowly"
          className={cn(
            'inline-flex items-center justify-center rounded-lg transition-colors text-ink-faint hover:text-accent hover:bg-accent-soft',
            dims,
          )}
        >
          <Gauge size={icon} />
        </button>
      )}
    </span>
  )
}
