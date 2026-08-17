'use client'

/**
 * Text-to-speech abstraction (§19).
 *
 * The app never calls the speech API directly — it calls a TtsProvider. The
 * browser's Web Speech API is the default because it is free, instant, offline,
 * and ships genuinely good German voices on macOS, iOS and Windows.
 *
 * A cloud provider (ElevenLabs, OpenAI) slots in by implementing the same
 * interface and returning an audio URL from `synthesize`. Nothing in the UI
 * changes: components call speak()/stop() and read `speaking`.
 */

export type SpeakOptions = {
  /** BCP-47 tag, e.g. 'de-DE'. Comes from the language row, never hardcoded. */
  lang: string
  /** 1 = natural pace. The UI offers 0.6 for slow playback. */
  rate?: number
  pitch?: number
  voiceURI?: string
  onEnd?: () => void
  onError?: (error: string) => void
}

export interface TtsProvider {
  readonly name: string
  readonly available: boolean
  speak(text: string, options: SpeakOptions): void
  stop(): void
  /** Cloud providers return a cacheable URL; browser providers return null. */
  synthesize?(text: string, options: SpeakOptions): Promise<string | null>
  voices(lang: string): TtsVoice[]
}

export type TtsVoice = { id: string; name: string; lang: string; local: boolean }

/* -------------------------------------------------------------------------- */
/* Web Speech provider                                                        */
/* -------------------------------------------------------------------------- */

class WebSpeechProvider implements TtsProvider {
  readonly name = 'webspeech'

  get available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  voices(lang: string): TtsVoice[] {
    if (!this.available) return []
    const prefix = lang.split('-')[0]
    return window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.startsWith(prefix ?? lang))
      .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }))
  }

  speak(text: string, options: SpeakOptions): void {
    if (!this.available) {
      options.onError?.('Speech synthesis is not available in this browser.')
      return
    }

    // Chrome queues utterances; cancel first so replay is immediate.
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.lang
    utterance.rate = options.rate ?? 1
    utterance.pitch = options.pitch ?? 1

    const voices = window.speechSynthesis.getVoices()
    const chosen = options.voiceURI
      ? voices.find((v) => v.voiceURI === options.voiceURI)
      : pickBestVoice(voices, options.lang)
    if (chosen) utterance.voice = chosen

    utterance.onend = () => options.onEnd?.()
    utterance.onerror = (event) => {
      // 'interrupted' and 'canceled' are normal when the user replays or navigates.
      if (event.error === 'interrupted' || event.error === 'canceled') {
        options.onEnd?.()
        return
      }
      options.onError?.(event.error)
    }

    window.speechSynthesis.speak(utterance)
  }

  stop(): void {
    if (this.available) window.speechSynthesis.cancel()
  }
}

/**
 * Prefers a local voice in the exact locale — remote voices add latency and
 * break offline use. Falls back through language-only, then anything.
 */
function pickBestVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const prefix = lang.split('-')[0] ?? lang
  const exactLocal = voices.find((v) => v.lang === lang && v.localService)
  if (exactLocal) return exactLocal
  const exact = voices.find((v) => v.lang === lang)
  if (exact) return exact
  const langLocal = voices.find((v) => v.lang.startsWith(prefix) && v.localService)
  if (langLocal) return langLocal
  return voices.find((v) => v.lang.startsWith(prefix))
}

/* -------------------------------------------------------------------------- */
/* Cloud provider stub                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Placeholder for a server-backed voice. Implementing it means adding a route
 * that proxies the vendor and caches the audio against `phrases.audioRef`;
 * nothing in the components has to change.
 */
class CloudTtsProvider implements TtsProvider {
  readonly name = 'cloud'
  readonly available = false
  private fallback = new WebSpeechProvider()

  speak(text: string, options: SpeakOptions): void {
    this.fallback.speak(text, options)
  }
  stop(): void {
    this.fallback.stop()
  }
  async synthesize(): Promise<string | null> {
    return null
  }
  voices(lang: string): TtsVoice[] {
    return this.fallback.voices(lang)
  }
}

let provider: TtsProvider | null = null

export function getTts(): TtsProvider {
  if (!provider) {
    const configured = process.env.NEXT_PUBLIC_TTS_PROVIDER ?? 'webspeech'
    provider = configured === 'webspeech' ? new WebSpeechProvider() : new CloudTtsProvider()
  }
  return provider
}

/**
 * Splits text into sentences for sentence-by-sentence playback (§19).
 * Guards against abbreviations like "z.B." and "Dr." producing false breaks.
 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\b(z\.\s?B|d\.\s?h|u\.\s?a|bzw|ca|Dr|Hr|Fr|Nr|usw|etc)\./gi, '$1<DOT>')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/<DOT>/g, '.').trim())
    .filter(Boolean)
}
