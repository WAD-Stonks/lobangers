import { createRequire } from 'node:module'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'

type ViteDevServer = import('../apps/web/node_modules/vite/dist/node/index.js').ViteDevServer

// Synthetic REST interception, original Vue components + real API client/CSS.
// This isolated component fixture is not live identity/database authorization proof.
const userId = 'a'.repeat(24)
const sessionId = 'b'.repeat(24)
const actorId = 'c'.repeat(24)
let server: ViteDevServer
let base: string

test.beforeAll(async () => {
  const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url))
  const { createServer }: typeof import('../apps/web/node_modules/vite/dist/node/index.js') =
    await import(pathToFileURL(webRequire.resolve('vite')).href)
  const {
    default: vue,
  }: typeof import('../apps/web/node_modules/@vitejs/plugin-vue/dist/index.mjs') = await import(
    pathToFileURL(webRequire.resolve('@vitejs/plugin-vue')).href
  )
  const reservation = createNetServer()
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  const port = address.port
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  )
  const root = fileURLToPath(new URL('../apps/web/', import.meta.url))
  server = await createServer({
    configFile: false,
    envDir: false,
    root,
    cacheDir: resolve(tmpdir(), 'lobangers-security-ui', 'vite-cache'),
    plugins: [
      vue(),
      {
        name: 'synthetic-security-component-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler:
            () => `<!doctype html><html><head><title>Synthetic account security</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="fixture" class="container py-3"></main><script type="module">
        import { createApp, h, ref } from 'vue';
        import Panel from '/src/modules/platform-security/AccountSecurityPanel.vue';
        import '@broke-oclock/ui/styles.css';
        import '/src/assets/main.css';
        import '/src/assets/bootstrap-theme.css';
        createApp({ setup() { const version=ref(7); return () => h('div', {class:'admin-shell'}, [h('h1', {class:'h4'}, 'Synthetic account-security fixture'), h('div', {class:'admin-content'}, [h(Panel, {userId:'${userId}', accountVersion:version.value, onChanged(result) { version.value=result.version }})])]); } }).mount('#fixture');
      </script></body></html>`,
        },
      },
    ],
    resolve: { tsconfigPaths: true },
    server: { host: '127.0.0.1', port, strictPort: true },
  })
  await server.listen()
  base = `http://127.0.0.1:${port}`
})
test.afterAll(async () => {
  await server?.close()
  if (base) {
    await expect
      .poll(async () => {
        try {
          await fetch(base)
          return false
        } catch {
          return true
        }
      })
      .toBe(true)
  }
})
for (const width of [320, 768, 1024, 1440]) {
  test(`synthetic account security keyboard flow fits ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    let version = 7
    let suspended = false
    const writes: Array<{ path: string; body: unknown }> = []
    let release!: () => void
    let observed!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const seen = new Promise<void>((resolve) => {
      observed = resolve
    })
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let body: unknown
      if (request.method() !== 'GET') {
        writes.push({ path, body: request.postDataJSON() })
        observed()
        await pending
        version = 8
        suspended = true
        body = { id: userId, version, affectedSessionCount: 1 }
      } else if (path.endsWith('/security-context'))
        body = {
          actorUserId: actorId,
          freshLoginUntil: '2099-01-01T00:00:00.000Z',
          reauthenticationRequired: false,
        }
      else if (path.endsWith('/security'))
        body = {
          userId,
          version,
          emailVerified: false,
          state: suspended ? 'SUSPENDED' : 'ACTIVE',
          suspendedAt: suspended ? '2026-10-28T00:00:00.000Z' : null,
          methods: { passwordConfigured: true, googleLinked: false, emailOtpAvailable: true },
        }
      else if (path.endsWith('/sessions'))
        body = {
          userId,
          version,
          items: suspended
            ? []
            : [
                {
                  id: sessionId,
                  deviceLabel: '<img src=x> Synthetic browser',
                  createdAt: '2026-10-01T00:00:00.000Z',
                  expiresAt: '2026-11-01T00:00:00.000Z',
                },
              ],
          nextCursor: null,
        }
      else throw new Error(`Unexpected synthetic boundary: ${path}`)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    })
    try {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(base)
      await expect(page).toHaveTitle('Synthetic account security')
      const panel = page.getByRole('region', { name: 'Account security', exact: true })
      await expect(panel.getByText('Email verified: No', { exact: true })).toBeVisible()
      await expect(panel.locator('img')).toHaveCount(0)
      const note = panel.getByTestId('security-note')
      const consent = panel.getByTestId('security-confirm')
      const submit = panel.getByRole('button', { name: 'Suspend account', exact: true })
      await expect(consent).not.toBeChecked()
      await expect(submit).toBeDisabled()
      await note.focus()
      await note.fill('Synthetic browser review')
      await page.keyboard.press('Tab')
      await expect(consent).toBeFocused()
      await page.keyboard.press('Space')
      await page.keyboard.press('Tab')
      await expect(submit).toBeFocused()
      await Promise.all([seen, page.keyboard.press('Enter')])
      await expect(submit).toBeDisabled()
      expect(writes).toEqual([
        {
          path: `/api/admin/accounts/${userId}/suspend`,
          body: { expectedVersion: 7, note: 'Synthetic browser review', confirmed: true },
        },
      ])
      release()
      await expect(panel.getByText('SUSPENDED', { exact: true })).toBeVisible()
      await expect(panel.getByTestId('security-note')).toHaveValue('')
      await expect(panel.getByTestId('security-confirm')).not.toBeChecked()
      await expect(
        panel.getByText('Security action completed. Sessions affected: 1.'),
      ).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({ path: info.outputPath(`security-${width}.png`), fullPage: true })
      expect(errors).toEqual([])
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
    }
  })
}
