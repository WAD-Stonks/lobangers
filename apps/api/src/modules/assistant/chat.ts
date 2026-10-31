import {
  buildCatalogue,
  type CatalogueEntry,
  type Coordinates,
  walkMinutesFor,
} from '@api/modules/assistant/catalogue'
import { buildSystemPrompt, RESPONSE_SCHEMA } from '@api/modules/assistant/prompt'
import {
  ASSISTANT_REPLY_MAX_CHARS,
  ASSISTANT_RESULT_MAX,
  type AssistantChatResponse,
  type AssistantFilters,
  type AssistantMessage,
  NO_ASSISTANT_FILTERS,
} from '@broke-oclock/contracts/assistant'
import { DEAL_CATEGORIES } from '@broke-oclock/contracts/deal-categories'
import { DEAL_CUISINES } from '@broke-oclock/contracts/deal-cuisines'
import type { DealPin } from '@broke-oclock/contracts/deals'
import type { JsonModelRequest } from '@broke-oclock/integrations/server'
import { z } from 'zod'

export type GenerateJson = (request: JsonModelRequest) => Promise<unknown>

const TEMPERATURE = 0.4
const MAX_OUTPUT_TOKENS = 700
const MAX_PRICE_MINOR = 1_000_000
const MAX_WALK_MINUTES = 120
const RECENT_USER_TURNS = 2

export const NO_MATCH_REPLY =
  "Aiyo, I couldn't find anything that ticks every box. Try loosening one thing, like a bigger budget or a longer walk?"
const FALLBACK_REPLY = `Here's what I clawed up for you!`

export const NO_FILTERS: AssistantFilters = NO_ASSISTANT_FILTERS

const modelOutputSchema = z.object({
  reply: z.string().catch(''),
  dealIds: z.array(z.string()).catch([]),
  filters: z
    .object({
      maxPriceDollars: z.number().finite().catch(0),
      endingToday: z.boolean().catch(false),
      maxWalkMinutes: z.number().finite().catch(0),
      categories: z.array(z.string()).catch([]),
      cuisines: z.array(z.string()).catch([]),
    })
    .nullable()
    .catch(null),
})

const clamp = (value: number, max: number) => Math.min(Math.max(Math.round(value), 0), max)
const oneOf = <T extends string>(allowed: readonly T[], values: readonly string[]): T[] => [
  ...new Set(
    values
      .map((value) => value.toUpperCase())
      .filter((value): value is T => (allowed as readonly string[]).includes(value)),
  ),
]

export const toFilters = (
  raw: z.infer<typeof modelOutputSchema>['filters'],
  fallback: AssistantFilters = NO_FILTERS,
): AssistantFilters =>
  raw
    ? {
        maxPriceMinor: clamp(raw.maxPriceDollars * 100, MAX_PRICE_MINOR),
        endingToday: raw.endingToday,
        maxWalkMinutes: clamp(raw.maxWalkMinutes, MAX_WALK_MINUTES),
        categories: oneOf(DEAL_CATEGORIES, raw.categories),
        cuisines: oneOf(DEAL_CUISINES, raw.cuisines),
      }
    : fallback

export const meetsFilters = (entry: CatalogueEntry, filters: AssistantFilters): boolean => {
  const { deal } = entry
  if (
    filters.maxPriceMinor > 0 &&
    deal.priceMinor !== null &&
    deal.priceMinor > filters.maxPriceMinor
  )
    return false
  if (filters.endingToday && !entry.endsToday) return false
  if (
    filters.maxWalkMinutes > 0 &&
    entry.distanceMetres !== null &&
    walkMinutesFor(entry.distanceMetres) > filters.maxWalkMinutes
  )
    return false
  if (
    filters.categories.length > 0 &&
    !(filters.categories as readonly string[]).includes(deal.category.toUpperCase())
  )
    return false
  if (
    filters.cuisines.length > 0 &&
    (deal.cuisine === null || !(filters.cuisines as readonly string[]).includes(deal.cuisine))
  )
    return false
  return true
}

export const cleanReply = (text: string): string => {
  const flat = text
    .replace(/[\p{Cc}\u{202A}-\u{202E}\u{2066}-\u{2069}]+/gu, ' ')
    .replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/,([,.!?])/g, '$1')
    .trim()
  return flat.length > ASSISTANT_REPLY_MAX_CHARS
    ? `${flat.slice(0, ASSISTANT_REPLY_MAX_CHARS - 1).trimEnd()}…`
    : flat
}

export const answerChat = async (input: {
  deals: readonly DealPin[]
  messages: readonly AssistantMessage[]
  position: Coordinates | null
  filters: AssistantFilters
  now: Date
  generate: GenerateJson
}): Promise<AssistantChatResponse> => {
  const recentUserTexts = input.messages
    .filter((message) => message.role === 'user')
    .slice(-RECENT_USER_TURNS)
    .map((message) => message.text)
  const catalogue = buildCatalogue(input.deals, {
    position: input.position,
    now: input.now,
    recentUserTexts,
  })

  const raw = await input.generate({
    system: buildSystemPrompt(catalogue, {
      now: input.now,
      located: input.position !== null,
      filters: input.filters,
    }),
    turns: input.messages.map((message) => ({
      role: message.role === 'user' ? 'user' : 'model',
      text: message.text,
    })),
    schema: RESPONSE_SCHEMA,
    temperature: TEMPERATURE,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const output = modelOutputSchema.parse(raw ?? {})
  const filters = toFilters(output.filters, input.filters)

  const byId = new Map(catalogue.map((entry) => [entry.deal.id, entry]))
  const picked = [...new Set(output.dealIds)].flatMap((id) => byId.get(id) ?? [])
  const kept = picked.filter((entry) => meetsFilters(entry, filters)).slice(0, ASSISTANT_RESULT_MAX)

  const reply =
    picked.length > 0 && kept.length === 0
      ? NO_MATCH_REPLY
      : cleanReply(output.reply) || (kept.length > 0 ? FALLBACK_REPLY : NO_MATCH_REPLY)

  return { reply, deals: kept.map((entry) => entry.deal), filters }
}
