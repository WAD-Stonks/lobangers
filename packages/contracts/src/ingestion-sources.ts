import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'

// Validate the literal BEFORE URL parsing: no URL-parser repairs, percent escapes,
// credentials, alternate hosts, ports, queries, fragments, or private/invite paths.
// This is syntax validation, not username availability. Do not impose the
// basic-username minimum on collectible usernames; provider preview identity is
// checked separately when an enabled source is scraped.
export const TELEGRAM_RESERVED_PREVIEW_NAMES = [
  'c',
  's',
  'joinchat',
  'share',
  'proxy',
  'socks',
  'login',
  'contact',
  'invoice',
  'boost',
  'iv',
  'addstickers',
  'addemoji',
  'addlist',
  'setlanguage',
  'bg',
  'giftcode',
  'stars',
  'confirmphone',
] as const
export const telegramPreviewUrlSchema = z
  .string()
  .max(128)
  .regex(
    /^https:\/\/t\.me\/s\/[A-Za-z0-9_]{1,32}$(?![\s\S])/,
    'Use https://t.me/s/<publicusername> without parameters',
  )
  .refine(
    (url) =>
      !TELEGRAM_RESERVED_PREVIEW_NAMES.some(
        (name) => name === url.slice('https://t.me/s/'.length).toLowerCase(),
      ),
    'Reserved Telegram route is not a channel',
  )
export const ingestionSourceIdSchema = z.string().regex(/^[0-9a-f]{24}$/)
export const ingestionSourceSchema = z
  .object({
    id: ingestionSourceIdSchema,
    name: z.string().min(1).max(120),
    provider: z.enum(['WORDPRESS', 'TELEGRAM']),
    externalId: z.string().min(1).max(120),
    url: z.url(),
    enabled: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (source) =>
      source.provider === 'TELEGRAM'
        ? telegramPreviewUrlSchema.safeParse(source.url).success &&
          source.externalId.toLowerCase() ===
            source.url.slice('https://t.me/s/'.length).toLowerCase()
        : source.externalId === 'moneydigest.sg' && source.url === 'https://www.moneydigest.sg/',
    'Unregistered source identity',
  )
export const ingestionSourcesQuerySchema = z
  .object({
    limit: boundedQueryInteger(1, 50, 20),
    cursor: ingestionSourceIdSchema.optional(),
  })
  .strict()
  .default({ limit: 20 })
export const ingestionSourcesResponseSchema = z
  .object({
    items: z.array(ingestionSourceSchema).max(50),
    nextCursor: ingestionSourceIdSchema.nullable(),
  })
  .strict()
export const ingestionAddSourceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    previewUrl: telegramPreviewUrlSchema,
  })
  .strict()
export const ingestionSourceParamsSchema = z.object({ sourceId: ingestionSourceIdSchema }).strict()
export const ingestionSetSourceEnabledRequestSchema = z
  .object({
    enabled: z.boolean(),
    expectedUpdatedAt: z.iso.datetime(),
    reuseConfirmed: z.boolean().optional().default(false),
  })
  .strict()
  .refine((input) => !input.enabled || input.reuseConfirmed, {
    path: ['reuseConfirmed'],
    message: 'Confirm source reuse before enabling',
  })
export type IngestionSource = z.infer<typeof ingestionSourceSchema>
export type IngestionSourcesQuery = z.infer<typeof ingestionSourcesQuerySchema>
export type IngestionSourcesResponse = z.infer<typeof ingestionSourcesResponseSchema>
export type IngestionAddSourceRequest = z.infer<typeof ingestionAddSourceRequestSchema>
export type IngestionSetSourceEnabledRequest = z.infer<
  typeof ingestionSetSourceEnabledRequestSchema
>
