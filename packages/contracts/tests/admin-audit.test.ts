import {
  platformAuditEntrySchema,
  platformAuditQuerySchema,
  platformAuditResponseSchema,
} from '@contracts/platform-admin'
import { describe, expect, it } from 'vitest'

const id = '0123456789abcdef01234567'
describe('admin audit investigation contract', () => {
  it('bounds an audit response to the maximum page size', () => {
    const row = {
      id,
      actorId: id,
      actorName: 'Synthetic',
      action: 'ROLE_CHANGED',
      targetUserId: id,
      venueId: null,
      note: 'Reason',
      roleBefore: null,
      roleAfter: null,
      createdAt: '2026-01-01T00:00:00Z',
    }
    expect(
      platformAuditResponseSchema.safeParse({
        items: Array.from({ length: 100 }, () => row),
        nextCursor: null,
      }).success,
    ).toBe(true)
    expect(
      platformAuditResponseSchema.safeParse({
        items: Array.from({ length: 101 }, () => row),
        nextCursor: null,
      }).success,
    ).toBe(false)
  })
  it('accepts bounded actor, action, UTC interval and resource filters together', () => {
    const query = {
      actorId: id,
      action: 'DEAL_UPDATED',
      subjectType: 'DEAL',
      subjectId: id,
      from: '2026-01-01T00:00:00Z',
      until: '2026-04-01T00:00:00Z',
      limit: '100',
      cursor: id,
    }
    expect(platformAuditQuerySchema.safeParse(query).success).toBe(true)
  })
  it('rejects partial, reversed, oversized or non-UTC intervals and non-scalar or unknown filters', () => {
    for (const query of [
      { from: '2026-01-01T00:00:00Z' },
      { until: '2026-01-02T00:00:00Z' },
      { from: '2026-01-02T00:00:00Z', until: '2026-01-01T00:00:00Z' },
      { from: '2026-01-01T00:00:00Z', until: '2026-04-02T00:00:00Z' },
      { from: '2026-01-01T00:00:00+08:00', until: '2026-01-02T00:00:00+08:00' },
      { actorId: [id] },
      { action: ['DEAL_UPDATED'] },
      { action: 'UNKNOWN' },
      { subjectType: 'ACCOUNT' },
      { subjectId: 'bad' },
      { subjectId: id },
      { unknown: true },
      { limit: '101' },
      { cursor: 'bad' },
    ])
      expect(platformAuditQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false)
  })
  it('preserves legacy account rows and accepts nullable resource rows with bounded details', () => {
    const legacy = {
      id,
      actorId: id,
      actorName: 'Operator',
      action: 'ROLE_CHANGED',
      targetUserId: id,
      venueId: null,
      note: 'Reason',
      roleBefore: 'USER',
      roleAfter: 'ADMIN',
      createdAt: '2026-01-01T00:00:00Z',
    }
    expect(platformAuditEntrySchema.safeParse(legacy).success).toBe(true)
    expect(
      platformAuditEntrySchema.safeParse({
        ...legacy,
        action: 'DEAL_UPDATED',
        targetUserId: null,
        roleBefore: null,
        roleAfter: null,
        subjectType: 'DEAL',
        subjectId: id,
        detailsJson: {
          operationVersionBefore: 0,
          operationVersionAfter: 1,
          changedFields: ['title'],
        },
      }).success,
    ).toBe(true)
  })
})
