import {
  moderationReportsQuerySchema,
  moderationResolveSchema,
  moderationVisibilitySchema,
} from '@contracts/admin-moderation'
import { expect, it } from 'vitest'

it('bounds queue pagination and never permits an implicit mixed report collection', () => {
  expect(moderationReportsQuerySchema.safeParse({}).success).toBe(false)
  expect(moderationReportsQuerySchema.parse({ targetType: 'DEAL' })).toEqual({
    targetType: 'DEAL',
    status: 'OPEN',
    limit: 25,
  })
  for (const limit of ['1e2', '0', '51', '1.5'])
    expect(moderationReportsQuerySchema.safeParse({ targetType: 'DEAL', limit }).success).toBe(
      false,
    )
  expect(
    moderationReportsQuerySchema.safeParse({ targetType: 'DEAL', outletId: 'a'.repeat(24) })
      .success,
  ).toBe(false)
})
it('requires deliberate confirmed versioned trimmed decisions and prevents extra policy instructions', () => {
  const body = {
    expectedVersion: 0,
    decision: 'RESOLVED',
    resolution: '  Evidence checked  ',
    confirmed: true,
  }
  expect(moderationResolveSchema.parse(body).resolution).toBe('Evidence checked')
  for (const change of [
    { confirmed: false },
    { resolution: ' ' },
    { resolution: 'a'.repeat(501) },
    { expectedVersion: -1 },
    { hide: true },
  ])
    expect(moderationResolveSchema.safeParse({ ...body, ...change }).success).toBe(false)
  expect(
    moderationVisibilitySchema.safeParse({
      expectedVersion: 0,
      visibility: 'VISIBLE',
      note: 'Reason',
      confirmed: true,
      clearDeletedAt: true,
    }).success,
  ).toBe(false)
})
