import { readTargetEnvelope, recoveryDto } from '@api/modules/ingestion/recovery'
import { captureEnvelope } from '@api/modules/ingestion/snapshot'
import { SOURCE_DEFINITIONS } from '@api/modules/ingestion/source'
import type { Database } from '@api/modules/platform-admin/transaction'
import { expect, it } from 'vitest'

const requestedAt = new Date('2020-01-01T00:00:00.000Z')
const recovery = (status: 'REQUESTED' | 'RUNNING' | 'SUCCEEDED') =>
  ({
    id: '0123456789abcdef01234567',
    actorId: '0123456789abcdef01234568',
    actorName: 'Synthetic operator',
    postId: '0123456789abcdef01234569',
    sourceId: '0123456789abcdef01234570',
    mode: 'REPROCESS_STORED',
    expectedUpdatedAt: requestedAt,
    expectedContentHash: 'a'.repeat(64),
    note: 'Synthetic evidence',
    status,
    targetOutcome: status === 'SUCCEEDED' ? 'RECOVERED' : 'UNKNOWN',
    runId: null,
    errorCode: null,
    requestedAt,
    finishedAt: status === 'SUCCEEDED' ? new Date(requestedAt.getTime() + 40_000) : null,
    ownerLeaseToken: null,
  }) satisfies Awaited<ReturnType<Database['ingestionRecovery']['findUniqueOrThrow']>>

it.each(['REQUESTED', 'RUNNING'] as const)(
  'projects abandoned %s read-only as interrupted/unknown without fabricating completion',
  (status) => {
    const row = recovery(status)
    const before = structuredClone(row)
    const result = recoveryDto(row)
    expect(result).toMatchObject({
      status: 'INTERRUPTED',
      targetOutcome: 'UNKNOWN',
      finishedAt: null,
    })
    expect(row).toEqual(before)
  },
)

it('preserves recorded successful completion even after the execution deadline', () => {
  const row = recovery('SUCCEEDED')
  expect(recoveryDto(row)).toMatchObject({
    status: 'SUCCEEDED',
    targetOutcome: 'RECOVERED',
    finishedAt: '2020-01-01T00:00:40.000Z',
  })
})

it.each(['REQUESTED', 'RUNNING'] as const)(
  'uses the existing exact 90-second boundary for %s, not the later 120-second source lease',
  (status) => {
    const row = recovery(status)
    expect(recoveryDto(row, new Date(requestedAt.getTime() + 89_999))).toMatchObject({
      status,
      targetOutcome: 'UNKNOWN',
      finishedAt: null,
    })
    expect(recoveryDto(row, new Date(requestedAt.getTime() + 90_000))).toMatchObject({
      status: 'INTERRUPTED',
      targetOutcome: 'UNKNOWN',
      finishedAt: null,
    })
  },
)

it('preserves literal Telegram post identity and source ownership without case-normalizing consent', () => {
  const source = SOURCE_DEFINITIONS.find((candidate) => candidate.kind === 'telegram')
  if (!source) throw new Error('Telegram source fixture missing')
  const input = {
    externalId: 'ThisCounted/42',
    url: 'https://t.me/ThisCounted/42',
    publishedAt: null,
    sourceUpdatedAt: null,
    title: 'Synthetic',
    contentHtml: '',
    excerptHtml: '',
    images: [],
  }
  const envelope = captureEnvelope(input, source)
  expect(readTargetEnvelope({ ...envelope, externalId: 'ThisCounted/42' }, source)).toEqual(input)
  expect(readTargetEnvelope({ ...envelope, externalId: 'thiscounted/42' }, source)).toBeNull()
  expect(readTargetEnvelope({ ...envelope, externalId: '42' }, source)).toBeNull()
  expect(readTargetEnvelope({ ...envelope, externalId: 'ThisCounted/43' }, source)).toBeNull()
  expect(
    readTargetEnvelope(
      { ...envelope, externalId: 'ThisCounted/42' },
      { ...source, externalId: 'AnotherChannel', url: 'https://t.me/s/AnotherChannel' },
    ),
  ).toBeNull()
})

it.each(['REQUESTED', 'RUNNING'] as const)(
  'projects %s with a durable lost, released, or expired owner without mutating recorded facts',
  (status) => {
    const row = { ...recovery(status), ownerLeaseToken: 'admitted-owner' }
    const now = new Date(requestedAt.getTime() + 10_000)
    const liveUntil = new Date(requestedAt.getTime() + 120_000)
    expect(
      recoveryDto(row, now, { leaseToken: 'admitted-owner', leaseExpiresAt: liveUntil }).status,
    ).toBe(status)
    const before = structuredClone(row)
    for (const owner of [
      null,
      { leaseToken: null, leaseExpiresAt: null },
      { leaseToken: 'successor-owner', leaseExpiresAt: liveUntil },
      { leaseToken: 'admitted-owner', leaseExpiresAt: now },
    ]) {
      expect(recoveryDto(row, now, owner)).toMatchObject({
        status: 'INTERRUPTED',
        targetOutcome: 'UNKNOWN',
        finishedAt: null,
      })
      expect(row).toEqual(before)
    }
    // A legacy attempt has no durable owner identity: do not invent one.
    expect(recoveryDto(recovery(status), now, null).status).toBe(status)
  },
)
