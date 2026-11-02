import { dealObjectIdSchema } from '@contracts/deal-forms'
import { z } from 'zod'

// Browser-safe schemas for Flash Drop: a merchant's short, limited-code drop of one of their own
// deals at one outlet (/api/merchant/flash-drops), reviewed by an admin before it goes live
// (/api/admin/flash-drops), then shown on the map and claimed by visitors (/api/flash-drops).

export const FLASH_DROP_DURATIONS = [15, 30, 60] as const
export const FLASH_DROP_RADII = [300, 500, 1000] as const
export const FLASH_DROP_MIN_CODES = 10
export const FLASH_DROP_MAX_CODES = 200
// A drop can be scheduled up to a week ahead; review takes time, so it can start a little after
// it is sent, never in the past.
export const FLASH_DROP_MAX_LEAD_DAYS = 7
// More codes than this at one stall is flagged for the reviewer, not refused.
export const FLASH_DROP_MANY_CODES = 80

export const flashDropDisplayStatusSchema = z.enum([
  'IN_REVIEW',
  'SCHEDULED',
  'LIVE',
  'ENDED',
  'SENT_BACK',
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
  flashPriceCents: z.number().int().positive(),
  usualPriceCents: z.number().int().positive().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
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
  flashPriceCents: z.number().int().positive(),
  claimedAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  // Codes are shown at the counter until the drop ends.
  active: z.boolean(),
  demo: z.boolean(),
})
export const flashCodesResponseSchema = z.strictObject({
  items: z.array(flashCodeSchema).max(100),
})

// ----- Merchant -----

export const merchantFlashDropBodySchema = z
  .strictObject({
    dealId: dealObjectIdSchema,
    outletId: dealObjectIdSchema,
    flashPriceCents: z.number().int().min(1).max(100_000),
    startsAt: z.iso.datetime(),
    durationMinutes: z.union(FLASH_DROP_DURATIONS.map((value) => z.literal(value))),
    radiusMetres: z.union(FLASH_DROP_RADII.map((value) => z.literal(value))),
    codeLimit: z.number().int().min(FLASH_DROP_MIN_CODES).max(FLASH_DROP_MAX_CODES),
  })
  .extend({ version: z.number().int().min(1).optional() })
export const merchantFlashDropEndSchema = z.strictObject({ version: z.number().int().min(1) })

const flashDropCoreShape = {
  id: dealObjectIdSchema,
  dealId: dealObjectIdSchema,
  dealTitle: z.string(),
  outletId: dealObjectIdSchema,
  outletName: z.string(),
  flashPriceCents: z.number().int().positive(),
  usualPriceCents: z.number().int().positive().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  radiusMetres: z.number().int().positive(),
  codeLimit: z.number().int().positive(),
  claimedCount: z.number().int().nonnegative(),
  status: flashDropDisplayStatusSchema,
  reviewNote: z.string().nullable(),
  version: z.number().int().min(1),
  demo: z.boolean(),
}

export const merchantFlashDropSchema = z.strictObject(flashDropCoreShape)
export const merchantFlashDropsResponseSchema = z.strictObject({
  items: z.array(merchantFlashDropSchema).max(100),
})

// ----- Admin -----

export const flashDropViewSchema = z.enum(['review', 'scheduled', 'live', 'ended'])
export const adminFlashDropsQuerySchema = z.strictObject({
  view: flashDropViewSchema.default('review'),
})

// Checks worked out on the server so every reviewer sees the same facts. An overlap is a
// warning for the reviewer, not a refusal.
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
    review: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
    live: z.number().int().nonnegative(),
    ended: z.number().int().nonnegative(),
    claimedToday: z.number().int().nonnegative(),
  }),
})

export const adminFlashDropDecisionSchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'SEND_BACK', 'STOP']),
    note: z.string().trim().max(500),
    version: z.number().int().min(1),
  })
  .refine((value) => value.decision === 'APPROVE' || value.note.length > 0, {
    message: 'Add a note so the merchant knows why',
    path: ['note'],
  })

export type PublicFlashDrop = z.infer<typeof publicFlashDropSchema>
export type ActiveFlashDropsResponse = z.infer<typeof activeFlashDropsResponseSchema>
export type FlashCode = z.infer<typeof flashCodeSchema>
export type MerchantFlashDropBody = z.infer<typeof merchantFlashDropBodySchema>
export type MerchantFlashDrop = z.infer<typeof merchantFlashDropSchema>
export type FlashDropView = z.infer<typeof flashDropViewSchema>
export type FlashDropChecks = z.infer<typeof flashDropChecksSchema>
export type AdminFlashDrop = z.infer<typeof adminFlashDropSchema>
export type AdminFlashDropsResponse = z.infer<typeof adminFlashDropsResponseSchema>
export type AdminFlashDropDecision = z.infer<typeof adminFlashDropDecisionSchema>
