import { type ChildProcess, fork } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only helper; no E2E alias exists and config is outside this UI adoption scope.
import { chooseAccountDetail, openAdminAccount, openAdminNavigation } from './admin-ui'

// Connected original SPA -> original native HTTP -> disposable Prisma/Mongo.
// ONLY Google authorization/token/JWKS and Resend delivery are controlled.
// No application/session/REST browser interception, auth-state files or traces.
const root = process.cwd()
const artifacts =
  process.env.ADMIN_CONNECTED_ARTIFACTS ??
  resolve(tmpdir(), 'admin-completion/G-connected-browser', `canonical-${process.pid}`)
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.describe.configure({ mode: 'default' })
type Identity = { id: string; email: string; password: string }
let child: ChildProcess
let webURL = ''
let bindings: { apiPort: number; webPort: number; mongoPorts: number[]; pid: number } | undefined
let passwordAdmin: Identity
let otpAdmin: Identity
let securityTarget: { id: string }
let pendingId = 0
let nextBrowserIp = 100
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()
const call = (operation: string, data: object = {}) =>
  new Promise<unknown>((resolveCall, reject) => {
    const id = ++pendingId
    pending.set(id, { resolve: resolveCall, reject })
    child.send({ id, operation, ...data })
  })
const observations = new Map<
  Page,
  {
    network: { method: string; path: string; status: number }[]
    console: string[]
    pageErrors: string[]
    resourceErrors: { path: string; status: number }[]
  }
>()
const observe = (page: Page) => {
  const evidence = {
    network: [] as { method: string; path: string; status: number }[],
    console: [] as string[],
    pageErrors: [] as string[],
    resourceErrors: [] as { path: string; status: number }[],
  }
  observations.set(page, evidence)
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/'))
      evidence.network.push({
        method: response.request().method(),
        path,
        status: response.status(),
      })
    else if (response.status() >= 400)
      evidence.resourceErrors.push({ path, status: response.status() })
  })
  // Browser diagnostics are actually collected, but never retain raw URL queries/provider payloads.
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      evidence.console.push(message.text().replace(/https?:\/\/[^\s]+/gu, '[url omitted]'))
  })
  page.on('pageerror', (error) => evidence.pageErrors.push(error.name))
}
const screenshot = async (page: Page, name: string) => {
  for (const selector of [
    '#sign-in-code',
    '#admin-password',
    '#recovery-code',
    '#recovery-password',
  ]) {
    const input = page.locator(selector)
    if (await input.count())
      await input.evaluate((element) => {
        ;(element as HTMLInputElement).value = ''
      })
  }
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true })
}
const identity = async (page: Page) =>
  page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session?disableCookieCache=true')
    const session = await response.json()
    return session?.user
      ? {
          id: session.user.id as string,
          role: session.user.role as string,
          verified: session.user.emailVerified as boolean,
        }
      : null
  })
const overview = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Admin overview', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toBeVisible()
  await expect(
    page.locator(
      '.overview-summary a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]',
    ),
  ).toContainText('Pending merchant requests: 1')
  await expect(
    page.locator('.overview-summary a[href="/admin/ingestion?status=PENDING#queue-title"]'),
  ).toContainText('Pending imported drafts: 0')
  const readiness = page.getByRole('button', {
    name: 'Expand configuration readiness',
    exact: true,
  })
  if (await readiness.isVisible()) await readiness.click()
  await expect(page.getByText('NOT_ESTABLISHED', { exact: true })).toBeVisible()
  expect(new URL(page.url()).origin === webURL).toBe(true)
  expect((await page.title()).length > 0).toBe(true)
  expect(await page.locator('body').innerText()).toContain('Admin overview')
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
}
const destinations = [
  {
    name: 'Deals',
    path: '/admin/deals',
    heading: 'Deals operations',
    content: 'No deals match these filters.',
    api: '/api/admin/deals',
  },
  {
    name: 'Catalogue',
    path: '/admin/catalogue',
    heading: 'Merchants & outlets',
    content: 'Synthetic connected merchant',
    api: '/api/admin/catalogue/merchants',
  },
  {
    name: 'Moderation',
    path: '/admin/moderation',
    heading: 'Reports & comment moderation',
    content: 'No records match these filters.',
    api: '/api/admin/moderation/reports',
  },
  {
    name: 'Accounts',
    path: '/admin/accounts',
    heading: 'Accounts',
    content: 'Synthetic security-target operator',
    api: '/api/admin/accounts',
  },
  {
    name: 'Ingestion',
    path: '/admin/ingestion',
    heading: 'Ingestion admin',
    content: 'Source readiness',
    api: '/api/ingestion/dashboard',
  },
  {
    name: 'Audit',
    path: '/admin/audit',
    heading: 'Audit investigation',
    content: 'Audit history',
    api: '/api/admin/audit',
  },
] as const
const destinationMatrix = async (page: Page, width: number) => {
  await page.setViewportSize({ width, height: 900 })
  await openAdminNavigation(page)
  await page
    .getByRole('navigation', { name: 'Administration', exact: true })
    .getByRole('link', { name: 'Overview', exact: true })
    .click()
  await overview(page)
  await screenshot(page, `destination-${width}-Overview`)
  for (const destination of destinations) {
    await openAdminNavigation(page)
    const response = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.replace(/\/$/u, '') === destination.api &&
        response.request().method() === 'GET',
    )
    await page
      .getByRole('navigation', { name: 'Administration', exact: true })
      .getByRole('link', { name: destination.name, exact: true })
      .click()
    expect((await response).status()).toBe(200)
    await expect(page).toHaveURL(`${webURL}${destination.path}`)
    await expect(
      page.getByRole('heading', { name: destination.heading, level: 1, exact: true }),
    ).toBeVisible()
    await expect(page.getByText(destination.content, { exact: true })).toBeVisible()
    await openAdminNavigation(page)
    await expect(
      page
        .getByRole('navigation', { name: 'Administration', exact: true })
        .getByRole('link', { name: destination.name, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    if (width < 768)
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      bootstrap: getComputedStyle(document.documentElement)
        .getPropertyValue('--bs-breakpoint-md')
        .trim(),
    }))
    await writeFile(
      resolve(artifacts, `destination-${width}-${destination.name}.json`),
      JSON.stringify({ destination: destination.path, geometry }, null, 2),
    )
    expect(geometry.viewport).toBe(width)
    expect(geometry.client).toBe(width)
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client)
    expect(geometry.bootstrap).toBe('768px')
    await screenshot(page, `destination-${width}-${destination.name}`)
  }
}
const catalogueMutation = async (page: Page) => {
  await openAdminNavigation(page)
  await page
    .getByRole('navigation', { name: 'Administration', exact: true })
    .getByRole('link', { name: 'Catalogue', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'New merchant', exact: true })).toBeVisible()
  const name = `Synthetic browser merchant ${randomBytes(6).toString('hex')}`
  const corrected = `${name} corrected`
  const note = 'Synthetic connected acceptance: canonical name correction only'
  await page.getByRole('button', { name: 'New merchant', exact: true }).click()
  await page.getByLabel('Canonical merchant name', { exact: true }).fill(name)
  await page.getByLabel('Reason for this operation', { exact: true }).fill(note)
  await page.locator('.catalogue-editor input[name="confirmed"]').check()
  const createdResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/admin/catalogue/merchants' &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Create merchant', exact: true }).click()
  const createdHTTP = await createdResponse
  expect(createdHTTP.status()).toBe(201)
  const created = (await createdHTTP.json()) as { id: string; version: number }
  expect(created.id).toMatch(/^[a-f0-9]{24}$/u)
  expect(created.version).toBe(1)
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  expect(await call('catalogueReadback', { merchantName: name })).toEqual([
    { id: created.id, name, catalogueVersion: 1, deletedAt: null },
  ])
  await page.getByLabel('Canonical merchant name', { exact: true }).fill(corrected)
  await page.getByLabel('Reason for this operation', { exact: true }).fill(note)
  await page.locator('.catalogue-editor input[name="confirmed"]').check()
  const changedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/admin/catalogue/merchants/${created.id}` &&
      response.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: 'Save name correction', exact: true }).click()
  const changedHTTP = await changedResponse
  const input = changedHTTP.request().postDataJSON() as {
    expectedVersion: number
    confirmed: boolean
  }
  expect(input.expectedVersion).toBe(created.version)
  expect(input.confirmed).toBe(true)
  expect(changedHTTP.status()).toBe(200)
  expect(await changedHTTP.json()).toEqual({ id: created.id, version: created.version + 1 })
  await expect(page.getByRole('heading', { name: corrected, exact: true })).toBeVisible()
  const persisted = await call('catalogueReadback', { merchantName: corrected })
  expect(persisted).toEqual([
    { id: created.id, name: corrected, catalogueVersion: 2, deletedAt: null },
  ])
  expect(await call('catalogueReadback', { merchantName: name })).toEqual([])
  await page.reload()
  await page.getByLabel('Search name / outlet address', { exact: true }).fill(corrected)
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await page.getByRole('button', { name: `Open ${corrected}`, exact: true }).click()
  await expect(page.getByLabel('Canonical merchant name', { exact: true })).toHaveValue(corrected)
  await writeFile(
    resolve(artifacts, 'catalogue-mutation.json'),
    JSON.stringify(
      {
        created,
        corrected: persisted,
        exactTarget: created.id,
        submittedVersion: input.expectedVersion,
      },
      null,
      2,
    ),
  )
  await screenshot(page, 'catalogue-corrected-persisted')
}
type SecurityReadback = {
  id: string
  role: string
  platformVersion: number
  authVersion: number
  suspendedAt: string | null
  sessionIds: string[]
  nativeUserId: string | null
  nativeMeStatus: number
  controls: { id: string; userId: string; genuineRecentLogin: boolean }[]
  audits: {
    actorId: string
    action: string
    subjectId: string
    note: string
    detailsJson: { revokedSessionCount: number }
  }[]
}
const securityMutations = async (page: Page) => {
  await openAdminNavigation(page)
  await page
    .getByRole('navigation', { name: 'Administration', exact: true })
    .getByRole('link', { name: 'Accounts', exact: true })
    .click()
  await page.getByTestId(`account-${securityTarget.id}`).click()
  await chooseAccountDetail(page, 'Security')
  const panel = page.getByRole('region', { name: 'Account security', exact: true })
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  const before = (await call('securityReadback')) as SecurityReadback
  expect(before.id).toBe(securityTarget.id)
  expect(before.role).toBe('USER')
  expect(before.suspendedAt).toBeNull()
  expect(before.nativeUserId).toBe(securityTarget.id)
  expect(before.nativeMeStatus).toBe(200)
  expect(before.sessionIds.length).toBeGreaterThan(0)
  expect(
    before.controls.some((row) => row.userId === passwordAdmin.id && row.genuineRecentLogin),
  ).toBe(true)
  const states: SecurityReadback[] = [before]
  for (const operation of ['suspend', 'reinstate'] as const) {
    const previous = states[states.length - 1]
    if (!previous) throw new Error('No previous exact account readback')
    const label = operation === 'suspend' ? 'Suspend' : 'Reinstate'
    await expect(
      panel.getByText(operation === 'suspend' ? 'ACTIVE' : 'SUSPENDED', { exact: true }),
    ).toBeVisible()
    await expect(panel.getByTestId('security-note')).toHaveValue('')
    await expect(panel.getByTestId('security-confirm')).not.toBeChecked()
    const note = `Synthetic connected acceptance: ${operation} safe target`
    await panel.getByTestId('security-note').fill(note)
    await panel.getByTestId('security-confirm').check()
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/admin/accounts/${securityTarget.id}/${operation}` &&
        response.request().method() === 'POST',
    )
    await panel.getByRole('button', { name: `${label} account`, exact: true }).click()
    const response = await responsePromise
    const input = response.request().postDataJSON() as {
      expectedVersion: number
      confirmed: boolean
    }
    expect(input.expectedVersion).toBe(previous.platformVersion)
    expect(input.confirmed).toBe(true)
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({
      id: securityTarget.id,
      version: previous.platformVersion + 1,
      affectedSessionCount: previous.sessionIds.length,
    })
    await expect(panel).toHaveAttribute('aria-busy', 'false')
    await expect(
      panel.getByText(operation === 'suspend' ? 'SUSPENDED' : 'ACTIVE', { exact: true }),
    ).toBeVisible()
    const after = (await call('securityReadback')) as SecurityReadback
    expect(after.id).toBe(before.id)
    expect(after.role).toBe(before.role)
    expect(after.platformVersion).toBe(previous.platformVersion + 1)
    expect(after.authVersion).toBe(previous.authVersion + 1)
    expect(after.sessionIds).toEqual([])
    expect(after.nativeUserId).toBeNull()
    expect(after.nativeMeStatus).toBe(401)
    expect(after.controls).toEqual(before.controls)
    if (operation === 'suspend') expect(after.suspendedAt).toMatch(/^\d{4}-/u)
    else expect(after.suspendedAt).toBeNull()
    const audit = after.audits.at(-1)
    expect(audit).toMatchObject({
      actorId: passwordAdmin.id,
      action: operation === 'suspend' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REINSTATED',
      subjectId: securityTarget.id,
      note,
      detailsJson: { revokedSessionCount: previous.sessionIds.length },
    })
    states.push(after)
    await writeFile(
      resolve(artifacts, `security-${operation}.json`),
      JSON.stringify(
        {
          exactTarget: securityTarget.id,
          submittedVersion: input.expectedVersion,
          before: previous,
          after,
        },
        null,
        2,
      ),
    )
    await screenshot(page, `security-${operation}-persisted`)
  }
  // The target is ACTIVE again, but native sessions remain ended; OTP/password
  // principals and their original pending ownership record are untouched.
  expect(await identity(page)).toEqual({ id: passwordAdmin.id, role: 'ADMIN', verified: true })
}
const permissionsAndLogout = async (page: Page, userId: string) => {
  const oldCookie = (await page.context().cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
  await call('role', { userId, role: 'USER' })
  await page.reload()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You do not have permission to view administration.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toHaveCount(0)
  expect((await identity(page))?.role).toBe('USER')
  expect(await call('protected', { cookie: oldCookie })).toBe(403)
  await openAdminAccount(page)
  await page.getByTestId('admin-sign-out').click()
  await expect(page.getByRole('heading', { name: 'Sign in to view administration' })).toBeVisible()
  expect(await identity(page)).toBeNull()
  expect(await call('protected', { cookie: oldCookie })).toBe(401)
  expect(await call('sessionCount', { userId })).toBe(0)
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  await mkdir(artifacts, { recursive: true })
  child = fork(
    process.env.ADMIN_CONNECTED_FIXTURE_ENTRY ??
      resolve(root, 'apps/api/tests/fixtures/admin-connected-browser.ts'),
    [],
    {
      cwd: root,
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: 'test',
        DATABASE_URL: 'mongodb://127.0.0.1:1/admin_connected_nonconnecting',
        // The fixture must also work on a clean runner without a cached mongod.
        MONGOMS_RUNTIME_DOWNLOAD: 'true',
        MONGOMS_DOWNLOAD_DIR: resolve(tmpdir(), 'lobangers-mongodb-binaries'),
        ADMIN_CONNECTED_ARTIFACTS: artifacts,
        ADMIN_CONNECTED_REPO_ROOT: root,
      },
    },
  )
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  const ready = new Promise<void>((resolveReady, reject) => {
    child.on('message', (message: unknown) => {
      const result = message as {
        ready?: boolean
        webURL?: string
        bindings?: { apiPort: number; webPort: number; mongoPorts: number[]; pid: number }
        passwordAdmin?: Identity
        otpAdmin?: Identity
        securityTarget?: { id: string }
        id?: number
        value?: unknown
        failure?: string
      }
      if (result.ready && result.webURL && result.passwordAdmin && result.otpAdmin) {
        webURL = result.webURL
        bindings = result.bindings
        passwordAdmin = result.passwordAdmin
        otpAdmin = result.otpAdmin
        if (!result.securityTarget) throw new Error('Missing independent security target')
        securityTarget = result.securityTarget
        resolveReady()
      } else if (result.id) {
        const waiter = pending.get(result.id)
        pending.delete(result.id)
        if (result.failure) waiter?.reject(new Error(result.failure))
        else waiter?.resolve(result.value)
      } else if (result.failure) reject(new Error(result.failure))
    })
    child.on('exit', (code) => {
      reject(new Error(`Owned fixture exited before readiness (${code})`))
      for (const waiter of pending.values()) waiter.reject(new Error('Owned fixture exited'))
      pending.clear()
    })
  })
  await ready
})
test.afterAll(async () => {
  if (child?.connected) {
    const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()))
    await call('stop')
    await exited
    if (bindings) {
      const checks = await Promise.all(
        [bindings.apiPort, bindings.webPort, ...bindings.mongoPorts].map(
          (port) =>
            new Promise<{ port: number; closed: boolean }>((resolveCheck) => {
              const socket = createConnection({ host: '127.0.0.1', port })
              socket.once('connect', () => {
                socket.destroy()
                resolveCheck({ port, closed: false })
              })
              socket.once('error', () => {
                socket.destroy()
                resolveCheck({ port, closed: true })
              })
            }),
        ),
      )
      await writeFile(
        resolve(artifacts, 'teardown.json'),
        JSON.stringify({ bindings, exited: true, checks }, null, 2),
      )
      expect(checks.every((check) => check.closed)).toBe(true)
    }
  }
})
test.beforeEach(async ({ page }) => {
  // Native rate limiting remains enabled. Each independent browser journey gets
  // its own synthetic client address, just like the fixture's native setup calls;
  // the expanded root-navigation matrix must not spend later auth cases' budget.
  await page.context().setExtraHTTPHeaders({
    'X-Forwarded-For': `203.0.113.${nextBrowserIp++}`,
  })
  observe(page)
  await page.goto(`${webURL}/admin`)
})
test.afterEach(async ({ page }, info) => {
  await screenshot(page, info.title.replace(/[^a-z0-9]+/giu, '-'))
  const evidence = observations.get(page)
  await writeFile(
    resolve(artifacts, `${info.title.replace(/[^a-z0-9]+/giu, '-')}.json`),
    JSON.stringify({ status: info.status, ...evidence }, null, 2),
  )
  expect(evidence?.pageErrors).toEqual([])
  expect(evidence?.resourceErrors).toEqual([])
  expect(
    evidence?.network.filter(
      (entry) =>
        entry.status >= 400 &&
        !(entry.path === '/api/admin/overview' && [401, 403].includes(entry.status)),
    ),
  ).toEqual([])
  // Expected anonymous/fresh-role HTTP denials are native authorization evidence, not JS errors.
  expect(
    evidence?.console.filter((message) => !message.includes('Failed to load resource')),
  ).toEqual([])
})

test('connected password admin reaches counts and deep links then loses permission and logs out', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.getByLabel('Email', { exact: true }).fill(passwordAdmin.email)
  await page.getByLabel('Password', { exact: true }).fill(passwordAdmin.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await overview(page)
  expect(await identity(page)).toEqual({ id: passwordAdmin.id, role: 'ADMIN', verified: true })
  await page
    .locator('.overview-summary a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]')
    .click()
  await expect(page.locator('#request-status')).toHaveValue('PENDING')
  await expect(page.locator('#merchant-requests')).toBeVisible()
  await page.goto(`${webURL}/admin`)
  await overview(page)
  await page
    .locator('.overview-summary a[href="/admin/ingestion?status=PENDING#queue-title"]')
    .click()
  await expect(page.locator('#queue-status')).toHaveValue('PENDING')
  await expect(page.locator('#queue-title')).toBeVisible()
  await page.goto(`${webURL}/admin`)
  await overview(page)
  await screenshot(page, 'password-admin-settled')
  await destinationMatrix(page, 1440)
  await catalogueMutation(page)
  await securityMutations(page)
  await destinationMatrix(page, 390)
  await openAdminNavigation(page)
  await page
    .getByRole('navigation', { name: 'Administration', exact: true })
    .getByRole('link', { name: 'Overview', exact: true })
    .click()
  await overview(page)
  await permissionsAndLogout(page, passwordAdmin.id)
})

test('connected OTP preserves existing admin identity and records while revoking password and old sessions', async ({
  page,
}) => {
  await page.getByLabel('Email', { exact: true }).fill(otpAdmin.email)
  await page.getByTestId('otp-send').click()
  await expect(page.getByTestId('otp-form')).toBeVisible()
  const code = await call('otp', { email: otpAdmin.email })
  if (typeof code !== 'string')
    throw new Error('Controlled Resend did not return an in-memory code')
  await page.getByLabel('Sign-in code', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Sign in with code', exact: true }).click()
  await overview(page)
  expect(await identity(page)).toEqual({ id: otpAdmin.id, role: 'ADMIN', verified: true })
  expect(await call('otpPreserved')).toEqual({
    userPreserved: true,
    recordPreserved: true,
    oldCookieDenied: true,
    credentialRemoved: true,
    oldPasswordDenied: true,
  })
  await screenshot(page, 'otp-admin-settled')
  await openAdminAccount(page)
  await page.getByTestId('admin-sign-out').click()
  await expect(page.getByRole('heading', { name: 'Sign in to view administration' })).toBeVisible()
  await page.getByTestId('recovery-open').click()
  await page.getByLabel('Email', { exact: true }).fill(otpAdmin.email)
  await page.getByRole('button', { name: 'Send recovery code', exact: true }).click()
  await expect(page.getByTestId('recovery-reset')).toBeVisible()
  const recoveryCode = await call('otp', { email: otpAdmin.email })
  if (typeof recoveryCode !== 'string')
    throw new Error('Controlled Resend captured no recovery code')
  const newPassword = randomBytes(24).toString('base64url')
  await page.getByLabel('Recovery code', { exact: true }).fill(recoveryCode)
  await page.getByLabel('New password (at least 8 characters)', { exact: true }).fill(newPassword)
  await page
    .getByTestId('recovery-reset')
    .getByRole('button', { name: 'Reset password', exact: true })
    .click()
  await expect(
    page.getByText('Password reset. Sign in again with your new password.', { exact: true }),
  ).toBeVisible()
  expect(await identity(page)).toBeNull()
  await page.getByLabel('Email', { exact: true }).fill(otpAdmin.email)
  await page.getByLabel('Password', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await overview(page)
  expect(await identity(page)).toEqual({ id: otpAdmin.id, role: 'ADMIN', verified: true })
  await screenshot(page, 'otp-recovered-password-settled')
  await permissionsAndLogout(page, otpAdmin.id)
})

test('connected controlled Google native callback creates USER ignoring forged role then fresh ADMIN promotion', async ({
  page,
}) => {
  await page.route('https://accounts.google.com/**', async (route) => {
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name.includes('state') && cookie.httpOnly,
      ),
    ).toBe(true)
    const authorization = new URL(route.request().url())
    const callback = await call('googleGrant', {
      authorization: authorization.href,
      verified: true,
    })
    if (typeof callback !== 'string')
      throw new Error('Controlled authorization returned no native callback')
    // Only the external authorization navigation is controlled; browser receives the
    // original native state cookie and follows native callback + native session redirect.
    await route.fulfill({ status: 302, headers: { location: callback }, body: '' })
  })
  await page.getByTestId('google-sign-in').click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You do not have permission to view administration.' }),
  ).toBeVisible()
  const user = await identity(page)
  expect(user?.role).toBe('USER')
  expect(user?.verified).toBe(true)
  if (!user) throw new Error('Native Google callback did not produce an identity')
  expect(await call('googleCanonical', { userId: user.id })).toBe(true)
  await call('role', { userId: user.id, role: 'ADMIN' })
  await page.reload()
  await overview(page)
  expect((await identity(page))?.id === user.id).toBe(true)
  await screenshot(page, 'google-admin-settled')
  await permissionsAndLogout(page, user.id)
})

test('connected Google refuses an unverified provider profile without a native session', async ({
  page,
}) => {
  await page.route('https://accounts.google.com/**', async (route) => {
    const callback = await call('googleGrant', {
      authorization: route.request().url(),
      verified: false,
    })
    if (typeof callback !== 'string')
      throw new Error('Controlled Google returned no native callback')
    await route.fulfill({ status: 302, headers: { location: callback }, body: '' })
  })
  await page.getByTestId('google-sign-in').click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Google sign-in could not be completed.' }),
  ).toBeVisible()
  expect(await identity(page)).toBeNull()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toHaveCount(0)
  expect(await page.evaluate(async () => (await fetch('/api/admin/overview')).status)).toBe(401)
})

test('connected aged admin UI renews native session without replacing identity or owned records', async ({
  page,
}) => {
  // A separate native Google sign-in avoids exhausting the unchanged password
  // endpoint's per-IP budget after the preceding password/recovery proofs.
  await page.route('https://accounts.google.com/**', async (route) => {
    const callback = await call('googleGrant', {
      authorization: route.request().url(),
      verified: true,
    })
    if (typeof callback !== 'string') throw new Error('Controlled Google returned no callback')
    await route.fulfill({ status: 302, headers: { location: callback }, body: '' })
  })
  await page.getByTestId('google-sign-in').click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You do not have permission to view administration.' }),
  ).toBeVisible()
  const user = await identity(page)
  if (!user) throw new Error('Native Google sign-in did not produce an identity')
  await call('role', { userId: user.id, role: 'ADMIN' })
  await page.reload()
  await overview(page)
  type Expiry = {
    sessionId: string
    recordId: string
    userId: string
    expiresAt: number
    recordStatus?: string
  }
  const before = (await call('ageSession', { userId: user.id })) as Expiry
  const start = observations.get(page)?.network.length ?? 0
  // Original component mount, not a standalone atom or a manually posted renewal.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Admin session' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  const after = (await call('sessionExpiry', { userId: user.id })) as Expiry
  const native =
    observations
      .get(page)
      ?.network.slice(start)
      .filter((entry) => entry.path === '/api/auth/get-session') ?? []
  await writeFile(
    resolve(artifacts, 'aged-session-renewal.json'),
    JSON.stringify({ before, after, native }, null, 2),
  )
  expect(native.some((entry) => entry.method === 'POST' && entry.status === 200)).toBe(true)
  expect(after.expiresAt).toBeGreaterThan(before.expiresAt)
  expect(after).toEqual({ ...before, expiresAt: after.expiresAt, recordStatus: 'PENDING' })
  expect(await identity(page)).toEqual({ id: user.id, role: 'ADMIN', verified: true })
  await permissionsAndLogout(page, user.id)
})
