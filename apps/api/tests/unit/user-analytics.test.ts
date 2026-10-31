import { createServer, type Server } from 'node:http'
import { apiErrorMiddleware } from '@api/errors'
import { readUserAnalytics, registrationWeeks } from '@api/modules/platform-admin/user-analytics'
import type { RestDependencies } from '@api/rest/context'
import { createPlatformAdminRouter } from '@api/rest/routers/platform-admin'
import { createApiClient } from '@broke-oclock/api-client'
import express from 'express'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Synthetic database/native identity boundaries; HTTP authorization is real router code.
const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  native: vi.fn(),
}))
vi.mock('@broke-oclock/db', () => ({
  db: {
    user: { count: mocks.count, findUnique: mocks.user },
    session: { findUnique: mocks.session },
  },
}))

import { db } from '@broke-oclock/db'

const now = new Date('2026-10-31T04:00:00.000Z')
const id = '0123456789abcdef01234567'
const sessionId = '1123456789abcdef01234567'
let server: Server | undefined
beforeEach(() => {
  vi.resetAllMocks()
  mocks.count.mockResolvedValue(0)
  mocks.user.mockResolvedValue({
    id,
    name: 'Synthetic admin',
    email: 'admin@example.test',
    role: 'ADMIN',
    emailVerified: true,
    authVersion: 0,
    platformVersion: 0,
    suspendedAt: null,
  })
  mocks.session.mockResolvedValue({
    id: sessionId,
    userId: id,
    expiresAt: new Date('2100-01-01'),
    createdAt: now,
    updatedAt: now,
    authVersion: 0,
  })
  mocks.native.mockResolvedValue({
    user: { id, role: 'ADMIN' },
    session: { id: sessionId, userId: id },
  })
})
afterEach(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

it('counts half-open Singapore weeks, fills empty weeks and excludes future registrations', async () => {
  const dates = [
    '2026-08-01T00:00:00Z',
    '2026-09-06T15:59:59.999Z',
    '2026-09-06T16:00:00Z',
    '2026-10-25T15:59:59.999Z',
    '2026-10-25T16:00:00Z',
    '2026-10-31T03:59:59.999Z',
    '2026-10-31T04:00:00Z',
    '2026-11-01T00:00:00Z',
  ].map((value) => new Date(value))
  mocks.count.mockImplementation(
    async ({ where }) =>
      dates.filter(
        (date) =>
          date < where.createdAt.lt && (!where.createdAt.gte || date >= where.createdAt.gte),
      ).length,
  )
  const result = await readUserAnalytics(db, now)
  expect(result.totalUsers).toBe(6)
  expect(result.newUsersThisWeek).toBe(2)
  expect(result.weeks.map((week) => week.newUsers)).toEqual([1, 0, 0, 0, 0, 0, 1, 2])
  expect(result.weeks[0]?.weekStart).toBe('2026-09-06T16:00:00.000Z')
  expect(result.weeks[7]).toEqual({
    weekStart: '2026-10-25T16:00:00.000Z',
    weekEnd: '2026-11-01T16:00:00.000Z',
    newUsers: 2,
  })
  expect(mocks.count).toHaveBeenCalledTimes(9)
  expect(mocks.count).toHaveBeenLastCalledWith({
    where: { createdAt: { gte: new Date('2026-10-25T16:00:00Z'), lt: now } },
  })
  expect(Object.keys(result).sort()).toEqual([
    'generatedAt',
    'newUsersThisWeek',
    'timeZone',
    'totalUsers',
    'weeks',
  ])
})
it('rolls into Monday at exactly 16:00 UTC Sunday, including across year boundaries', () => {
  expect(registrationWeeks(new Date('2026-10-25T15:59:59.999Z'))[7]?.start.toISOString()).toBe(
    '2026-10-18T16:00:00.000Z',
  )
  expect(registrationWeeks(new Date('2026-10-25T16:00:00Z'))[7]?.start.toISOString()).toBe(
    '2026-10-25T16:00:00.000Z',
  )
  expect(registrationWeeks(new Date('2027-01-03T16:00:00Z'))[7]?.start.toISOString()).toBe(
    '2027-01-03T16:00:00.000Z',
  )
})

const start = async () => {
  const app = express()
  app.use(
    '/api',
    createPlatformAdminRouter({
      auth: { api: { getSession: mocks.native } },
      ingestion: { now: () => now },
    } as unknown as RestDependencies),
  )
  app.use(apiErrorMiddleware)
  server = createServer(app)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing loopback listener')
  return `http://127.0.0.1:${address.port}/api/admin/analytics/users`
}
it('serves only counts to a current admin and preserves read-only native session lookup for GET and HEAD', async () => {
  const url = await start()
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const body = await response.json()
  expect(body.totalUsers).toBe(0)
  expect(body.weeks).toHaveLength(8)
  expect(body.weeks.every((week: { newUsers: number }) => week.newUsers === 0)).toBe(true)
  expect(JSON.stringify(body)).not.toContain('admin@example.test')
  const client = createApiClient(url.replace('/admin/analytics/users', ''))
  expect(await client.platformAdmin.userAnalytics()).toEqual(body)
  expect((await fetch(url, { method: 'HEAD' })).status).toBe(200)
  expect(mocks.native).toHaveBeenLastCalledWith(
    expect.objectContaining({ query: { disableRefresh: true } }),
  )
})
it.each(['anonymous', 'demoted', 'revoked', 'suspended'])(
  'denies %s access before any aggregate counts',
  async (state) => {
    if (state === 'anonymous') mocks.native.mockResolvedValue(null)
    if (state === 'demoted') mocks.user.mockResolvedValue({ id, role: 'USER', authVersion: 0 })
    if (state === 'revoked') mocks.session.mockResolvedValue(null)
    if (state === 'suspended')
      mocks.user.mockResolvedValue({ id, role: 'ADMIN', authVersion: 0, suspendedAt: now })
    const response = await fetch(await start())
    expect(response.status).toBe(state === 'demoted' ? 403 : 401)
    expect(mocks.count).not.toHaveBeenCalled()
  },
)
it('rejects unexpected queries and unsupported methods without reading registration counts', async () => {
  const url = await start()
  expect((await fetch(`${url}?email=private@example.test`)).status).toBe(400)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await fetch(url, { method })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  }
  expect(mocks.count).not.toHaveBeenCalled()
})
