import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { DEALS } from './community-fixtures'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend, hex } from './fake-backend'

const MEMBER = account('USER', { name: 'Synthetic Priya', email: 'synthetic-priya@example.test' })
const [KOPI, CHICKEN, BOBA] = DEALS as {
  id: string
  title: string
  category: string
  description: string
  validUntil: string
}[]

const fakeSaved = async (page: Page) => {
  const backend = await fakeBackend(page, { user: MEMBER })
  const saved = new Map<string, string>()
  backend.on('GET', '/api/account/bookmarks', () => ({
    json: {
      items: [...saved].map(([dealId, savedAt], index) => {
        const deal = DEALS.find((item) => (item as { id: string }).id === dealId) as typeof KOPI
        return {
          id: hex(700 + index),
          dealId,
          savedAt,
          deal: {
            title: deal.title,
            category: deal.category,
            description: deal.description,
            validUntil: deal.validUntil,
          },
        }
      }),
      nextCursor: null,
    },
  }))
  backend.on('PUT', /^\/api\/account\/bookmarks\/[0-9a-f]{24}$/, ({ path }) => {
    saved.set(path.split('/').at(-1) ?? '', new Date().toISOString())
    return { json: { saved: true } }
  })
  backend.on('DELETE', /^\/api\/account\/bookmarks\/[0-9a-f]{24}$/, ({ path }) => {
    saved.delete(path.split('/').at(-1) ?? '')
    return { json: { saved: false } }
  })
  return { backend, saved }
}

const toast = (page: Page) => page.getByTestId('toast')
const saveButton = (page: Page, title: string) =>
  page.getByRole('button', { name: `Save ${title}`, exact: true })

test('a member saves deals, finds them in Saved, and removes one with undo', async ({ page }) => {
  const { saved } = await fakeSaved(page)
  await page.goto('/deals')
  await expect(page.getByTestId('splash-screen')).toBeHidden()

  await saveButton(page, KOPI.title).click()
  await expect(toast(page)).toHaveText('Saved')
  await saveButton(page, BOBA.title).click()
  await expect(saveButton(page, KOPI.title)).toHaveAttribute('aria-pressed', 'true')
  await expect(saveButton(page, CHICKEN.title)).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => [...saved.keys()].sort()).toEqual([KOPI.id, BOBA.id].sort())

  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: '2 saved deals' })).toBeVisible()
  await expect(saveButton(page, KOPI.title)).toBeVisible()
  await expect(saveButton(page, BOBA.title)).toBeVisible()
  await expect(saveButton(page, CHICKEN.title)).toHaveCount(0)

  await saveButton(page, KOPI.title).click()
  await expect(toast(page)).toContainText('Removed from saved')
  await expect(page.getByRole('heading', { name: '1 saved deal' })).toBeVisible()
  await toast(page).getByTestId('toast-action').click()
  await expect(page.getByRole('heading', { name: '2 saved deals' })).toBeVisible()

  await saveButton(page, BOBA.title).click()
  await expect(page.getByRole('heading', { name: '1 saved deal' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '1 saved deal' })).toBeVisible()
  await expect(saveButton(page, KOPI.title)).toBeVisible()
  await expect(saveButton(page, BOBA.title)).toHaveCount(0)
})

test('a member changes their display name on their profile', async ({ page }) => {
  const backend = await fakeBackend(page, { user: MEMBER })
  backend.on('GET', '/api/account/profile', () => ({
    json: {
      id: backend.user?.id,
      name: backend.user?.name,
      email: backend.user?.email,
      role: 'USER',
      createdAt: MEMBER.createdAt,
    },
  }))
  backend.on('POST', '/api/auth/update-user', ({ body }) => {
    if (backend.user) backend.signIn({ ...backend.user, name: body.name })
    return { json: { status: true } }
  })
  await page.goto('/me/profile')

  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  const settings = page.getByRole('region', { name: 'My profile' })
  await expect(settings.getByRole('definition').filter({ hasText: MEMBER.email })).toBeVisible()
  await expect(settings.getByRole('definition').filter({ hasText: 'Regular user' })).toBeVisible()
  const name = settings.getByLabel('Display name')
  await expect(name).toHaveValue('Synthetic Priya')

  await name.fill('   ')
  await settings.getByRole('button', { name: 'Save name' }).click()
  await expect(settings.getByRole('alert')).toHaveText('Enter a name between 1 and 80 characters.')
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  expect(backend.callsTo('POST', '/api/auth/update-user')).toHaveLength(0)

  await name.fill('  Synthetic Priya Tan ')
  await settings.getByRole('button', { name: 'Save name' }).click()
  await expect(settings.getByRole('status')).toHaveText('Name updated.')
  expect(backend.callsTo('POST', '/api/auth/update-user').at(-1)?.body).toEqual({
    name: 'Synthetic Priya Tan',
  })
  await expect(page.getByRole('heading', { level: 1, name: 'Synthetic Priya Tan' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Display name')).toHaveValue('Synthetic Priya Tan')
  await expect(settings.getByRole('link', { name: 'Merchant access' })).toBeVisible()
})

test('a member requests merchant access for their stall', async ({ page }) => {
  const backend = await fakeBackend(page, { user: MEMBER })
  const STALLS = [
    {
      id: hex(801),
      name: 'Synthetic Ah Seng Chicken Rice',
      merchantName: 'Synthetic Ah Seng',
      address: '1 Synthetic St',
    },
    {
      id: hex(802),
      name: 'Synthetic Boba Lab',
      merchantName: 'Synthetic Boba',
      address: '2 Synthetic St',
    },
  ]
  const requests: Record<string, unknown>[] = []
  backend.on('GET', '/api/account/venues', ({ query }) => ({
    json: STALLS.filter((stall) =>
      stall.name.toLowerCase().includes((query.get('search') ?? '').toLowerCase()),
    ),
  }))
  backend.on('GET', '/api/account/merchant-requests', () => ({
    json: { items: requests, nextCursor: null },
  }))
  backend.on('POST', '/api/account/merchant-requests', ({ body }) => {
    const stall = STALLS.find((item) => item.id === body.venueId)
    if (!stall)
      return {
        status: 412,
        json: { error: { code: 'PRECONDITION_FAILED', message: 'Unavailable' } },
      }
    if (requests.some((item) => item.venueName === stall.name))
      return { status: 409, json: { error: { code: 'CONFLICT', message: 'Already requested' } } }
    const created = {
      id: hex(900 + requests.length),
      venueName: stall.name,
      merchantName: stall.merchantName,
      status: 'PENDING',
      reviewNote: null,
      createdAt: new Date().toISOString(),
    }
    requests.unshift(created)
    return {
      status: 201,
      json: {
        ...created,
        userId: MEMBER.id,
        userName: MEMBER.name,
        userEmail: MEMBER.email,
        venueId: stall.id,
        version: 0,
        message: body.message,
      },
    }
  })
  await page.goto('/me/merchant-access')

  await expect(page.getByRole('heading', { level: 1, name: 'Merchant access' })).toBeVisible()
  await expect(page.getByText('No requests yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByRole('combobox', { name: 'Stall' })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(backend.callsTo('POST', '/api/account/merchant-requests')).toHaveLength(0)

  await page.getByLabel('Find your stall').fill('chicken')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await chooseOption(page.getByRole('combobox', { name: 'Stall' }), STALLS[0]?.id ?? '')
  await page.getByLabel('Why should you have access?').fill('I run this stall with my family.')
  await page.getByRole('button', { name: 'Send request' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Request sent' })).toHaveText(
    'Request sent. An administrator will review it.',
  )
  expect(backend.callsTo('POST', '/api/account/merchant-requests').at(-1)?.body).toEqual({
    venueId: STALLS[0]?.id,
    message: 'I run this stall with my family.',
  })
  const request = page
    .getByRole('listitem')
    .filter({ hasText: 'Synthetic Ah Seng Chicken Rice (Synthetic Ah Seng)' })
  await expect(request).toContainText('PENDING')

  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await chooseOption(page.getByRole('combobox', { name: 'Stall' }), STALLS[0]?.id ?? '')
  await page.getByLabel('Why should you have access?').fill('Sending this again.')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'already' })).toHaveText(
    'You already have a pending request or access for this stall.',
  )
  await expect(request).toHaveCount(1)
})
