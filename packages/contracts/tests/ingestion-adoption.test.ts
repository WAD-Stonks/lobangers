import { adminNoteSchema } from '@contracts/admin-common'
import {
  ingestionCategoryRequestSchema,
  ingestionCategoryResponseSchema,
  ingestionOutletAssociationRequestSchema,
  ingestionOutletAssociationResponseSchema,
  ingestionReviewRequestSchema,
  ingestionReviewResponseSchema,
} from '@contracts/ingestion'
import { expect, it } from 'vitest'

const id = '0123456789abcdef01234567'
it('preserves strict legacy-zero input compatibility and bounded explicit operation claims', () => {
  const cases = [
    [ingestionCategoryRequestSchema, { expectedContentVersion: 1, category: 'FOOD' }],
    [ingestionOutletAssociationRequestSchema, { expectedContentVersion: 1, venueId: id }],
    [
      ingestionReviewRequestSchema,
      { expectedContentVersion: 1, decision: 'REJECT', note: 'Legacy reason' },
    ],
  ] as const
  for (const [schema, input] of cases) {
    expect(schema.parse(input)).toMatchObject({ expectedOperationVersion: 0 })
    expect(schema.parse({ ...input, expectedOperationVersion: 2147483646 })).toMatchObject({
      expectedOperationVersion: 2147483646,
    })
    for (const claim of [-1, 0.5, 2147483647, null, '0', Number.NaN, Infinity])
      expect(schema.safeParse({ ...input, expectedOperationVersion: claim }).success).toBe(false)
    expect(schema.safeParse({ ...input, unexpected: true }).success).toBe(false)
  }
})
it('keeps the full legacy review note bound without expanding new/common note limits', () => {
  expect(
    ingestionReviewRequestSchema.safeParse({
      expectedContentVersion: 1,
      decision: 'REJECT',
      note: 'R'.repeat(1000),
    }).success,
  ).toBe(true)
  expect(
    ingestionReviewRequestSchema.safeParse({
      expectedContentVersion: 1,
      decision: 'REJECT',
      note: 'R'.repeat(1001),
    }).success,
  ).toBe(false)
  expect(adminNoteSchema.safeParse('R'.repeat(500)).success).toBe(true)
  expect(adminNoteSchema.safeParse('R'.repeat(501)).success).toBe(false)
})
it('accepts old response shapes and additive operationVersion fields', () => {
  const cases = [
    [
      ingestionCategoryResponseSchema,
      { id, contentVersion: 2, reviewStatus: 'PENDING', category: 'FOOD' },
    ],
    [ingestionReviewResponseSchema, { id, reviewStatus: 'REJECTED' }],
    [
      ingestionOutletAssociationResponseSchema,
      {
        id,
        contentVersion: 2,
        reviewStatus: 'PENDING',
        applicability: 'SELECTED_OUTLETS',
        merchantId: id,
        outlet: {
          id,
          name: 'Synthetic outlet',
          address: 'Synthetic address',
          merchantName: 'Synthetic merchant',
        },
      },
    ],
  ] as const
  for (const [schema, input] of cases) {
    expect(schema.parse(input)).toEqual(input)
    expect(schema.parse({ ...input, operationVersion: 1 })).toEqual({
      ...input,
      operationVersion: 1,
    })
  }
})
