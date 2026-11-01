import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { parseConfig } from '@api/config'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

let server: Server
let base = ''
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'mongodb://127.0.0.1:1/admin_options_no_database')
  const { createApp } = await import('@api/app')
  server = createServer(
    createApp(
      parseConfig({
        DATABASE_URL: 'mongodb://127.0.0.1:1/admin_options_no_database',
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: 'http://localhost:3000',
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    ),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing loopback listener')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  vi.unstubAllEnvs()
})
const id = '0123456789abcdef01234567'
it.each([
  ['/admin/deals', 'GET'],
  [`/admin/deals/${id}`, 'GET'],
  [`/admin/deals/${id}/content`, 'PATCH'],
  [`/admin/deals/${id}/scope`, 'PATCH'],
  [`/admin/deals/${id}/review`, 'POST'],
  [`/admin/deals/${id}/scope-evidence`, 'POST'],
  [`/admin/deals/${id}/unpublish`, 'POST'],
  [`/admin/deals/${id}/reopen`, 'POST'],
  ['/admin/catalogue/merchants', 'GET, POST'],
  [`/admin/catalogue/merchants/${id}`, 'GET, PATCH'],
  [`/admin/catalogue/merchants/${id}/archive`, 'POST'],
  ['/admin/catalogue/venues', 'GET, POST'],
  [`/admin/catalogue/venues/${id}`, 'GET, PATCH'],
  [`/admin/catalogue/venues/${id}/archive`, 'POST'],
  [`/admin/catalogue/venues/${id}/evidence`, 'POST'],
  [`/admin/catalogue/venues/${id}/evidence/withdraw`, 'POST'],
  ['/admin/moderation/reports', 'GET'],
  [`/admin/moderation/reports/DEAL/${id}`, 'GET'],
  [`/admin/moderation/reports/DEAL/${id}/resolve`, 'POST'],
  ['/admin/moderation/comments', 'GET'],
  [`/admin/moderation/comments/${id}`, 'GET'],
  [`/admin/moderation/comments/${id}/visibility`, 'POST'],
  ['/admin/audit', 'GET'],
  ['/admin/security-context', 'GET, HEAD'],
  [`/admin/accounts/${id}/security`, 'GET, HEAD'],
  [`/admin/accounts/${id}/sessions`, 'GET, HEAD, DELETE'],
  [`/admin/accounts/${id}/sessions/${id}`, 'DELETE'],
  [`/admin/accounts/${id}/suspend`, 'POST'],
  [`/admin/accounts/${id}/reinstate`, 'POST'],
  [`/ingestion/drafts/${id}/evidence`, 'GET'],
  [`/ingestion/drafts/${id}/evidence/${id}`, 'GET'],
  ['/ingestion/posts', 'GET'],
  [`/ingestion/posts/${id}`, 'GET'],
  [`/ingestion/posts/${id}/recoveries`, 'POST'],
  [`/ingestion/recoveries/${id}`, 'GET'],
])('keeps exact OPTIONS method denial before CORS for %s', async (path, allow) => {
  const response = await fetch(`${base}/api${path}`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
  })
  expect(response.status).toBe(405)
  expect(response.headers.get('allow')).toBe(allow)
  expect(response.headers.get('cache-control')).toBe('no-store')
})
it('preserves the native SDK preflight contract', async () => {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
  })
  expect(response.status).toBe(204)
  expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
})
