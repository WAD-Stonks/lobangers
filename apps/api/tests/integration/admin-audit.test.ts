import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { createApiClient } from '@broke-oclock/api-client'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
const subjectId = '0123456789abcdef01234567'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let scratch: string | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
const signup = async () => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic audit operator',
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return {
    id: String(body.user.id),
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  }
}
const clientFor = (cookie = '') => {
  const client = createApiClient(`${baseURL}/api`)
  client.http.defaults.headers.common.Cookie = cookie
  return client
}
beforeAll(async () => {
  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL !== 'mongodb://127.0.0.1:1/platform_admin_validation_only'
  )
    throw new Error('Refusing ambient database configuration in disposable audit suite')
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const url = mongo.getUri(`audit_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('NODE_ENV', 'test')
  scratch = await mkdtemp(join(tmpdir(), 'admin-audit-schema-'))
  const schema = join(scratch, 'schema.prisma')
  await copyFile(join(root, 'packages/db/prisma/schema.prisma'), schema)
  await promisify(execFile)(
    join(root, 'packages/db/node_modules/.bin/prisma'),
    ['db', 'push', '--schema', schema, '--skip-generate'],
    { cwd: scratch, env: { ...process.env, DATABASE_URL: url }, timeout: 60_000 },
  )
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test HTTP listener')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: url,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
      }),
    ),
  )
  admin = await signup()
  member = await signup()
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  if (scratch) await rm(scratch, { recursive: true })
  vi.unstubAllEnvs()
})
it('persists optional legacy-zero counters and prospective imported snapshots without altering proof defaults', async () => {
  const merchant = await db.merchant.create({ data: { name: 'Synthetic audit merchant' } })
  expect(merchant).toHaveProperty('catalogueVersion', null)
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Synthetic venue',
      address: 'Synthetic address',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  expect(venue).toHaveProperty('catalogueVersion', null)
  expect(venue.geographyEvidence).toBeNull()
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic deal',
      description: '',
      category: 'other',
      offerType: 'OTHER',
      applicability: 'ONLINE',
    },
  })
  expect(deal).toHaveProperty('operationVersion', null)
  const comment = await db.comment.create({
    data: { dealId: deal.id, authorId: member.id, body: 'Synthetic comment' },
  })
  expect(comment).toHaveProperty('moderationVersion', null)
  const report = await db.dealReport.create({
    data: { dealId: deal.id, reporterId: member.id, reason: 'OTHER' },
  })
  const commentReport = await db.commentReport.create({
    data: { commentId: comment.id, reporterId: member.id, reason: 'OTHER' },
  })
  expect(report).toHaveProperty('moderationVersion', null)
  expect(commentReport).toHaveProperty('moderationVersion', null)
  const source = await db.importSource.create({
    data: {
      provider: 'WORDPRESS',
      externalId: randomUUID(),
      name: 'Synthetic source',
      url: 'https://example.test',
    },
  })
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: '1',
      url: 'https://example.test/1',
      rawContent: '',
      contentHash: 'a'.repeat(64),
    },
  })
  for (const field of [
    'latestSnapshot',
    'latestSnapshotHash',
    'snapshotFormat',
    'failureStage',
    'lastRunId',
  ])
    expect(post).toHaveProperty(field, null)
})
it('retains append-only evidence and explicit recovery lifecycle without source activation', async () => {
  const source = await db.importSource.create({
    data: {
      provider: 'WORDPRESS',
      externalId: randomUUID(),
      name: 'Synthetic evidence source',
      url: 'https://example.test',
    },
  })
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: 'recovery',
      url: 'https://example.test/recovery',
      rawContent: 'Synthetic source text',
      contentHash: 'b'.repeat(64),
      latestSnapshot: { format: 'synthetic-v1', rawContent: 'Synthetic source text' },
      latestSnapshotHash: 'c'.repeat(64),
      snapshotFormat: 'synthetic-v1',
      failureStage: 'PARSE',
      lastRunId: subjectId,
    },
  })
  const evidence = await db.adminEvidence.create({
    data: {
      actorId: admin.id,
      actorName: 'Synthetic evidence actor',
      subjectType: 'DEAL',
      subjectId,
      kind: 'SCOPE',
      contentVersion: 1,
      subjectHash: 'd'.repeat(64),
      basis: 'SOURCE_NONSPATIAL',
      reference: 'synthetic-reference',
      statement: 'Synthetic review evidence',
      sourceContentHash: post.contentHash,
      sourceUrl: post.url,
      citationId: subjectId,
    },
  })
  expect(await db.adminEvidence.findUnique({ where: { id: evidence.id } })).toMatchObject({
    kind: 'SCOPE',
    basis: 'SOURCE_NONSPATIAL',
    recordedAt: expect.any(Date),
    catalogueVersion: null,
    observedAt: null,
  })
  const recovery = await db.ingestionRecovery.create({
    data: {
      actorId: admin.id,
      actorName: 'Synthetic recovery actor',
      postId: post.id,
      sourceId: source.id,
      mode: 'REPROCESS_STORED',
      expectedUpdatedAt: post.updatedAt,
      expectedContentHash: post.contentHash,
      note: 'Synthetic recovery note',
      targetOutcome: 'UNKNOWN',
    },
  })
  expect(recovery).toMatchObject({
    status: 'REQUESTED',
    runId: null,
    errorCode: null,
    finishedAt: null,
  })
  await db.ingestionRecovery.update({
    where: { id: recovery.id },
    data: { status: 'PARTIAL', targetOutcome: 'STILL_FAILED', finishedAt: new Date() },
  })
  expect(await db.ingestionRecovery.findUnique({ where: { id: recovery.id } })).toMatchObject({
    status: 'PARTIAL',
    targetOutcome: 'STILL_FAILED',
    finishedAt: expect.any(Date),
  })
  expect((await db.importSource.findUniqueOrThrow({ where: { id: source.id } })).enabled).toBe(
    false,
  )
  expect(
    (await db.importedPost.findUniqueOrThrow({ where: { id: post.id } })).latestSnapshot,
  ).toEqual(post.latestSnapshot)
})
it('claims missing, null and zero admin counters once and rolls back the claim with caller transaction', async () => {
  const helpers = await import('@api/modules/platform-admin/operation-version').catch(() => null)
  expect(helpers, 'Admin CAS helper must be exported').not.toBeNull()
  if (!helpers) return
  const { legacyVersionWhere } = helpers
  const claim = async (expectedVersion: number, id: string) =>
    db.$transaction((tx) =>
      tx.merchant.updateMany({
        where: { id, ...legacyVersionWhere('catalogueVersion', expectedVersion) },
        data: { catalogueVersion: expectedVersion + 1 },
      }),
    )
  for (const stored of ['missing', null, 0] as const) {
    const row = await db.merchant.create({ data: { name: 'Synthetic CAS' } })
    if (stored !== 'missing')
      await db.merchant.update({ where: { id: row.id }, data: { catalogueVersion: stored } })
    expect((await claim(0, row.id)).count).toBe(1)
    expect((await claim(0, row.id)).count).toBe(0)
    expect((await db.merchant.findUniqueOrThrow({ where: { id: row.id } })).catalogueVersion).toBe(
      1,
    )
    await expect(
      db.$transaction(async (tx) => {
        await tx.merchant.updateMany({
          where: { id: row.id, ...legacyVersionWhere('catalogueVersion', 1) },
          data: { catalogueVersion: 2 },
        })
        throw new Error('Synthetic rollback')
      }),
    ).rejects.toThrow('Synthetic rollback')
    expect((await db.merchant.findUniqueOrThrow({ where: { id: row.id } })).catalogueVersion).toBe(
      1,
    )
  }
})
it('allows at most one concurrent legacy-zero CAS claimant and applies typed predicates to deal and moderation counters', async () => {
  const { legacyVersionWhere } = await import('@api/modules/platform-admin/operation-version')
  const merchant = await db.merchant.create({ data: { name: 'Synthetic concurrent CAS' } })
  const outcomes = await Promise.allSettled(
    [0, 1].map(() =>
      db.$transaction((tx) =>
        tx.merchant.updateMany({
          where: { id: merchant.id, ...legacyVersionWhere('catalogueVersion', 0) },
          data: { catalogueVersion: 1 },
        }),
      ),
    ),
  )
  expect(
    outcomes.reduce(
      (count, outcome) => count + (outcome.status === 'fulfilled' ? outcome.value.count : 0),
      0,
    ),
  ).toBe(1)
  for (const outcome of outcomes)
    if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ code: 'P2034' })
  expect(
    (await db.merchant.findUniqueOrThrow({ where: { id: merchant.id } })).catalogueVersion,
  ).toBe(1)
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic CAS deal',
      description: '',
      category: 'other',
      offerType: 'OTHER',
      applicability: 'ONLINE',
    },
  })
  const comment = await db.comment.create({
    data: { dealId: deal.id, authorId: member.id, body: 'Synthetic CAS comment' },
  })
  const result = await db.$transaction(async (tx) => {
    const dealClaim = await tx.deal.updateMany({
      where: { id: deal.id, ...legacyVersionWhere('operationVersion', 0) },
      data: { operationVersion: 1 },
    })
    const commentClaim = await tx.comment.updateMany({
      where: { id: comment.id, ...legacyVersionWhere('moderationVersion', 0) },
      data: { moderationVersion: 1 },
    })
    return [dealClaim.count, commentClaim.count]
  })
  expect(result).toEqual([1, 1])
})
it('appends allowlisted typed audit in caller transaction, rejects secrets and rolls back atomically', async () => {
  const helpers = await import('@api/modules/platform-admin/audit').catch(() => null)
  expect(helpers, 'Typed transactional audit helper must be exported').not.toBeNull()
  if (!helpers) return
  const { appendAdminAudit } = helpers
  const actor = { id: admin.id, name: 'Synthetic audit operator' }
  const input = {
    action: 'DEAL_UPDATED' as const,
    subjectType: 'DEAL' as const,
    subjectId,
    note: 'Synthetic reason',
    details: {
      operationVersionBefore: 0,
      operationVersionAfter: 1,
      changedFields: ['title' as const],
    },
  }
  await db.$transaction((tx) => appendAdminAudit(tx, actor, input))
  expect(await db.platformAudit.findFirst({ where: { subjectId } })).toMatchObject({
    actorId: actor.id,
    actorName: actor.name,
    targetUserId: null,
    subjectType: 'DEAL',
    subjectId,
    detailsJson: input.details,
  })
  const count = await db.platformAudit.count()
  await expect(
    db.$transaction(async (tx) => {
      await appendAdminAudit(tx, actor, input)
      throw new Error('Synthetic audit rollback')
    }),
  ).rejects.toThrow('Synthetic audit rollback')
  expect(await db.platformAudit.count()).toBe(count)
  await expect(
    db.$transaction((tx) =>
      appendAdminAudit(tx, actor, { ...input, details: JSON.parse('{"password":"secret"}') }),
    ),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  expect(await db.platformAudit.count()).toBe(count)
})
it('preserves explicit nullable account targets and records absent details as null', async () => {
  const { appendAdminAudit } = await import('@api/modules/platform-admin/audit')
  await db.$transaction((tx) =>
    appendAdminAudit(
      tx,
      { id: admin.id, name: 'Synthetic nullable actor' },
      {
        action: 'ACCOUNT_REINSTATED',
        subjectType: 'USER',
        subjectId: member.id,
        targetUserId: null,
        note: 'Synthetic explicit nullable target',
      },
    ),
  )
  expect(
    await db.platformAudit.findFirst({ where: { note: 'Synthetic explicit nullable target' } }),
  ).toMatchObject({
    subjectType: 'USER',
    subjectId: member.id,
    targetUserId: null,
    detailsJson: null,
    venueId: null,
  })
})
it('projects nullable resource rows and safe bounded details while omitting untrusted persisted detail keys', async () => {
  const subjectId = '0123456789abcdef01234568'
  const row = await db.platformAudit.create({
    data: {
      actorId: admin.id,
      actorName: 'Synthetic resource actor',
      action: 'DEAL_UPDATED',
      subjectType: 'DEAL',
      subjectId,
      targetUserId: null,
      note: 'Synthetic resource edit',
      detailsJson: { operationVersionBefore: 0, operationVersionAfter: 1 },
    },
  })
  const page = await clientFor(admin.cookie).platformAdmin.audit({
    subjectType: 'DEAL',
    subjectId,
    action: 'DEAL_UPDATED',
  })
  expect(page.items.map((entry) => entry.id)).toEqual([row.id])
  expect(page.items[0]).toMatchObject({
    targetUserId: null,
    subjectType: 'DEAL',
    subjectId,
    detailsJson: { operationVersionBefore: 0, operationVersionAfter: 1 },
  })
  await db.platformAudit.update({
    where: { id: row.id },
    data: { detailsJson: { token: 'synthetic forbidden persisted payload' } },
  })
  const sanitized = await clientFor(admin.cookie).platformAdmin.audit({
    subjectType: 'DEAL',
    subjectId,
  })
  expect(sanitized.items.find((entry) => entry.id === row.id)?.detailsJson).toBeNull()
  expect(JSON.stringify(sanitized)).not.toContain('synthetic forbidden persisted payload')
})
it('keeps historical account audit searchable by USER subject filters without backfilling rows', async () => {
  const legacy = await db.platformAudit.create({
    data: {
      actorId: admin.id,
      actorName: 'Synthetic historical actor',
      action: 'ROLE_CHANGED',
      targetUserId: member.id,
      note: 'Synthetic legacy account change',
    },
  })
  const result = await clientFor(admin.cookie).platformAdmin.audit({
    subjectType: 'USER',
    subjectId: member.id,
  })
  expect(result.items.map((entry) => entry.id)).toContain(legacy.id)
  expect(await db.platformAudit.findUnique({ where: { id: legacy.id } })).toMatchObject({
    subjectType: null,
    subjectId: null,
  })
})
it('filters real audit HTTP by actor, action, inclusive start and exclusive end through exported client without write fences', async () => {
  await db.platformAudit.deleteMany()
  const records = [
    { id: '100000000000000000000001', actorId: admin.id, createdAt: '2026-01-01T00:00:00Z' },
    { id: '100000000000000000000002', actorId: admin.id, createdAt: '2026-01-02T00:00:00Z' },
    { id: '100000000000000000000003', actorId: member.id, createdAt: '2026-01-01T12:00:00Z' },
  ]
  for (const row of records)
    await db.platformAudit.create({
      data: {
        ...row,
        actorName: 'Synthetic audit',
        action: 'ROLE_CHANGED',
        targetUserId: member.id,
        note: 'Synthetic reason',
      },
    })
  const before = await db.platformAccessFence.findMany()
  const result = await clientFor(admin.cookie).platformAdmin.audit({
    actorId: admin.id,
    action: 'ROLE_CHANGED',
    from: '2026-01-01T00:00:00Z',
    until: '2026-01-02T00:00:00Z',
  })
  expect(result.items.map((row) => row.id)).toEqual([records[0]?.id])
  expect(await db.platformAccessFence.findMany()).toEqual(before)
})
it('enforces fresh access and strict scalar HTTP filters while retaining bounded legacy cursors', async () => {
  const request = (query: string, cookie = admin.cookie) =>
    fetch(`${baseURL}/api/admin/audit${query}`, { headers: cookie ? { Cookie: cookie } : {} })
  expect((await request('?unknown=true', '')).status).toBe(401)
  expect((await request('?unknown=true', member.cookie)).status).toBe(403)
  for (const query of [
    '?unknown=true',
    `?actorId=${admin.id}&actorId=${admin.id}`,
    '?action[]=ROLE_CHANGED',
    '?from=2026-01-01T00%3A00%3A00Z',
    '?limit=101',
    '?cursor=bad',
    '?subjectType=TOKEN',
    '?from=2026-01-01T00%3A00%3A00Z&until=2026-04-02T00%3A00%3A00Z',
  ])
    expect((await request(query)).status, query).toBe(400)
  const first = await clientFor(admin.cookie).platformAdmin.audit({ userId: member.id, limit: '1' })
  expect(first.items).toHaveLength(1)
  expect(first.nextCursor).toBe(first.items[0]?.id)
  const second = await clientFor(admin.cookie).platformAdmin.audit({
    userId: member.id,
    limit: '1',
    cursor: first.nextCursor ?? undefined,
  })
  expect(second.items).toHaveLength(1)
  expect(second.items[0]?.id).not.toBe(first.items[0]?.id)
  const before = await Promise.all([
    db.platformAccessFence.findMany(),
    db.platformAudit.findMany(),
    db.user.findMany(),
    db.session.findMany(),
  ])
  const read = await request('')
  expect(read.status).toBe(200)
  expect(read.headers.get('cache-control')).toBe('no-store')
  expect(
    await Promise.all([
      db.platformAccessFence.findMany(),
      db.platformAudit.findMany(),
      db.user.findMany(),
      db.session.findMany(),
    ]),
  ).toEqual(before)
  await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
  expect((await request('')).status).toBe(403)
})
