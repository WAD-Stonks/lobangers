import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, type Backend, fakeBackend, hex } from './fake-backend'

const MEMBER = account('USER', { name: 'Synthetic Priya' })
const STALL = {
  id: hex(301),
  name: 'Synthetic Ah Seng Chicken Rice',
  merchantName: 'Synthetic Ah Seng',
  address: '1 Synthetic Hawker Centre, #01-10',
}
const PLACE = {
  placeId: 'synthetic-place-1',
  name: 'Synthetic Teh Tarik Corner',
  address: '9 Synthetic Road, Singapore 400009',
  latitude: 1.3236,
  longitude: 103.9273,
  stall: null,
}
const PHOTO_KEY = 'synthetic-photo-key'
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const localDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA')
const shownDay = (day: string) =>
  new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
const START = localDay(0)
const END = localDay(14)

type Upload = 'works' | 'fails'

const fakeAddDeal = async (page: Page, { upload = 'works' as Upload, user = MEMBER } = {}) => {
  const backend = await fakeBackend(page, { user })
  const submissions: Record<string, unknown>[] = []
  backend.on('GET', '/api/deals/stalls', ({ query }) => ({
    json: (query.get('search') ?? '').toLowerCase().includes('chicken') ? [STALL] : [],
  }))
  backend.on('GET', '/api/deals/places', () => ({ json: [PLACE] }))
  backend.on('POST', '/api/deals/stalls', ({ body }) => ({
    status: 201,
    json: {
      id: hex(302),
      name: body.merchantName,
      merchantName: body.merchantName,
      address: PLACE.address,
    },
  }))
  backend.on('POST', '/api/uploadthing', ({ query }) => {
    if (upload === 'fails')
      return { status: 503, json: { message: 'Photo storage is not configured' } }
    expect(query.get('slug')).toBe('photoUploader')
    const origin = new URL(page.url()).origin
    return { json: [{ key: PHOTO_KEY, url: `${origin}/fake-ingest/${PHOTO_KEY}`, customId: null }] }
  })
  await page.route('**/fake-ingest/**', (route) =>
    route.request().method() === 'HEAD'
      ? route.fulfill({ status: 200, headers: { 'x-ut-range-start': '0' }, body: '' })
      : route.fulfill({
          json: {
            url: `https://synthetic.ufs.invalid/f/${PHOTO_KEY}`,
            ufsUrl: `https://synthetic.ufs.invalid/f/${PHOTO_KEY}`,
            appUrl: `https://synthetic.ufs.invalid/f/${PHOTO_KEY}`,
            fileHash: 'synthetic-hash',
            serverData: { uploadedBy: user.id },
          },
        }),
  )
  backend.on('POST', '/api/deals', ({ body }) => {
    submissions.unshift({
      id: hex(400 + submissions.length),
      title: body.title,
      description: body.description,
      category: body.category,
      cuisine: body.cuisine,
      offerType: body.offerType,
      discountPercent: body.discountPercent,
      priceCents: body.priceCents,
      startDate: body.startDate,
      endDate: body.endDate,
      terms: body.terms,
      photoUrl: null,
      stalls: [STALL].filter((stall) => body.stallIds.includes(stall.id)),
      reviewStatus: 'PENDING',
      reviewNote: null,
      deletable: true,
      createdAt: new Date().toISOString(),
    })
    return { status: 201, json: { id: submissions[0]?.id } }
  })
  backend.on('GET', '/api/account/submissions', () => ({
    json: { items: submissions, nextCursor: null },
  }))
  backend.on('DELETE', /^\/api\/account\/submissions\/[0-9a-f]{24}$/, ({ path }) => {
    const index = submissions.findIndex((item) => path.endsWith(String(item.id)))
    submissions.splice(index, 1)
    return { json: { deleted: true } }
  })
  return backend
}

const STEPS = ['Deal details', 'Location', 'Validity', 'Review'] as const
const step = (page: Page, index: number) =>
  page.getByRole('region', { name: STEPS[index], exact: true })
const next = (page: Page) => page.getByTestId('add-deal-next').click()

const fillDetails = async (page: Page) => {
  await page.getByLabel('Title').fill('Synthetic 1-for-1 roast chicken rice')
  await page.getByLabel('Description').fill('Buy one plate, get the second free.')
  await chooseOption(page.getByRole('combobox', { name: 'Category' }), 'FOOD')
  await chooseOption(page.getByRole('combobox', { name: 'Cuisine' }), 'CHINESE')
  await page.getByTestId('offer-BUY_ONE_GET_ONE').check()
  await page.getByLabel('Photo of the deal').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  })
  await expect(step(page, 0).getByRole('img', { name: 'Your chosen deal' })).toBeVisible()
}

const fillValidity = async (page: Page) => {
  await page.getByLabel('Start date').fill(START)
  await page.getByLabel('Last day').fill(END)
  await page.getByLabel('Terms & conditions').fill('Dine-in only\nWhile stocks last')
}

const reviewRow = (page: Page, term: string) =>
  step(page, 3)
    .locator('dl > div')
    .filter({ has: page.getByRole('term').filter({ hasText: term }) })
    .getByRole('definition')

const submitted = (backend: Backend) => backend.callsTo('POST', '/api/deals')

test('a member adds a deal at a listed stall and finds it in their submissions', async ({
  page,
}) => {
  const backend = await fakeAddDeal(page)
  await page.goto('/add')
  await expect(page.getByRole('heading', { level: 1, name: 'Add a deal' })).toBeVisible()

  await next(page)
  await expect(page.getByRole('alert')).toHaveText('Please fix the highlighted fields.')
  await expect(page.getByText('Please give the deal a title.')).toBeVisible()
  await expect(page.getByText('Please add a photo of the deal.')).toBeVisible()
  await expect(page.getByLabel('Title')).toBeFocused()

  await page.getByLabel('Photo of the deal').setInputFiles({
    name: 'poster.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a'),
  })
  await expect(page.getByText('Please choose a JPEG, PNG or WebP image.')).toBeVisible()
  await fillDetails(page)
  await next(page)

  await expect(page.getByRole('heading', { level: 2, name: 'Location' })).toBeFocused()
  await next(page)
  await expect(page.getByText('Please add the stall.')).toBeVisible()
  await page.getByLabel('Find the stall').fill('chicken')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const result = step(page, 1).getByRole('listitem').filter({ hasText: STALL.name })
  await result.getByRole('button', { name: 'Add' }).click()
  await expect(result.getByRole('button', { name: 'Added' })).toBeDisabled()
  await expect(page.getByRole('list', { name: 'Stall added' })).toContainText(STALL.address)
  await next(page)

  await expect(page.getByRole('heading', { level: 2, name: 'Validity' })).toBeFocused()
  await page.getByLabel('Start date').fill(END)
  await page.getByLabel('Last day').fill(START)
  await page.getByLabel('Terms & conditions').fill('Dine-in only')
  await next(page)
  await expect(page.getByText('The last day cannot be before the start date.')).toBeVisible()
  await fillValidity(page)
  await next(page)

  await expect(page.getByRole('heading', { level: 2, name: 'Review' })).toBeFocused()
  await expect(reviewRow(page, 'Title')).toHaveText('Synthetic 1-for-1 roast chicken rice')
  await expect(reviewRow(page, 'Offer')).toHaveText('1-for-1')
  await expect(reviewRow(page, 'Stall')).toHaveText(STALL.name)
  await expect(reviewRow(page, 'Runs')).toHaveText(`${shownDay(START)} to ${shownDay(END)}`)

  await page.getByTestId('review-edit-0').click()
  await expect(page.getByRole('heading', { level: 2, name: 'Deal details' })).toBeFocused()
  await page.getByTestId('offer-PERCENT_OFF').check()
  await page.getByLabel('Discount (%)').fill('30')
  await page.getByTestId('step-review').click()
  await expect(reviewRow(page, 'Offer')).toHaveText('30% off')

  await page.getByRole('button', { name: 'Submit deal' }).click()
  await expect(page).toHaveURL(/\/me\/submissions/)
  await expect(
    page.getByRole('status').filter({ hasText: 'Thanks! Your deal is submitted' }),
  ).toBeVisible()
  expect(submitted(backend).at(-1)?.body).toEqual({
    title: 'Synthetic 1-for-1 roast chicken rice',
    description: 'Buy one plate, get the second free.',
    category: 'FOOD',
    cuisine: 'CHINESE',
    offerType: 'PERCENT_OFF',
    discountPercent: 30,
    priceCents: null,
    stallIds: [STALL.id],
    startDate: START,
    endDate: END,
    terms: 'Dine-in only\nWhile stocks last',
    photoKey: PHOTO_KEY,
  })

  const card = page.getByRole('heading', { level: 2, name: 'Synthetic 1-for-1 roast chicken rice' })
  await expect(card).toBeVisible()
  await expect(page.getByText('Awaiting review')).toBeVisible()
})

test('a stall that is not listed yet is added from the map', async ({ page }) => {
  const backend = await fakeAddDeal(page)
  await page.goto('/add')
  await fillDetails(page)
  await next(page)

  await page.getByLabel('Find the stall').fill('teh tarik')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText('No existing stalls found.')).toBeVisible()
  await page.getByRole('button', { name: 'Add new stall' }).click()
  await page.getByLabel('Find it on Google Maps').fill('teh tarik bedok')
  await page.getByLabel('Find it on Google Maps').press('Enter')
  await page
    .getByRole('list', { name: 'Places found' })
    .getByRole('button', { name: new RegExp(PLACE.name) })
    .click()
  await page.getByRole('button', { name: 'Add as a new stall' }).click()

  await expect(page.getByText(`${PLACE.name} is added to this deal.`)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Stall added' })).toContainText(PLACE.name)
  expect(backend.callsTo('POST', '/api/deals/stalls').at(-1)?.body).toEqual({
    placeId: PLACE.placeId,
    merchantName: PLACE.name,
  })
  await next(page)
  await expect(page.getByRole('heading', { level: 2, name: 'Validity' })).toBeFocused()
})

test('a failed photo upload keeps the deal so the member can try again', async ({ page }) => {
  const backend = await fakeAddDeal(page, { upload: 'fails' })
  await page.goto('/add')
  await fillDetails(page)
  await next(page)
  await page.getByLabel('Find the stall').fill('chicken')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await step(page, 1).getByRole('button', { name: 'Add', exact: true }).click()
  await next(page)
  await fillValidity(page)
  await next(page)
  await page.getByRole('button', { name: 'Submit deal' }).click()

  const popup = page.getByRole('dialog', { name: 'Could not submit' })
  await expect(popup).toContainText('Could not upload the photo. Please try again.')
  await popup.getByRole('button', { name: 'OK' }).click()
  await expect(page).toHaveURL(/\/add$/)
  await expect(reviewRow(page, 'Title')).toHaveText('Synthetic 1-for-1 roast chicken rice')
  expect(submitted(backend)).toHaveLength(0)
})

test('a member deletes a submission that is still awaiting review', async ({ page }) => {
  await fakeAddDeal(page)
  await page.goto('/add')
  await fillDetails(page)
  await next(page)
  await page.getByLabel('Find the stall').fill('chicken')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await step(page, 1).getByRole('button', { name: 'Add', exact: true }).click()
  await next(page)
  await fillValidity(page)
  await next(page)
  await page.getByRole('button', { name: 'Submit deal' }).click()
  await expect(page).toHaveURL(/\/me\/submissions/)

  await page.getByRole('button', { name: 'Synthetic 1-for-1 roast chicken rice' }).click()
  const details = page.getByRole('dialog')
  await expect(details).toContainText(STALL.name)
  await expect(details).toContainText('You can still delete it.')
  await details.getByRole('button', { name: /Delete/ }).click()
  await details.getByRole('button', { name: 'Keep it' }).click()
  await details.getByRole('button', { name: /Delete/ }).click()
  await expect(details).toContainText('Delete this deal? It will not be reviewed')
  await details.getByRole('button', { name: 'Yes, delete' }).click()

  await expect(page.getByText("You haven't submitted any deals yet.")).toBeVisible()
})

test('a signed-out visitor who taps Share is asked to log in, then can add a deal', async ({
  page,
}) => {
  const backend = await fakeAddDeal(page, { user: MEMBER })
  backend.signOut()
  backend.on('POST', '/api/auth/sign-in/email', () => {
    backend.signIn(MEMBER)
    return { json: { redirect: false, token: 'synthetic-token', user: MEMBER } }
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/browse')
  await expect(page.getByTestId('splash-screen')).toBeHidden()

  await page.getByTestId('map-share').click()
  await expect(page.getByRole('heading', { level: 2, name: 'Share good lobangs' })).toBeFocused()
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fadd/)
  await page.getByLabel('Email', { exact: true }).fill(MEMBER.email)
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-1')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('button', { name: `Account menu for ${MEMBER.name}` })).toBeVisible()

  await page.getByRole('banner').getByRole('link', { name: 'Map' }).click()
  await page.getByTestId('map-share').click()
  await expect(page).toHaveURL(/\/add\?/)
  await expect(page.getByRole('heading', { level: 1, name: 'Add a deal' })).toBeVisible()
})
