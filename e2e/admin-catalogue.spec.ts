import { type ChildProcess, fork } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only helper; no E2E alias exists and config is outside this UI adoption scope.
import { openAdminAccount } from './admin-ui'

const artifacts = resolve(tmpdir(), 'lobangers-catalogue', 'browser')
let child: ChildProcess
let login: { webURL: string; email: string; password: string }
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.beforeAll(async () => {
  test.setTimeout(180_000)
  await mkdir(artifacts, { recursive: true })
  child = fork(resolve('apps/api/tests/fixtures/admin-catalogue-browser.ts'), [], {
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: 'test',
    },
  })
  let diagnostics = ''
  child.stderr?.on('data', (chunk) => {
    diagnostics += String(chunk)
  })
  login = await new Promise((accept, reject) => {
    child.on('message', (message: unknown) => {
      const value = message as typeof login & { ready?: boolean; failure?: string }
      if (value.ready) accept(value)
      else if (value.failure) reject(new Error(value.failure))
    })
    child.on('exit', (code) =>
      reject(new Error(`Catalogue fixture exited ${code}: ${diagnostics.slice(-2000)}`)),
    )
  })
})
test.afterAll(async () => {
  if (child?.connected) {
    const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.send({ operation: 'stop' })
    await stopped
  }
})
test('connected native sign-in, merchant/outlet correction, manual receipts, invalidation and responsive keyboard flow', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error('PAGE', error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('CONSOLE', message.text())
  })
  page.setDefaultTimeout(15_000)
  await page.goto(login.webURL)
  await page.getByLabel('Email', { exact: true }).fill(login.email)
  await page.getByLabel('Password', { exact: true }).fill(login.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Merchants directory', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'New merchant', exact: true }).click()
  await page.getByLabel('Canonical merchant name').fill('Synthetic browser merchant')
  await page.locator('#merchant-note').fill('Synthetic canonical merchant identity reviewed')
  await page.locator('input[name="confirmed"]').check()
  await page.getByRole('button', { name: 'Create merchant', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Synthetic browser merchant', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Add outlet to this merchant', exact: true }).click()
  const fields: Record<string, string> = {
    name: 'Synthetic browser outlet',
    address: 'Synthetic resolved address',
    postalCode: '123456',
    area: 'Synthetic area',
    latitude: '1.3',
    longitude: '103.8',
    catalogueKey: 'synthetic:browser-outlet',
  }
  for (const [key, value] of Object.entries(fields)) await page.locator(`#venue-${key}`).fill(value)
  await page.locator('#venue-note').fill('Synthetic resolved outlet tuple reviewed')
  await page.locator('input[name="confirmed"]').check()
  await page.getByRole('button', { name: 'Create unverified outlet', exact: true }).click()
  await expect(page.getByText('Unselectable — maintenance only', { exact: true })).toBeVisible()
  await page.locator('#proof-reference').fill('Synthetic reviewed merchant source')
  await page.locator('#proof-url').fill('https://example.test/official-outlets')
  await page.locator('#proof-kind').selectOption('OCCUPANCY')
  await page.locator('#proof-source').selectOption('OFFICIAL_MERCHANT')
  await page
    .locator('#proof-statement')
    .fill('Synthetic manual source explicitly confirms this merchant occupies the exact outlet')
  await page.locator('#proof-note').fill('Synthetic supporting source personally reviewed')
  await page.getByLabel('I personally reviewed a real supporting source', { exact: false }).check()
  await page.getByLabel('I confirm Synthetic browser outlet (version', { exact: false }).check()
  await page.getByRole('button', { name: 'Record manual verification', exact: true }).click()
  await expect(
    page.getByText('Selectable under existing outlet policy', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Synthetic reviewed merchant source', { exact: true })).toBeVisible()
  await page.locator('#venue-name').fill('Synthetic corrected browser outlet')
  await page.locator('#venue-note').fill('Synthetic spelling correction invalidates tuple proof')
  await page
    .locator('form')
    .filter({ has: page.locator('#venue-note') })
    .locator('input[name="confirmed"]')
    .check()
  await page.getByRole('button', { name: 'Save outlet correction', exact: true }).click()
  await expect(page.getByText('Unselectable — maintenance only', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Synthetic reviewed merchant source', { exact: true }).first(),
  ).toBeVisible()
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({
      path: resolve(artifacts, `catalogue-${width}-probe.png`),
      fullPage: true,
    })
    console.log(
      'OVERFLOW',
      width,
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('*'))
          .filter((element) => element.getBoundingClientRect().right > innerWidth)
          .map((element) => ({
            tag: element.tagName,
            css: element.className,
            text: element.textContent?.slice(0, 50),
            right: element.getBoundingClientRect().right,
          }))
          .slice(-12),
      ),
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: resolve(artifacts, `catalogue-${width}.png`), fullPage: true })
  }
  await page.locator('#venue-note').focus()
  await page.keyboard.press('Tab')
  await expect(
    page
      .locator('form')
      .filter({ has: page.locator('#venue-note') })
      .locator('input[name="confirmed"]'),
  ).toBeFocused()
  await openAdminAccount(page)
  await page.getByTestId('admin-sign-out').click()
  await expect(
    page.getByRole('heading', { name: 'Sign in to maintain the catalogue', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Outlet proof & manual sources', exact: true }),
  ).toHaveCount(0)
  expect(errors).toEqual([])
})
