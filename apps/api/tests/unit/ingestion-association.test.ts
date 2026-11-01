import {
  ingestionOutletAssociationParamsSchema,
  ingestionOutletAssociationRequestSchema,
} from '@broke-oclock/contracts/ingestion'
import { describe, expect, it } from 'vitest'

describe('association input boundary', () => {
  it('accepts only explicit existing outlet IDs and bounded versions', () => {
    const venueId = '0123456789abcdef01234567'
    expect(
      ingestionOutletAssociationRequestSchema.parse({ venueId, expectedContentVersion: 1 }),
    ).toEqual({ venueId, expectedContentVersion: 1, expectedOperationVersion: 0 })
    expect(
      ingestionOutletAssociationRequestSchema.parse({
        venueId,
        expectedContentVersion: 1,
        expectedOperationVersion: 7,
      }),
    ).toEqual({ venueId, expectedContentVersion: 1, expectedOperationVersion: 7 })
    for (const expectedOperationVersion of [-1, 1.5, 2_147_483_647, '1', null])
      expect(
        ingestionOutletAssociationRequestSchema.safeParse({
          venueId,
          expectedContentVersion: 1,
          expectedOperationVersion,
        }).success,
      ).toBe(false)
    for (const expectedContentVersion of [0, -1, 1.5, 2147483647, '1'])
      expect(
        ingestionOutletAssociationRequestSchema.safeParse({ venueId, expectedContentVersion })
          .success,
      ).toBe(false)
    expect(
      ingestionOutletAssociationRequestSchema.safeParse({
        venueId,
        expectedContentVersion: 1,
        merchantId: venueId,
      }).success,
    ).toBe(false)
    expect(
      ingestionOutletAssociationRequestSchema.safeParse({
        venueId: venueId.toUpperCase(),
        expectedContentVersion: 1,
      }).success,
    ).toBe(false)
    expect(
      ingestionOutletAssociationParamsSchema.safeParse({ dealId: venueId, actorId: venueId })
        .success,
    ).toBe(false)
  })
})
