import type { z } from 'zod'

/**
 * LLM provider contract.
 *
 * Every AI engine in the app talks to this interface and nothing else. No
 * engine imports the Anthropic SDK, mentions a model name, or builds a raw
 * HTTP request. Swapping providers means adding one file under ./adapters.
 */

/** Tags every call so telemetry, caching and the offline adapter can route on it. */
export type AiPurpose =
  | 'intake.extract'
  | 'roadmap.generate'
  | 'roadmap.revise'
  | 'content.lesson'
  | 'content.phrases'
  | 'content.dialogue'
  | 'content.comprehension'
  | 'conversation.turn'
  | 'conversation.analyze'
  | 'feedback.writing'
  | 'feedback.speaking'
  | 'error.extract'
  | 'review.item'
  | 'crossdomain.generate'
  | 'grammar.explain'
  | 'assessment.generate'
  | 'assessment.score'
  | 'mission.generate'
  | 'tutor.chat'
  | 'goal.plan'

export type AiUsage = {
  inputTokens?: number
  outputTokens?: number
  latencyMs: number
}

export type AiResult<T> = {
  data: T
  provider: string
  model: string | null
  usage: AiUsage
  /** True when the offline adapter served this rather than a live model. */
  offline: boolean
}

export type ObjectRequest<T> = {
  purpose: AiPurpose
  system: string
  prompt: string
  schema: z.ZodType<T>
  schemaName: string
  schemaDescription?: string
  temperature?: number
  maxTokens?: number
  /** Prefer the cheaper/faster model where quality allows. */
  tier?: 'primary' | 'fast'
}

export type TextRequest = {
  purpose: AiPurpose
  system: string
  prompt: string
  temperature?: number
  maxTokens?: number
  tier?: 'primary' | 'fast'
}

export interface LlmProvider {
  readonly name: string
  /** False when the adapter has no credentials; the registry then falls back. */
  readonly available: boolean
  generateObject<T>(req: ObjectRequest<T>): Promise<AiResult<T>>
  generateText(req: TextRequest): Promise<AiResult<string>>
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly purpose: AiPurpose,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
