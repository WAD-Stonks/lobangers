import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { allocateTestPort } from '@scripts/test-listener'

type Vite = import('../apps/web/node_modules/vite/dist/node/index.js').ViteDevServer
let server: Vite, base: string
const id = '0123456789abcdef01234567'
const detail = {
  id,
  title: 'Synthetic meal',
  origin: 'USER_SUBMITTED',
  reviewStatus: 'PENDING',
  contentVersion: 1,
  operationVersion: 0,
  merchantId: null,
  deletedAt: null,
  publishedAt: null,
  validFrom: null,
  validUntil: null,
  publication: 'UNPUBLISHED',
  description: 'Full safe copy',
  terms: '<img src=x> Plain text only',
  category: 'FOOD',
  cuisine: null,
  offerType: 'OTHER',
  priceMinor: 1290,
  currency: 'SGD',
  discountPercent: null,
  rawValidityText: null,
  applicability: 'ONLINE',
  submittedById: id,
  reviewedById: null,
  reviewedVersion: null,
  reviewedAt: null,
  reviewNote: null,
  sources: [],
  images: [],
  outlets: [],
  outletCount: 0,
  selectedVenueIds: [],
  nextOutletCursor: null,
  scopeEditable: true,
  scopeConfirmed: false,
  blockers: [],
  approvalReady: true,
  publicationReady: false,
  scopeEvidenceLabel: null,
}
// Original Vue panel + shared typed client + real CSS. REST boundaries below are
// explicitly synthetic; native authorization is proved in the disposable HTTP suite.
test.beforeAll(async () => {
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
  const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
  const clientPath = fileURLToPath(
    new URL('../packages/api-client/src/admin-deals.ts', import.meta.url),
  )
  server = await createServer({
    configFile: false,
    envDir: false,
    root: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    cacheDir: resolve(tmpdir(), 'lobangers-deals', 'vite-cache'),
    plugins: [
      vue(),
      {
        name: 'synthetic-deals-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler: () =>
            `<!doctype html><html><head><title>Synthetic deals operations</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="fixture"></main><script type="module">import {createApp,h} from 'vue';import Panel from '/src/modules/admin-deals/DealsPanel.vue';import {createAdminDealsClient} from '/@fs/${clientPath}';import {api} from '/src/lib/api-client';import '@broke-oclock/ui/styles.css';import '/src/assets/main.css';import '/src/assets/bootstrap-theme.css';createApp({render:()=>h(Panel,{client:createAdminDealsClient(api.http)})}).mount('#fixture')</script></body></html>`,
        },
      },
    ],
    resolve: { tsconfigPaths: true },
    server: { host: '127.0.0.1', port: await allocateTestPort(), strictPort: true },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture listener')
  base = `http://127.0.0.1:${address.port}`
})
test.afterAll(async () => {
  await server?.close()
  if (base)
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
})
for (const width of [320, 768, 1024, 1440])
  test(`synthetic deals correction keyboard flow fits ${width}px`, async ({ page }, info) => {
    const errors: string[] = [],
      writes: unknown[] = []
    let changed = false
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/**', async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname
      if (request.method() === 'PATCH') {
        writes.push(request.postDataJSON())
        changed = true
      }
      const row = changed
        ? { ...detail, title: 'Corrected meal', contentVersion: 2, operationVersion: 1 }
        : detail
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          path === '/api/admin/deals'
            ? {
                items: [
                  Object.fromEntries(
                    [
                      'id',
                      'title',
                      'origin',
                      'reviewStatus',
                      'contentVersion',
                      'operationVersion',
                      'merchantId',
                      'deletedAt',
                      'publishedAt',
                      'validFrom',
                      'validUntil',
                      'publication',
                    ].map((key) => [key, row[key as keyof typeof row]]),
                  ),
                ],
                nextCursor: null,
              }
            : row,
        ),
      })
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto(base)
    await page.getByTestId('select-deal').click()
    await expect(page.getByText('OTHER · SGD 12.90', { exact: false })).toBeVisible()
    await expect(page.locator('img')).toHaveCount(0)
    await page.locator('[name="edit-title"]').fill('Corrected meal')
    const note = page.locator('[name="note"]'),
      confirm = page.locator('[name="confirm"]'),
      save = page.getByTestId('save-content')
    await expect(save).toBeDisabled()
    await note.fill('Reviewed browser correction')
    await note.focus()
    await page.keyboard.press('Tab')
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Space')
    await page.keyboard.press('Tab')
    await expect(save).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Corrected meal' })).toBeVisible()
    expect(writes).toEqual([
      {
        expectedContentVersion: 1,
        expectedOperationVersion: 0,
        note: 'Reviewed browser correction',
        changes: { title: 'Corrected meal' },
      },
    ])
    await expect(note).toHaveValue('')
    await expect(confirm).not.toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`deals-${width}.png`), fullPage: true })
    expect(errors).toEqual([])
  })
