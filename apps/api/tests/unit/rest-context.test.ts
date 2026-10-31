import type { AppConfig } from '@api/config'
import { createRestContext } from '@api/rest/context'
import type { Auth } from '@broke-oclock/auth/types'
import { db } from '@broke-oclock/db'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.restoreAllMocks())

it('resolves the session from each request cookie instead of retaining identity', async () => {
  const firstId = '000000000000000000000001'
  const secondId = '000000000000000000000002'
  const firstSession = '000000000000000000000011'
  const secondSession = '000000000000000000000012'
  const now = new Date()
  vi.spyOn(db.user, 'findUnique')
    .mockResolvedValueOnce({
      id: firstId,
      name: 'Synthetic context user',
      email: 'context@example.test',
      emailVerified: false,
      role: 'USER',
      authVersion: null,
      suspendedAt: null,
      updatedAt: now,
    } as never)
    .mockResolvedValueOnce({
      id: secondId,
      name: 'Synthetic context user',
      email: 'context@example.test',
      emailVerified: false,
      role: 'USER',
      authVersion: null,
      suspendedAt: null,
      updatedAt: now,
    } as never)
  vi.spyOn(db.session, 'findUnique')
    .mockResolvedValueOnce({
      id: firstSession,
      userId: firstId,
      authVersion: null,
      loginAt: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    } as never)
    .mockResolvedValueOnce({
      id: secondSession,
      userId: secondId,
      authVersion: null,
      loginAt: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    } as never)
  const auth = {
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        const cookie = headers.get('cookie') ?? ''
        return cookie.includes('first=')
          ? ({ user: { id: firstId }, session: { id: firstSession } } as never)
          : cookie.includes('second=')
            ? ({ user: { id: secondId }, session: { id: secondSession } } as never)
            : null
      }),
    },
  } as unknown as Auth
  const config = { webOrigin: 'https://app.example' } as AppConfig
  const request = (cookie: string) =>
    ({
      headers: { cookie },
      get: (name: string) => (name === 'origin' ? config.webOrigin : undefined),
    }) as never

  const first = await createRestContext(request('first=one'), config, auth)
  const second = await createRestContext(request('second=two'), config, auth)

  expect(first.session?.user.id).toBe(firstId)
  expect(second.session?.user.id).toBe(secondId)
  expect(auth.api.getSession).toHaveBeenCalledTimes(2)
})
