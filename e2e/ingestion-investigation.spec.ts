import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { allocateTestPort } from '@scripts/test-listener'

// Synthetic external HTTP responses, real Vue components + typed Axios factory.
// Not native identity or persistence evidence (covered by the disposable HTTP suite).
const id = 'a'.repeat(24),
  sourceId = 'b'.repeat(24),
  recoveryId = 'c'.repeat(24)
let server: import('../apps/web/node_modules/vite/dist/node/index.js').ViteDevServer
let base = ''
test.beforeAll(async () => {
  const req = createRequire(new URL('../apps/web/package.json', import.meta.url))
  const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
  const { default: vue } = await import(pathToFileURL(req.resolve('@vitejs/plugin-vue')).href)
  server = await createServer({
    configFile: false,
    envDir: false,
    root: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    cacheDir: resolve(tmpdir(), 'lobangers-ingestion-admin', 'vite-cache'),
    resolve: { tsconfigPaths: true },
    plugins: [
      vue(),
      {
        name: 'synthetic-ingestion-investigation',
        transformIndexHtml: {
          order: 'pre',
          handler:
            () => `<!doctype html><html><head><title>Synthetic ingestion evidence</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="fixture" class="container py-3"></main><script type="module">
 import { createApp, h } from 'vue'; import Panel from '/src/modules/ingestion-admin/PostInvestigation.vue'; import { api } from '/src/lib/api-client.ts'; import { createIngestionInvestigationClient } from '/@fs${fileURLToPath(new URL('../packages/api-client/src/ingestion-investigation.ts', import.meta.url))}'; import '@broke-oclock/ui/styles.css'; import '/src/assets/main.css'; import '/src/assets/bootstrap-theme.css'; api.ingestionInvestigation = createIngestionInvestigationClient(api.http); createApp({render:()=>h(Panel,{postId:'${id}'})}).mount('#fixture');
 </script></body></html>`,
        },
      },
    ],
    server: { host: '127.0.0.1', port: await allocateTestPort(), strictPort: true },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Missing browser fixture port')
  base = `http://127.0.0.1:${address.port}`
})
test.afterAll(async () => {
  await server?.close()
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
for (const width of [320, 1280])
  test(`bounded recovery confirmation and safe text at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const writes: unknown[] = []
    const post = {
      id,
      externalId: '123',
      url: 'https://www.moneydigest.sg/synthetic/',
      title: '<script>unsafe()</script>',
      source: {
        id: sourceId,
        name: '<img src=x onerror=alert(1)> Synthetic source',
        provider: 'WORDPRESS',
        externalId: 'moneydigest.sg',
        url: 'https://www.moneydigest.sg/',
        enabled: true,
      },
      status: 'FAILED',
      errorCode: 'INGESTION_FAILED',
      failureStage: 'MEDIA',
      contentHash: 'd'.repeat(64),
      latestSnapshotHash: 'e'.repeat(64),
      snapshotFormat: 'moneydigest-v1',
      updatedAt: '2026-10-28T00:00:00.000Z',
      fetchedAt: '2026-10-28T00:00:00.000Z',
      processedAt: null,
      snapshotAvailable: true,
    }
    await page.route('**/api/ingestion/**', async (route) => {
      const request = route.request()
      let data: unknown
      if (request.method() === 'POST') {
        writes.push(request.postDataJSON())
        data = {
          id: recoveryId,
          postId: id,
          sourceId,
          mode: 'REFRESH_SOURCE_WINDOW',
          expectedUpdatedAt: post.updatedAt,
          expectedContentHash: post.contentHash,
          note: 'Synthetic browser reason',
          status: 'SUCCEEDED',
          targetOutcome: 'NOT_OBSERVED',
          runId: null,
          errorCode: null,
          requestedAt: post.updatedAt,
          finishedAt: post.updatedAt,
        }
      } else
        data = {
          post,
          citations: [],
          nextCitationCursor: null,
          capabilities: [
            { mode: 'REPROCESS_STORED', allowed: true, blockers: [] },
            { mode: 'REFRESH_SOURCE_WINDOW', allowed: true, blockers: [] },
          ],
          latestRecovery: null,
        }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto(base)
    const panel = page.getByRole('region', { name: 'Post investigation', exact: true })
    await expect(
      panel.getByText('Validated exact envelope available', { exact: false }),
    ).toBeVisible()
    await expect(panel.locator('img')).toHaveCount(0)
    const button = panel.getByTestId('recover-post')
    await expect(button).toBeDisabled()
    await panel
      .getByLabel('Bounded recovery mode', { exact: true })
      .selectOption('REFRESH_SOURCE_WINDOW')
    await panel.getByLabel('Reason (required)').fill('Synthetic browser reason')
    await panel
      .getByLabel('I reviewed this exact post hash/time and the bounded recovery mode.')
      .check()
    await button.click()
    await expect(panel.getByText(/operation SUCCEEDED; target outcome NOT_OBSERVED/)).toBeVisible()
    expect(writes).toEqual([
      {
        expectedUpdatedAt: post.updatedAt,
        expectedContentHash: post.contentHash,
        mode: 'REFRESH_SOURCE_WINDOW',
        note: 'Synthetic browser reason',
        confirmed: true,
      },
    ])
    await expect(button).toBeDisabled()
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`ingestion-${width}.png`), fullPage: true })
  })
