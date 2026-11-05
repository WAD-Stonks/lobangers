import type { AdminOverviewResponse } from '@broke-oclock/contracts/platform-admin'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend } from './fake-backend'

const ADMIN = account('ADMIN', { name: 'Synthetic operator' })
const PASSWORD = 'synthetic-password-1'
const empty = { json: { items: [], nextCursor: null } }

const OVERVIEW: AdminOverviewResponse = {
  generatedAt: '2026-10-31T09:00:00.000Z',
  counts: {
    pendingMerchantRequests: 2,
    pendingImportedDrafts: 5,
    failedImportedPosts: 1,
    pendingFlashDrops: 0,
    liveFlashDrops: 0,
  },
  recentRuns: [],
  readiness: {
    googleConfigured: false,
    emailConfigured: false,
    oneMapConfigured: true,
    ingestionOptIn: false,
    reuseAttested: false,
    sourceRecordEnabled: false,
    sourceIdentityValid: true,
    importAllowed: false,
    liveProviderAcceptance: 'NOT_ESTABLISHED',
  },
}

const fakeAdmin = async (page: Page) => {
  const backend = await fakeBackend(page)
  backend.on('POST', '/api/auth/sign-in/email', ({ body }) => {
    if (body.email !== ADMIN.email || body.password !== PASSWORD)
      return { status: 401, json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid' } }
    backend.signIn(ADMIN)
    return { json: { redirect: false, token: 'synthetic-token', user: ADMIN } }
  })
  backend.on('GET', '/api/admin/overview', () =>
    backend.user
      ? { json: OVERVIEW }
      : { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in' } } },
  )
  backend.on('GET', '/api/admin/analytics/users', () => ({
    json: {
      generatedAt: OVERVIEW.generatedAt,
      timeZone: 'Asia/Singapore',
      totalUsers: 0,
      newUsersThisWeek: 0,
      weeks: Array.from({ length: 8 }, (_, index) => ({
        weekStart: new Date(Date.parse('2026-09-06T16:00:00Z') + index * 604_800_000).toISOString(),
        weekEnd: new Date(Date.parse('2026-09-13T16:00:00Z') + index * 604_800_000).toISOString(),
        newUsers: 0,
      })),
    },
  }))
  for (const path of [
    '/api/admin/audit',
    '/api/admin/accounts',
    '/api/admin/merchant-requests',
    '/api/admin/deals',
    '/api/admin/moderation/reports',
  ])
    backend.on('GET', path, () => empty)
  return backend
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Administration' })

test('an operator signs in to the overview and reaches each workspace from it', async ({
  page,
}) => {
  await fakeAdmin(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/admin')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in to view administration' }),
  ).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  const work = page.getByRole('region', { name: 'Work awaiting review' })
  await expect(work.getByRole('link', { name: /Pending merchant requests: .*2/ })).toBeVisible()
  await expect(work.getByRole('link', { name: /Pending imported drafts: .*5/ })).toBeVisible()

  await work.getByRole('link', { name: /Pending merchant requests/ }).click()
  await expect(page).toHaveURL(/\/admin\/accounts\?requestStatus=PENDING#merchant-requests$/)
  await expect(
    page
      .getByRole('tablist', { name: 'Accounts workspace' })
      .getByRole('tab', { name: 'Merchant requests' }),
  ).toHaveAttribute('aria-selected', 'true')

  const workspaces = [
    { link: 'Deals', url: /\/admin\/deals$/, heading: 'Deals' },
    { link: 'Moderation', url: /\/admin\/moderation$/, heading: 'Report queue' },
    { link: 'Audit', url: /\/admin\/audit$/, heading: 'Audit history' },
    { link: 'Overview', url: /\/admin$/, heading: 'Work awaiting review' },
  ]
  for (const { link, url, heading } of workspaces) {
    await sidebar(page).getByRole('link', { name: link, exact: true }).click()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(sidebar(page).getByRole('link', { name: link, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
})
