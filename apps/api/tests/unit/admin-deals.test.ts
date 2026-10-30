import { safeAdminLink } from '@api/modules/deals/admin-detail'
import { publicationState } from '@api/modules/deals/admin-read'
import {
  adminDealContentRequestSchema,
  adminDealScopeEvidenceRequestSchema,
} from '@broke-oclock/contracts/admin-deals'
import { expect, it } from 'vitest'

it('characterizes safe text-link handling without truncation or execution', () => {
  expect(safeAdminLink('javascript:alert(1)')).toBeNull()
  expect(safeAdminLink('https://user:password@example.test')).toBeNull()
  const link = `https://example.test/${'a'.repeat(1200)}`
  expect(safeAdminLink(link)).toBe(link)
})
it('characterizes expired versus hidden/unpublished/deleted independently', () => {
  const row = {
    deletedAt: null,
    reviewStatus: 'APPROVED',
    publishedAt: new Date('2026-01-01'),
    validUntil: new Date('2026-02-01'),
  }
  expect(publicationState(row, new Date('2026-03-01'))).toBe('EXPIRED')
  expect(publicationState({ ...row, reviewStatus: 'HIDDEN' })).toBe('HIDDEN')
  expect(publicationState({ ...row, validUntil: null, publishedAt: null })).toBe('UNPUBLISHED')
  expect(publicationState({ ...row, deletedAt: new Date() })).toBe('DELETED')
})
it('characterizes exact allowlisted correction and explicit staff evidence envelopes', () => {
  const base = { expectedContentVersion: 1, expectedOperationVersion: 0, note: 'Reviewed evidence' }
  expect(
    adminDealContentRequestSchema.safeParse({
      ...base,
      changes: { title: '<b>Plain text</b>', priceMinor: 0, currency: 'SGD' },
    }).success,
  ).toBe(true)
  expect(
    adminDealContentRequestSchema.safeParse({
      ...base,
      changes: { imageUrl: 'https://example.test/a' },
    }).success,
  ).toBe(false)
  expect(
    adminDealScopeEvidenceRequestSchema.safeParse({
      ...base,
      reference: 'campaign-reference',
      statement: 'Actual staff reviewed reference',
      staffConfirmed: false,
    }).success,
  ).toBe(false)
})
