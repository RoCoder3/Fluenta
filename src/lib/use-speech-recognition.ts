'use client'

/**
 * Speech recognition (§13).
 *
 * Wraps the browser SpeechRecognition API behind a hook so the components stay
 * ignorant of vendor prefixes and of the fact that Firefox has no support at
 * all. Where it's unavailable, `supported` is false and the UI offers typing
 * instead — speaking practice degrades to writing rather than disappearing.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeechRecognition(lang = 'de-DE') {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const startedAt = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
    return () => {
      recognitionRef.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser.')
      return
    }

    setError(null)
    setTranscript('')
    setInterim('')
    setSeconds(0)

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result?.[0]?.transcript ?? ''
        if (result?.isFinal) finalText += text
        else interimText += text
      }
      if (finalText) setTranscript((prev) => (prev ? `${prev} ${finalText}` : finalText).trim())
      setInterim(interimText)
    }

    recognition.onerror = (event) => {
      // 'aborted' and 'no-speech' are normal user behaviour, not failures.
      if (event.error === 'aborted' || event.error === 'no-speech') return
      setError(
        event.error === 'not-allowed'
          ? 'Microphone access was denied. Allow it in your browser settings, or type instead.'
          : `Speech recognition error: ${event.error}`,
      )
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
      if (timerRef.current) clearInterval(timerRef.current)
    }

    recognitionRef.current = recognition
    startedAt.current = Date.now()
    timerRef.current = setInterval(
      () => setSeconds(Math.round((Date.now() - startedAt.current) / 1000)),
      500,
    )

    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('Could not start the microphone.')
    }
  }, [lang])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setInterim('')
    setSeconds(0)
    setError(null)
  }, [])

  return { supported, listening, transcript, interim, error, seconds, start, stop, reset, setTranscript }
}
