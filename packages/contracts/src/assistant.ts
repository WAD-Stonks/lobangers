import { DEAL_CATEGORIES } from '@contracts/deal-categories'
import { DEAL_CUISINES } from '@contracts/deal-cuisines'
import { dealPinSchema } from '@contracts/deals'
import { z } from 'zod'

// Browser-safe schemas for Lobbie, the deal-finding chat on the browse map. The chat only
// reads public deals; nothing here describes a write.
export const ASSISTANT_MESSAGE_MAX_CHARS = 500
export const ASSISTANT_REPLY_MAX_CHARS = 600
export const ASSISTANT_HISTORY_MAX = 12
export const ASSISTANT_RESULT_MAX = 8

const userTurnSchema = z.strictObject({
  role: z.literal('user'),
  text: z.string().trim().min(1).max(ASSISTANT_MESSAGE_MAX_CHARS),
})
const lobbieTurnSchema = z.strictObject({
  role: z.literal('assistant'),
  text: z.string().trim().min(1).max(ASSISTANT_REPLY_MAX_CHARS),
})
export const assistantMessageSchema = z.discriminatedUnion('role', [
  userTurnSchema,
  lobbieTurnSchema,
])

export const assistantFiltersSchema = z.strictObject({
  maxPriceMinor: z.number().int().min(0).max(1_000_000),
  endingToday: z.boolean(),
  maxWalkMinutes: z.number().int().min(0).max(120),
  categories: z.array(z.enum(DEAL_CATEGORIES)).max(DEAL_CATEGORIES.length),
  cuisines: z.array(z.enum(DEAL_CUISINES)).max(DEAL_CUISINES.length),
})

export const NO_ASSISTANT_FILTERS: AssistantFilters = {
  maxPriceMinor: 0,
  endingToday: false,
  maxWalkMinutes: 0,
  categories: [],
  cuisines: [],
}

export const assistantChatQuerySchema = z.strictObject({})

export const assistantChatBodySchema = z.strictObject({
  messages: z
    .array(assistantMessageSchema)
    .min(1)
    .max(ASSISTANT_HISTORY_MAX)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must be the user'),
  // The visitor's position when they shared it; the server only uses it to measure walks.
  position: z
    .strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .default(null),
  filters: assistantFiltersSchema.default(NO_ASSISTANT_FILTERS),
})

export const assistantChatResponseSchema = z.strictObject({
  reply: z.string().min(1).max(ASSISTANT_REPLY_MAX_CHARS),
  deals: z.array(dealPinSchema).max(ASSISTANT_RESULT_MAX),
  filters: assistantFiltersSchema,
})

export type AssistantMessage = z.infer<typeof assistantMessageSchema>
export type AssistantChatBody = z.infer<typeof assistantChatBodySchema>
export type AssistantFilters = z.infer<typeof assistantFiltersSchema>
export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>
