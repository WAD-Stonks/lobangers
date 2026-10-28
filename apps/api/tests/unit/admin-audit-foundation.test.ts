import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import { adminAuditDetailsSchema } from '@broke-oclock/contracts/admin-common'
import { expect, it } from 'vitest'

// Characterization of the frozen new helpers after their initial export/real-DB checks.
it('normalizes legacy zero and rejects invalid or overflowing counters', () => {
  for (const value of [null, undefined, 0]) expect(normalizeVersion(value)).toBe(0)
  expect(normalizeVersion(2_147_483_647)).toBe(2_147_483_647)
  for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])
    expect(() => normalizeVersion(value)).toThrow()
  for (const field of ['operationVersion', 'catalogueVersion', 'moderationVersion'] as const) {
    expect(legacyVersionWhere(field, 0)).toEqual({
      OR: [{ [field]: 0 }, { [field]: null }, { [field]: { isSet: false } }],
    })
    expect(legacyVersionWhere(field, 3)).toEqual({ OR: [{ [field]: 3 }] })
    for (const expected of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_647])
      expect(() => legacyVersionWhere(field, expected)).toThrow()
  }
})
it('allows only bounded flat audit facts and no payload, auth or arbitrary content fields', () => {
  expect(
    adminAuditDetailsSchema.safeParse({
      previousStatus: 'ACTIVE',
      newStatus: 'SUSPENDED',
      revokedSessionCount: 2,
    }).success,
  ).toBe(true)
  expect(
    adminAuditDetailsSchema.safeParse({
      mode: 'REFRESH_SOURCE_WINDOW',
      targetOutcome: 'NOT_OBSERVED',
      newStatus: 'PARTIAL',
    }).success,
  ).toBe(true)
  for (const input of [
    { password: 'synthetic' },
    { token: 'synthetic' },
    { rawContent: 'synthetic' },
    { changedFields: ['password'] },
    { changedFields: Array.from({ length: 41 }, () => 'title') },
    { evidenceIds: Array.from({ length: 21 }, () => '0123456789abcdef01234567') },
    { operationVersionBefore: -1 },
    { revokedSessionCount: -1 },
    { errorCode: 'raw private message' },
    { mode: 'IGNORE' },
    { payload: { anything: 'synthetic' } },
  ])
    expect(adminAuditDetailsSchema.safeParse(input).success, JSON.stringify(input)).toBe(false)
})
