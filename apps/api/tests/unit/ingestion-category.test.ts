import {
  ingestionCategoryParamsSchema,
  ingestionCategoryRequestSchema,
  ingestionCategoryResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import { describe, expect, it } from 'vitest'

describe('category correction input boundary', () => {
  const dealId = '0123456789abcdef01234567'

  it('accepts only known categories and bounded versions', () => {
    expect(
      ingestionCategoryRequestSchema.parse({ category: 'DRINKS', expectedContentVersion: 1 }),
    ).toEqual({ category: 'DRINKS', expectedContentVersion: 1 })
    for (const input of [
      { category: 'MYSTERY', expectedContentVersion: 1 },
      { category: 'drinks', expectedContentVersion: 1 },
      { category: 'FOOD', expectedContentVersion: 0 },
      { category: 'FOOD', expectedContentVersion: 2_147_483_647 },
      { category: 'FOOD', expectedContentVersion: 1, venueId: dealId },
    ])
      expect(ingestionCategoryRequestSchema.safeParse(input).success).toBe(false)
    expect(ingestionCategoryParamsSchema.safeParse({ dealId, extra: true }).success).toBe(false)
  })

  it('only ever reports a pending draft with a known category', () => {
    expect(
      ingestionCategoryResponseSchema.safeParse({
        id: dealId,
        contentVersion: 2,
        reviewStatus: 'APPROVED',
        category: 'FOOD',
      }).success,
    ).toBe(false)
  })
})
