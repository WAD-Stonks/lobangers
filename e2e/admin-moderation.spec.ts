import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { allocateTestPort } from '@scripts/test-listener'

type ViteServer = import('../apps/web/node_modules/vite/dist/node/index.js').ViteDevServer
let server: ViteServer, base: string
const id = '0123456789abcdef01234567'
// Synthetic REST/auth responses: real Vue page, client and CSS, NOT live authorization.
// Until parent registry adoption this harness explicitly registers the original factory.
test.beforeAll(async () => {
  const req = createRequire(new URL('../apps/web/package.json', import.meta.url))
  const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
  const { default: vue } = await import(pathToFileURL(req.resolve('@vitejs/plugin-vue')).href)
  server = await createServer({
    configFile: false,
    envDir: false,
    root: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    cacheDir: resolve(tmpdir(), 'lobangers-moderation', 'vite-cache'),
    plugins: [
      vue(),
      {
        name: 'synthetic-moderation-page',
        transformIndexHtml: {
          order: 'pre',
          handler:
            () => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic moderation</title></head><body><main id="fixture" class="container py-3"></main><script type="module">
 import {createApp} from 'vue';import Page from '/src/pages/AdminModerationPage.vue';import {api} from '/src/lib/api-client.ts';import {createAdminModerationClient} from '/@fs${new URL('../packages/api-client/src/admin-moderation.ts', import.meta.url).pathname}';Object.assign(api,{adminModeration:createAdminModerationClient(api.http)});import '@broke-oclock/ui/styles.css';import '/src/assets/main.css';import '/src/assets/bootstrap-theme.css';createApp(Page).mount('#fixture');</script></body></html>`,
        },
      },
    ],
    resolve: { tsconfigPaths: true },
    server: { host: '127.0.0.1', port: await allocateTestPort(), strictPort: true },
  })
  await server.listen()
  const a = server.httpServer?.address()
  if (!a || typeof a === 'string') throw new Error('Missing fixture listener')
  base = `http://127.0.0.1:${a.port}`
})
test.afterAll(async () => {
  await server?.close()
})
for (const width of [320, 768, 1024, 1440])
  test(`synthetic moderation exact decision and responsive ${width}px`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const row = {
      id,
      targetType: 'COMMENT',
      targetId: '1123456789abcdef01234567',
      moderationVersion: 4,
      reason: 'SPAM',
      status: 'OPEN',
      details: '<img src=x> Original evidence',
      reporter: { id, name: 'Synthetic reporter' },
      deal: null,
      comment: null,
      resolution: null,
      resolvedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const writes: unknown[] = []
    let release!: () => void, seen!: () => void
    const hold = new Promise<void>((r) => {
        release = r
      }),
      observed = new Promise<void>((r) => {
        seen = r
      })
    await page.route('**/api/**', async (route) => {
      const r = route.request(),
        p = new URL(r.url()).pathname
      let body: unknown
      if (p.includes('/auth/get-session'))
        body = {
          user: { id, name: 'Synthetic administrator', email: 'synthetic@example.test' },
          session: { id, expiresAt: '2099-01-01T00:00:00Z' },
        }
      else if (p.endsWith('/auth-methods'))
        body = { password: true, google: false, emailOtp: false, passwordRecovery: false }
      else if (p.endsWith('/resolve')) {
        writes.push(r.postDataJSON())
        seen()
        await hold
        body = {
          ...row,
          status: 'RESOLVED',
          resolution: 'Reviewed explicit evidence',
          moderationVersion: 5,
        }
      } else if (p.endsWith(`/COMMENT/${id}`)) body = row
      else if (p.endsWith('/reports')) body = { items: [row], nextCursor: null }
      else throw new Error(`Unexpected synthetic endpoint ${p}`)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(base)
    await expect(page.getByRole('heading', { name: 'Reports & comment moderation' })).toBeVisible()
    await page.getByRole('button', { name: 'Inspect report' }).click()
    await expect(page.getByText('<img src=x> Original evidence', { exact: true })).toBeVisible()
    await expect(page.locator('img')).toHaveCount(0)
    await page.getByLabel('Resolution (required)').fill('Reviewed explicit evidence')
    await page.getByLabel('I reviewed this exact target').check()
    await page.getByRole('button', { name: 'Record report decision' }).focus()
    await page.keyboard.press('Enter')
    await observed
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(writes).toEqual([
      {
        expectedVersion: 4,
        decision: 'RESOLVED',
        resolution: 'Reviewed explicit evidence',
        confirmed: true,
      },
    ])
    release()
    await expect(
      page.getByText('Report resolved. Content visibility and sibling reports were not changed.', {
        exact: true,
      }),
    ).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({
      path: resolve(tmpdir(), 'lobangers-moderation', `moderation-${width}.png`),
      fullPage: true,
    })
  })
