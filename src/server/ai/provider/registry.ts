import 'server-only'

/**
 * Provider registry — the single entry point every AI engine calls.
 *
 * Responsibilities:
 *   1. Pick a provider (explicit env choice, else Anthropic if keyed, else offline).
 *   2. Fall back to the offline adapter when a live call fails, so a missing key
 *      or a provider outage degrades the experience instead of breaking it.
 *   3. Redact PII before anything leaves the process (§30).
 *   4. Record every call in `ai_generations` for cost and privacy auditing.
 */

import { config } from '@/server/config'
import { getDb } from '@/server/db'
import { aiGenerations } from '@/server/db/schema'

import { AnthropicProvider } from './adapters/anthropic'
import { OfflineProvider } from './adapters/offline'
import type { AiPurpose, AiResult, LlmProvider, ObjectRequest, TextRequest } from './types'

const globalForAi = globalThis as unknown as {
  __ltProviders?: { live: LlmProvider | null; offline: LlmProvider }
}

function providers() {
  if (!globalForAi.__ltProviders) {
    const anthropic = new AnthropicProvider()
    const useAnthropic =
      config.ai.provider === 'anthropic' || (config.ai.provider === 'auto' && anthropic.available)

    globalForAi.__ltProviders = {
      live: useAnthropic && anthropic.available ? anthropic : null,
      offline: new OfflineProvider(),
    }
  }
  return globalForAi.__ltProviders
}

/** True when live generation is wired up. The UI uses this to be honest with the user. */
export function isLiveAi(): boolean {
  return providers().live !== null
}

export function activeProviderName(): string {
  return providers().live?.name ?? 'offline'
}

/* -------------------------------------------------------------------------- */
/* PII redaction                                                              */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g
const PHONE_RE = /\+?\d[\d\s()-]{7,}\d/g

/**
 * Strips direct identifiers before the prompt leaves the process. The learner's
 * *situation* (IT job, Zurich, climbing) is exactly what makes generation good,
 * so it stays; the things that identify a person do not.
 */
export function redact(text: string, extra: string[] = []): string {
  if (!config.ai.redactPii) return text
  let out = text.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]')
  for (const term of extra) {
    const trimmed = term?.trim()
    if (!trimmed || trimmed.length < 3) continue
    out = out.replace(new RegExp(escapeRegex(trimmed), 'gi'), '[name]')
  }
  return out
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export type CallContext = {
  userId?: string
  engine: string
  /** Names to scrub from the prompt, e.g. the learner's own name. */
  redactTerms?: string[]
}

export async function generateObject<T>(
  req: ObjectRequest<T>,
  ctx: CallContext,
): Promise<AiResult<T>> {
  const safe: ObjectRequest<T> = {
    ...req,
    prompt: redact(req.prompt, ctx.redactTerms),
    system: redact(req.system, ctx.redactTerms),
  }
  return run(safe.purpose, ctx, (p) => p.generateObject(safe))
}

export async function generateText(req: TextRequest, ctx: CallContext): Promise<AiResult<string>> {
  const safe: TextRequest = {
    ...req,
    prompt: redact(req.prompt, ctx.redactTerms),
    system: redact(req.system, ctx.redactTerms),
  }
  return run(safe.purpose, ctx, (p) => p.generateText(safe))
}

async function run<T>(
  purpose: AiPurpose,
  ctx: CallContext,
  invoke: (provider: LlmProvider) => Promise<AiResult<T>>,
): Promise<AiResult<T>> {
  const { live, offline } = providers()

  if (live) {
    try {
      const result = await invoke(live)
      void record(ctx, purpose, result, null)
      return result
    } catch (error) {
      // A live failure must not break the lesson the learner is in the middle of.
      console.error(`[ai] ${purpose} failed on ${live.name}, falling back to offline:`, error)
      void record(ctx, purpose, null, error, live.name)
    }
  }

  const result = await invoke(offline)
  void record(ctx, purpose, result, null)
  return result
}

async function record<T>(
  ctx: CallContext,
  purpose: AiPurpose,
  result: AiResult<T> | null,
  error: unknown,
  failedProvider?: string,
): Promise<void> {
  try {
    const db = await getDb()
    await db.insert(aiGenerations).values({
      userId: ctx.userId ?? null,
      engine: ctx.engine,
      purpose,
      provider: result?.provider ?? failedProvider ?? 'unknown',
      model: result?.model ?? null,
      inputTokens: result?.usage.inputTokens ?? null,
      outputTokens: result?.usage.outputTokens ?? null,
      latencyMs: result?.usage.latencyMs ?? null,
      ok: error === null,
      error: error ? String(error instanceof Error ? error.message : error).slice(0, 500) : null,
      redacted: config.ai.redactPii,
    })
  } catch {
    // Telemetry must never take down a request.
  }
}
