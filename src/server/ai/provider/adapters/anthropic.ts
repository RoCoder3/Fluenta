import 'server-only'

/**
 * Anthropic adapter.
 *
 * Structured output is done with a single forced tool call: the Zod schema is
 * converted to JSON Schema and handed over as the tool's input schema, so the
 * model returns validated arguments instead of prose we'd have to parse.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { config } from '@/server/config'

import { AiError, type AiResult, type LlmProvider, type ObjectRequest, type TextRequest } from '../types'

const MAX_ATTEMPTS = 3

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic'
  private client: Anthropic | null

  constructor(apiKey = config.ai.anthropicApiKey) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null
  }

  get available(): boolean {
    return this.client !== null
  }

  private model(tier: 'primary' | 'fast' = 'primary'): string {
    return tier === 'fast' ? config.ai.modelFast : config.ai.modelPrimary
  }

  async generateObject<T>(req: ObjectRequest<T>): Promise<AiResult<T>> {
    if (!this.client) throw new AiError('Anthropic provider has no API key', req.purpose)

    const model = this.model(req.tier)
    const started = Date.now()

    // Zod → JSON Schema. Anthropic requires a top-level object schema, so
    // non-object schemas are wrapped in { result: ... } and unwrapped after.
    const rawJsonSchema = z.toJSONSchema(req.schema as z.ZodType, { target: 'draft-7', io: 'output' })
    const isObject = (rawJsonSchema as { type?: string }).type === 'object'
    const inputSchema = isObject
      ? rawJsonSchema
      : { type: 'object', properties: { result: rawJsonSchema }, required: ['result'] }

    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0.7,
          system: req.system,
          tools: [
            {
              name: req.schemaName,
              description: req.schemaDescription ?? `Return a well-formed ${req.schemaName}.`,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input_schema: inputSchema as any,
            },
          ],
          tool_choice: { type: 'tool', name: req.schemaName },
          messages: [{ role: 'user', content: req.prompt }],
        })

        const toolUse = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        )
        if (!toolUse) throw new Error('Model returned no tool call')

        const candidate = isObject
          ? toolUse.input
          : (toolUse.input as { result: unknown }).result

        const parsed = req.schema.safeParse(candidate)
        if (!parsed.success) {
          throw new Error(`Schema validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
        }

        return {
          data: parsed.data,
          provider: this.name,
          model,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            latencyMs: Date.now() - started,
          },
          offline: false,
        }
      } catch (error) {
        lastError = error
        if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break
        await sleep(300 * 2 ** (attempt - 1))
      }
    }

    throw new AiError(
      `Anthropic generateObject failed for ${req.purpose}: ${errorMessage(lastError)}`,
      req.purpose,
      lastError,
    )
  }

  async generateText(req: TextRequest): Promise<AiResult<string>> {
    if (!this.client) throw new AiError('Anthropic provider has no API key', req.purpose)

    const model = this.model(req.tier)
    const started = Date.now()

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.7,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      })

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()

      return {
        data: text,
        provider: this.name,
        model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          latencyMs: Date.now() - started,
        },
        offline: false,
      }
    } catch (error) {
      throw new AiError(
        `Anthropic generateText failed for ${req.purpose}: ${errorMessage(error)}`,
        req.purpose,
        error,
      )
    }
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 429 || (error.status !== undefined && error.status >= 500)
  }
  // Schema validation misses are worth one more sample at a higher temperature.
  return error instanceof Error && error.message.startsWith('Schema validation failed')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
