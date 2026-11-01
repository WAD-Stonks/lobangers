import {
  catalogueMerchantsQuerySchema,
  createCatalogueVenueSchema,
  patchCatalogueVenueSchema,
  recordCatalogueEvidenceSchema,
} from '@broke-oclock/contracts/admin-catalogue'
import { expect, it } from 'vitest'

const confirmation = { expectedVersion: 0, note: 'Reviewed real source', confirmed: true }
const proof = {
  ...confirmation,
  kind: 'GEOGRAPHY',
  sourceType: 'ONEMAP',
  reference: 'Reviewed reference',
  statement: 'Reviewed exact tuple',
  reviewedSource: true,
}
it('rejects malformed OneMap URLs as validation, never throws an unhandled URL exception', () => {
  expect(
    recordCatalogueEvidenceSchema.safeParse({ ...proof, sourceUrl: 'not-a-url' }).success,
  ).toBe(false)
})
it('strictly bounds page queries and denies all client-controlled positive proof', () => {
  for (const value of [0, 101, 1.5, Infinity, [], [1], true, '1e1', ' 1 '])
    expect(catalogueMerchantsQuerySchema.safeParse({ limit: value }).success, String(value)).toBe(
      false,
    )
  for (const injected of [
    'provider',
    'verifiedAt',
    'subjectHash',
    'state',
    'geographyEvidence',
    'occupancyEvidence',
  ])
    expect(
      recordCatalogueEvidenceSchema.safeParse({
        ...proof,
        sourceUrl: 'https://www.onemap.gov.sg/',
        [injected]: 'injected',
      }).success,
    ).toBe(false)
})
it('requires resolved creation and immutable existing parent on patch', () => {
  expect(
    createCatalogueVenueSchema.safeParse({
      ...confirmation,
      name: 'Outlet',
      merchantId: '0123456789abcdef01234567',
      expectedMerchantVersion: 0,
      address: 'Resolved address',
      area: 'Area',
      postalCode: '123456',
      catalogueKey: 'real-key',
      geographyPrecision: 'OUTLET',
      latitude: 0,
      longitude: 0,
    }).success,
  ).toBe(false)
  expect(
    patchCatalogueVenueSchema.safeParse({
      ...confirmation,
      merchantId: '0123456789abcdef01234567',
      name: 'Correction',
    }).success,
  ).toBe(false)
})
