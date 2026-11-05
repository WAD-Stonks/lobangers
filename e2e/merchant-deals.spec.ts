import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, type Backend, fakeBackend, hex } from './fake-backend'

const MERCHANT = account('MERCHANT', { name: 'Synthetic Ah Seng' })
const OUTLETS = [
  {
    id: hex(1),
    name: 'Synthetic Ah Seng (Maxwell)',
    address: '1 Synthetic Kadayanallur St, #01-10',
  },
  {
    id: hex(2),
    name: 'Synthetic Ah Seng (Tiong Bahru)',
    address: '30 Synthetic Seng Poh Rd, #02-05',
  },
]
const day = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA')

type Deal = Record<string, unknown> & { id: string; title: string; endedAt: string | null }

const merchantDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  title: 'Synthetic roast chicken rice set',
  description: 'Fake deal for tests.',
  category: 'FOOD',
  cuisine: 'CHINESE',
  outletIds: [hex(1)],
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  priceCents: 400,
  startDate: day(-30),
  endDate: day(-2),
  terms: 'Dine-in only',
  endedAt: null,
  photo: null,
  ...overrides,
})

const fakeMerchant = async (
  page: Page,
  seed: Deal[] = [],
  user: typeof MERCHANT | null = MERCHANT,
) => {
  const backend = await fakeBackend(page, { user })
  let deals = [...seed]
  let nextId = 600
  const fromBody = (id: string, body: Record<string, unknown>): Deal => {
    const { photoKey: _photo, ...fields } = body
    return { ...merchantDeal(id), ...fields, id, endedAt: null, photo: null } as Deal
  }
  const byId = (path: string) => deals.find((deal) => path.includes(deal.id))
  backend.on('GET', '/api/merchant/outlets', () => ({ json: { items: OUTLETS } }))
  backend.on('GET', '/api/merchant/flash-drops', () => ({ json: { items: [] } }))
  backend.on('GET', '/api/merchant/deals', () => ({ json: { items: deals } }))
  backend.on('POST', '/api/merchant/deals', ({ body }) => {
    const created = fromBody(hex(nextId++), body)
    deals = [created, ...deals]
    return { status: 201, json: created }
  })
  backend.on('PATCH', /^\/api\/merchant\/deals\/[0-9a-f]{24}$/, ({ path, body }) => {
    const current = byId(path)
    if (!current) return undefined
    const updated = fromBody(current.id, body)
    deals = deals.map((deal) => (deal.id === current.id ? updated : deal))
    return { json: updated }
  })
  backend.on('POST', /^\/api\/merchant\/deals\/[0-9a-f]{24}\/end$/, ({ path }) => {
    const current = byId(path)
    if (!current) return undefined
    const ended = { ...current, endedAt: new Date().toISOString() }
    deals = deals.map((deal) => (deal.id === current.id ? ended : deal))
    return { json: ended }
  })
  backend.on('DELETE', /^\/api\/merchant\/deals\/[0-9a-f]{24}$/, ({ path }) => {
    deals = deals.filter((deal) => !path.endsWith(deal.id))
    return { status: 204 }
  })
  page.on('dialog', () => {
    throw new Error('The browser confirm should not be used')
  })
  return backend
}

const openDashboard = async (page: Page) => {
  await page.goto('/merchant')
  await expect(page.getByRole('heading', { level: 1, name: 'Merchant dashboard' })).toBeVisible()
}
const card = (page: Page, title: string) => page.getByRole('article').filter({ hasText: title })
const notice = (page: Page) =>
  page.getByRole('status').filter({ hasText: /now live|updated|ended|deleted/ })
const confirm = async (page: Page, title: string) => {
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
  await dialog.getByTestId('confirm-dialog-confirm').click()
  await expect(dialog).toHaveCount(0)
}
const next = (page: Page) => page.getByTestId('deal-form-next').click()
const lastBody = (backend: Backend, method: string, path: string | RegExp) =>
  backend.callsTo(method, path).at(-1)?.body

test('a merchant logs in, opens their dashboard, and cannot use the member deal form', async ({
  page,
}) => {
  const backend = await fakeMerchant(page, [], null)
  backend.on('POST', '/api/auth/sign-in/email', () => {
    backend.signIn(MERCHANT)
    return { json: { redirect: false, token: 'synthetic-token', user: MERCHANT } }
  })
  await page.goto('/sign-in')
  await page.getByLabel('Email', { exact: true }).fill(MERCHANT.email)
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-1')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  await page.getByTestId('header-merchant-dashboard').click()
  await expect(page).toHaveURL(/\/merchant$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Merchant dashboard' })).toBeVisible()
  await expect(page.getByTestId('stat-live')).toContainText('0')
  await expect(
    page.getByText('No deals yet. Add one and it goes on the map straight away.'),
  ).toBeVisible()

  await page.goto('/add')
  await expect(page).toHaveURL(/\/merchant$/)
})

test('a merchant adds a deal at one outlet, sees it live, then ends it', async ({ page }) => {
  const backend = await fakeMerchant(page)
  await openDashboard(page)

  await page.getByRole('button', { name: 'Add a deal' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'New deal' })).toBeVisible()
  await next(page)
  await expect(
    page.getByRole('alert').filter({ hasText: 'Please fix the highlighted fields.' }),
  ).toBeVisible()

  await page.getByLabel('Title').fill('Synthetic chicken rice lunch set')
  await page.getByLabel('Description').fill('Rice, chicken and soup.')
  await chooseOption(page.getByRole('combobox', { name: 'Category' }), 'FOOD')
  await chooseOption(page.getByRole('combobox', { name: 'Cuisine' }), 'CHINESE')
  await page.getByRole('radio', { name: 'Fixed price' }).check()
  await page.getByLabel('Deal price ($)').fill('4.5')
  await next(page)

  await next(page)
  await expect(page.getByText('Please choose at least one outlet.')).toBeVisible()
  await page.getByRole('checkbox', { name: OUTLETS[1]?.name }).check()
  await next(page)
  await page.getByLabel('Last day').fill(day(7))
  await page.getByLabel('Terms & conditions').fill('Weekdays only')
  await next(page)
  await page.getByRole('button', { name: 'Save deal' }).click()

  await expect(page).toHaveURL(/\/merchant$/)
  await expect(notice(page)).toContainText('"Synthetic chicken rice lunch set" is now live.')
  expect(lastBody(backend, 'POST', '/api/merchant/deals')).toMatchObject({
    title: 'Synthetic chicken rice lunch set',
    outletIds: [OUTLETS[1]?.id],
    offerType: 'FIXED_PRICE',
    priceCents: 450,
    endDate: day(7),
    terms: 'Weekdays only',
  })
  const live = card(page, 'Synthetic chicken rice lunch set')
  await expect(live).toContainText('Live')
  await expect(live).toContainText(`At: ${OUTLETS[1]?.name}`)
  await expect(page.getByTestId('stat-live')).toContainText('1')

  await live.getByRole('button', { name: /End deal/ }).click()
  await confirm(page, 'End this deal?')
  await expect(notice(page)).toContainText('has ended.')
  await expect(live).toHaveCount(0)
  await page.getByTestId('tab-ended').click()
  await expect(card(page, 'Synthetic chicken rice lunch set')).toContainText('Ended')
})

test('a merchant schedules a deal, edits it, then deletes it', async ({ page }) => {
  const scheduled = merchantDeal(hex(50), {
    title: 'Synthetic weekend duck rice',
    startDate: day(5),
    endDate: day(12),
  })
  const backend = await fakeMerchant(page, [scheduled])
  await openDashboard(page)

  await page.getByTestId('filter-scheduled').click()
  const deal = card(page, 'Synthetic weekend duck rice')
  await expect(deal).toContainText('Scheduled')
  await expect(page.getByTestId('stat-coming-up')).toContainText('1')

  await deal.getByRole('button', { name: /^Edit/ }).click()
  await expect(page).toHaveURL(new RegExp(`/merchant/deals/${scheduled.id}/edit$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Edit deal' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Synthetic weekend duck rice')
  await page.getByLabel('Title').fill('Synthetic weekend roast duck rice')
  await page.getByTestId('step-review').click()
  await page.getByRole('button', { name: 'Save deal' }).click()

  await expect(notice(page)).toContainText('"Synthetic weekend roast duck rice" was updated.')
  expect(lastBody(backend, 'PATCH', /\/api\/merchant\/deals\//)).toMatchObject({
    title: 'Synthetic weekend roast duck rice',
    startDate: day(5),
    endDate: day(12),
  })
  const edited = card(page, 'Synthetic weekend roast duck rice')
  await edited.getByRole('button', { name: /Delete/ }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(edited).toHaveCount(1)
  await edited.getByRole('button', { name: /Delete/ }).click()
  await confirm(page, 'Delete this deal?')
  await expect(notice(page)).toContainText('was deleted.')
  await expect(edited).toHaveCount(0)
})

test('a merchant runs an ended deal again with new dates', async ({ page }) => {
  const ended = merchantDeal(hex(60), {
    title: 'Synthetic CNY yusheng set',
    outletIds: [hex(1), hex(2)],
  })
  const backend = await fakeMerchant(page, [ended])
  await openDashboard(page)

  await page.getByTestId('tab-ended').click()
  await card(page, 'Synthetic CNY yusheng set')
    .getByRole('button', { name: /Run it again/ })
    .click()
  await expect(page).toHaveURL(new RegExp(`/merchant/deals/${ended.id}/run-again$`))
  await expect(page.getByText('Copied from "Synthetic CNY yusheng set".')).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Synthetic CNY yusheng set')

  await page.getByTestId('step-validity').click()
  await expect(page.getByLabel('Start date')).toHaveValue('')
  await expect(page.getByLabel('Last day')).toHaveValue('')
  await page.getByLabel('Last day').fill(day(10))
  await page.getByTestId('step-review').click()
  await page.getByRole('button', { name: 'Save deal' }).click()

  await expect(notice(page)).toContainText('"Synthetic CNY yusheng set" is now live.')
  expect(lastBody(backend, 'POST', '/api/merchant/deals')).toMatchObject({
    title: 'Synthetic CNY yusheng set',
    outletIds: [hex(1), hex(2)],
    startDate: '',
    endDate: day(10),
  })
  expect(backend.callsTo('PATCH', /\/api\/merchant\/deals\//)).toHaveLength(0)
  await expect(card(page, 'Synthetic CNY yusheng set')).toContainText('Live')
  await page.getByTestId('tab-ended').click()
  await expect(card(page, 'Synthetic CNY yusheng set')).toContainText('Ended')
})
