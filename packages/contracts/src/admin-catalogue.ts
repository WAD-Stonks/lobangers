import {
  adminNoteSchema,
  adminObjectIdSchema,
  adminVersionSchema,
} from '@broke-oclock/contracts/admin-common'
import { z } from 'zod'

export const catalogueIdSchema = z.strictObject({ id: adminObjectIdSchema })
const text = (max: number) => z.string().trim().min(1).max(max)
export const catalogueUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !!url.hostname
      )
    } catch {
      return false
    }
  }, 'Use a credential-free HTTP(S) URL')
const pageFields = {
  limit: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^[1-9]\d{0,2}$/)
        .transform(Number),
    ])
    .pipe(z.number().int().min(1).max(100))
    .default(25),
  cursor: adminObjectIdSchema.optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  search: text(100).optional(),
}
export const catalogueMerchantsQuerySchema = z.strictObject(pageFields)
export const catalogueVenuesQuerySchema = z.strictObject({
  ...pageFields,
  merchantId: adminObjectIdSchema.optional(),
})
const confirmation = { note: adminNoteSchema, confirmed: z.literal(true) }
export const catalogueMutationSchema = z.strictObject({
  ...confirmation,
  expectedVersion: adminVersionSchema,
})
export const createCatalogueMerchantSchema = z.strictObject({ ...confirmation, name: text(160) })
export const patchCatalogueMerchantSchema = z.strictObject({
  ...confirmation,
  expectedVersion: adminVersionSchema,
  name: text(160),
})
const venueFields = {
  name: text(160),
  address: text(500),
  postalCode: z.string().regex(/^\d{6}$/),
  area: text(100),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  geographyPrecision: z.enum(['PROPERTY', 'OUTLET']),
  catalogueKey: text(250),
  imageUrl: catalogueUrlSchema.nullable().optional(),
}
export const createCatalogueVenueSchema = z
  .strictObject({
    ...confirmation,
    ...venueFields,
    merchantId: adminObjectIdSchema,
    expectedMerchantVersion: adminVersionSchema,
  })
  .refine(
    (value) => value.latitude !== 0 || value.longitude !== 0,
    'A resolved non-placeholder point is required',
  )
export const patchCatalogueVenueSchema = z
  .strictObject({
    ...confirmation,
    expectedVersion: adminVersionSchema,
    name: venueFields.name.optional(),
    address: venueFields.address.optional(),
    postalCode: venueFields.postalCode.optional(),
    area: venueFields.area.optional(),
    latitude: venueFields.latitude.optional(),
    longitude: venueFields.longitude.optional(),
    geographyPrecision: venueFields.geographyPrecision.optional(),
    catalogueKey: venueFields.catalogueKey.optional(),
    imageUrl: venueFields.imageUrl,
  })
  .refine((value) => Object.keys(value).some((key) => key in venueFields), 'Supply a correction')
export const catalogueEvidenceKindSchema = z.enum(['GEOGRAPHY', 'OCCUPANCY'])
export const recordCatalogueEvidenceSchema = z
  .strictObject({
    ...confirmation,
    expectedVersion: adminVersionSchema,
    kind: catalogueEvidenceKindSchema,
    sourceType: z.enum(['ONEMAP', 'OFFICIAL_MERCHANT', 'OFFICIAL_PROPERTY', 'ADMIN_VERIFIED']),
    reference: text(2048),
    sourceUrl: catalogueUrlSchema.optional(),
    observedAt: z.iso.datetime({ offset: true }).optional(),
    statement: text(4000),
    reviewedSource: z.literal(true),
  })
  .superRefine((value, ctx) => {
    if (
      value.sourceType === 'ONEMAP' &&
      (value.kind !== 'GEOGRAPHY' ||
        !value.sourceUrl ||
        !catalogueUrlSchema.safeParse(value.sourceUrl).success ||
        !/^(?:www\.)?onemap\.gov\.sg$/.test(new URL(value.sourceUrl).hostname))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'OneMap is geography-only and needs its reviewed source URL',
      })
  })
export const withdrawCatalogueEvidenceSchema = catalogueMutationSchema.extend({
  kind: catalogueEvidenceKindSchema,
})
export const catalogueMutationResponseSchema = z.strictObject({
  id: adminObjectIdSchema,
  version: adminVersionSchema,
})
const count = z.number().int().nonnegative()
export const catalogueMerchantSchema = z.strictObject({
  id: adminObjectIdSchema,
  name: z.string(),
  version: adminVersionSchema,
  archived: z.boolean(),
  venueCount: count,
  dealCount: count,
})
const receipt = z.strictObject({
  id: adminObjectIdSchema,
  kind: catalogueEvidenceKindSchema,
  subjectHash: z.string(),
  provider: z.string().nullable(),
  reference: z.string(),
  sourceUrl: z.string().nullable(),
  statement: z.string(),
  observedAt: z.string().nullable(),
  recordedAt: z.string(),
  catalogueVersion: adminVersionSchema.nullable(),
  actorName: z.string(),
})
export const catalogueVenueSchema = z.strictObject({
  id: adminObjectIdSchema,
  merchantId: adminObjectIdSchema,
  merchantName: z.string(),
  parentArchived: z.boolean(),
  name: z.string(),
  address: z.string(),
  postalCode: z.string().nullable(),
  area: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  imageUrl: z.string().nullable(),
  geographyPrecision: z.enum(['UNKNOWN', 'PROPERTY', 'OUTLET']).nullable(),
  catalogueKey: z.string().nullable(),
  version: adminVersionSchema,
  archived: z.boolean(),
  selectable: z.boolean(),
  geographyVerified: z.boolean(),
  occupancyVerified: z.boolean(),
  geographyState: z.string(),
  occupancyState: z.string(),
  dealCount: count,
  grantCount: count,
  requestCount: count,
})
export const catalogueVenueDetailSchema = catalogueVenueSchema.extend({
  evidence: z.array(receipt).max(100),
  evidenceTruncated: z.boolean(),
})
export const catalogueMerchantsResponseSchema = z.strictObject({
  items: z.array(catalogueMerchantSchema).max(100),
  nextCursor: adminObjectIdSchema.nullable(),
})
export const catalogueVenuesResponseSchema = z.strictObject({
  items: z.array(catalogueVenueSchema).max(100),
  nextCursor: adminObjectIdSchema.nullable(),
})
export type CatalogueMerchant = z.infer<typeof catalogueMerchantSchema>
export type CatalogueVenue = z.infer<typeof catalogueVenueSchema>
export type CatalogueVenueDetail = z.infer<typeof catalogueVenueDetailSchema>
