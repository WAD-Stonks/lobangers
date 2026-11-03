import {
  checkDealFields,
  dealContentShape,
  dealObjectIdSchema,
  dealPhotoKeySchema,
} from '@contracts/deal-forms'
import { offerTypeSchema } from '@contracts/deals'
import { z } from 'zod'

// Browser-safe schemas for flash deals: a merchant's short, limited-code deal at one outlet
// (/api/merchant/flash-drops). The merchant saves it as a draft and presses Go live; it then
// shows on the map from its start time and is claimed by visitors (/api/flash-drops). Admins
// can stop any flash deal (/api/admin/flash-drops).

export const FLASH_DROP_DURATIONS = [15, 30, 60] as const
export const FLASH_DROP_RADII = [300, 500, 1000] as const
export const FLASH_DROP_MIN_CODES = 10
export const FLASH_DROP_MAX_CODES = 200
// How long a claimed code stays good once claiming closes. The claim window above is only for
// claiming; people then have this long to get to the counter. END_OF_DAY is 11:59 pm in
// Singapore on the day claiming closes.
export const FLASH_CODE_VALIDITIES = [
  'TWO_HOURS',
  'END_OF_DAY',
  'THREE_DAYS',
  'SEVEN_DAYS',
] as const
export const flashCodeValiditySchema = z.enum(FLASH_CODE_VALIDITIES)
export type FlashCodeValidity = z.infer<typeof flashCodeValiditySchema>
export const DEFAULT_FLASH_CODE_VALIDITY: FlashCodeValidity = 'END_OF_DAY'
// A flash deal can be scheduled up to a week ahead, never in the past.
export const FLASH_DROP_MAX_LEAD_DAYS = 7
// More codes than this at one stall is flagged for admins, not refused.
export const FLASH_DROP_MANY_CODES = 80

// The flash offer has the same choices as a deal. Flash deals made before offer types read as a
// fixed flash price.
export const flashOfferShape = {
  offerType: offerTypeSchema.default('FIXED_PRICE'),
  discountPercent: z.number().int().min(1).max(100).nullable().default(null),
  // Only for a fixed-price flash offer.
  flashPriceCents: z.number().int().positive().nullable(),
}

export const flashDropDisplayStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'LIVE',
  'ENDED',
  'STOPPED',
])
export type FlashDropDisplayStatus = z.infer<typeof flashDropDisplayStatusSchema>

export const flashDropParamsSchema = z.strictObject({ dropId: dealObjectIdSchema })
export const flashDropEmptyQuerySchema = z.strictObject({})

// ----- Public map -----

export const publicFlashDropSchema = z.strictObject({
  id: dealObjectIdSchema,
  dealId: dealObjectIdSchema,
  dealTitle: z.string(),
  category: z.string(),
  venueId: dealObjectIdSchema,
  venueName: z.string(),
  lat: z.number(),
  lng: z.number(),
  ...flashOfferShape,
  usualPriceCents: z.number().int().positive().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  // When codes claimed from this drop stop working at the counter.
  codesExpireAt: z.iso.datetime(),
  radiusMetres: z.number().int().positive(),
  codesLeft: z.number().int().nonnegative(),
  codeLimit: z.number().int().positive(),
  // A fake drop made for a demonstration; the map labels it "Fake deal".
  demo: z.boolean(),
})
export const activeFlashDropsResponseSchema = z.strictObject({
  serverTime: z.iso.datetime(),
  items: z.array(publicFlashDropSchema).max(50),
})

export const flashCodeSchema = z.strictObject({
  code: z.string().regex(/^LB-[A-Z2-9]{6}$/),
  dropId: dealObjectIdSchema,
  dealId: dealObjectIdSchema,
  dealTitle: z.string(),
  venueName: z.string(),
  ...flashOfferShape,
  claimedAt: z.iso.datetime(),
  // When claiming closed (or closes), and when the code itself stops working.
  endsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  // A code is good at the counter until it expires, even after claiming closes; only an admin
  // removing the drop cancels it early.
  active: z.boolean(),
  demo: z.boolean(),
})
export const flashCodesResponseSchema = z.strictObject({
  items: z.array(flashCodeSchema).max(100),
})

// ----- Merchant -----

// A flash deal is saved from the merchant's deal form: the deal (its title, description and the
// flash offer itself: 1-for-1, % off, a fixed price or other) plus where and when it runs.
// Saving creates or updates a draft; nothing is public until Go live.
export const merchantFlashDropBodySchema = z
  .strictObject({
    ...dealContentShape,
    terms: z.string().trim().max(1000),
    // One optional photo, as on ordinary merchant deals: a key attaches it, null removes it and
    // leaving it out keeps the current one.
    photoKey: dealPhotoKeySchema.nullable().optional(),
    // For a fixed-price flash offer, the usual price it beats, to show the saving. Optional.
    usualPriceCents: z.number().int().min(1).max(100_000).nullable(),
    outletId: dealObjectIdSchema,
    // The saved start time, or null to start at the moment the merchant presses Go live.
    startsAt: z.iso.datetime().nullable(),
    durationMinutes: z.union(FLASH_DROP_DURATIONS.map((value) => z.literal(value))),
    codeValidity: flashCodeValiditySchema.default(DEFAULT_FLASH_CODE_VALIDITY),
    radiusMetres: z.union(FLASH_DROP_RADII.map((value) => z.literal(value))),
    codeLimit: z.number().int().min(FLASH_DROP_MIN_CODES).max(FLASH_DROP_MAX_CODES),
    // The draft's version when editing, so two tabs cannot overwrite each other.
    version: z.number().int().min(1).optional(),
  })
  .superRefine((value, context) => {
    checkDealFields({ ...value, startDate: '', endDate: '' }, context)
    if (value.usualPriceCents === null) return
    if (value.offerType !== 'FIXED_PRICE')
      context.addIssue({ code: 'custom', path: ['usualPriceCents'], message: 'Invalid price' })
    else if (value.priceCents !== null && value.usualPriceCents <= value.priceCents)
      context.addIssue({
        code: 'custom',
        path: ['usualPriceCents'],
        message: 'The usual price has to be higher than the flash price',
      })
  })
// Go live and End both name the version the merchant was looking at.
export const merchantFlashDropVersionSchema = z.strictObject({ version: z.number().int().min(1) })
export const merchantFlashDropEndSchema = merchantFlashDropVersionSchema

// The deal behind a flash deal, so a draft can be opened again in the deal form.
export const flashDealContentSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  cuisine: z.string().nullable(),
  offerType: offerTypeSchema,
  discountPercent: z.number().int().nullable(),
  priceCents: z.number().int().nullable(),
  terms: z.string(),
  photo: z.strictObject({ key: z.string(), url: z.string().url() }).nullable(),
})

const flashDropCoreShape = {
  id: dealObjectIdSchema,
  dealId: dealObjectIdSchema,
  dealTitle: z.string(),
  outletId: dealObjectIdSchema,
  outletName: z.string(),
  ...flashOfferShape,
  usualPriceCents: z.number().int().positive().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  // Null for flash deals made before codes outlived the claim window.
  codeValidity: flashCodeValiditySchema.nullable(),
  codesExpireAt: z.iso.datetime(),
  radiusMetres: z.number().int().positive(),
  codeLimit: z.number().int().positive(),
  claimedCount: z.number().int().nonnegative(),
  status: flashDropDisplayStatusSchema,
  reviewNote: z.string().nullable(),
  version: z.number().int().min(1),
  demo: z.boolean(),
}

export const merchantFlashDropSchema = z.strictObject({
  ...flashDropCoreShape,
  deal: flashDealContentSchema,
  // A draft that starts when Go live is pressed; startsAt is then only a placeholder.
  startsOnGoLive: z.boolean(),
})
export const merchantFlashDropsResponseSchema = z.strictObject({
  items: z.array(merchantFlashDropSchema).max(100),
})

// ----- Admin -----

// Admins see flash deals once they have gone live (scheduled, live or ended); drafts are the
// merchant's own.
export const flashDropViewSchema = z.enum(['scheduled', 'live', 'ended'])
export const adminFlashDropsQuerySchema = z.strictObject({
  view: flashDropViewSchema.default('live'),
})

// Checks worked out on the server so every admin sees the same facts. An overlap is a warning,
// not a refusal.
export const flashDropChecksSchema = z.strictObject({
  merchantHoldsOutlet: z.boolean(),
  outletLocated: z.boolean(),
  priceLower: z.boolean().nullable(),
  manyCodes: z.boolean(),
  overlaps: z
    .array(
      z.strictObject({
        id: dealObjectIdSchema,
        dealTitle: z.string(),
        outletName: z.string(),
        distanceMetres: z.number().int().nonnegative(),
      }),
    )
    .max(10),
})

export const adminFlashDropSchema = z.strictObject({
  ...flashDropCoreShape,
  merchantName: z.string(),
  outletLat: z.number(),
  outletLng: z.number(),
  checks: flashDropChecksSchema,
})
export const adminFlashDropsResponseSchema = z.strictObject({
  items: z.array(adminFlashDropSchema).max(100),
  counts: z.strictObject({
    scheduled: z.number().int().nonnegative(),
    live: z.number().int().nonnegative(),
    ended: z.number().int().nonnegative(),
    claimedToday: z.number().int().nonnegative(),
  }),
})

// Removing a flash deal stops it straight away and hides it from the map; the record and its
// claimed codes are kept. The note tells the merchant why.
export const adminFlashDropDecisionSchema = z.strictObject({
  decision: z.literal('STOP'),
  note: z.string().trim().min(1, 'Add a note so the merchant knows why').max(500),
  version: z.number().int().min(1),
})

// ----- Live updates -----

// Flash deal changes are pushed over Pusher so the map and the merchant dashboard update at once
// instead of on the next poll. A push carries no deal data: it only says which drop changed and
// how, and each browser re-reads through the REST API it already uses. Without Pusher configured
// both simply keep polling.
export const FLASH_DROPS_CHANNEL = 'flash-drops'
export const FLASH_DROP_CHANGED_EVENT = 'changed'
export const merchantFlashChannelPattern = /^private-merchant-flash-[a-f0-9]{24}$/
export const merchantFlashChannelFor = (userId: string) => `private-merchant-flash-${userId}`
export const flashDropChangeSchema = z.strictObject({
  dropId: dealObjectIdSchema,
  kind: z.enum(['LIVE', 'CLAIMED', 'ENDED', 'STOPPED']),
})
export const flashRealtimeConfigSchema = z.strictObject({
  pusher: z.strictObject({ key: z.string().min(1), cluster: z.string().min(1) }).nullable(),
})
export const merchantFlashRealtimeAuthSchema = z.strictObject({
  socketId: z.string().regex(/^\d+\.\d+$/, 'Invalid socket'),
  channel: z.string().regex(merchantFlashChannelPattern, 'Invalid channel'),
})
export const merchantFlashRealtimeAuthResponseSchema = z.strictObject({ auth: z.string().min(1) })

export type FlashDropChange = z.infer<typeof flashDropChangeSchema>
export type FlashRealtimeConfig = z.infer<typeof flashRealtimeConfigSchema>
export type MerchantFlashRealtimeAuth = z.infer<typeof merchantFlashRealtimeAuthSchema>
export type PublicFlashDrop = z.infer<typeof publicFlashDropSchema>
export type ActiveFlashDropsResponse = z.infer<typeof activeFlashDropsResponseSchema>
export type FlashCode = z.infer<typeof flashCodeSchema>
export type MerchantFlashDropBody = z.infer<typeof merchantFlashDropBodySchema>
export type MerchantFlashDrop = z.infer<typeof merchantFlashDropSchema>
export type FlashDealContent = z.infer<typeof flashDealContentSchema>
export type FlashDropView = z.infer<typeof flashDropViewSchema>
export type FlashDropChecks = z.infer<typeof flashDropChecksSchema>
export type AdminFlashDrop = z.infer<typeof adminFlashDropSchema>
export type AdminFlashDropsResponse = z.infer<typeof adminFlashDropsResponseSchema>
export type AdminFlashDropDecision = z.infer<typeof adminFlashDropDecisionSchema>
