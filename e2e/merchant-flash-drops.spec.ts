import type { MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { expect, type Page, test } from '@playwright/test'

// Merchant flash deal journeys on /merchant: "Save as flash deal" in the deal form makes a
// draft, Go live sends it out, and End now stops it. The server is a synthetic boundary that
// keeps flash deals in memory; server rules are proved in the API integration suite. Every
// account, outlet and deal below is a labelled synthetic fixture; nothing touches real data.
const now = new Date().toISOString()
const SYNTHETIC_MERCHANT = {
  id: 'e'.repeat(24),
  name: 'Synthetic merchant (test fixture)',
  email: 'synthetic-merchant@example.test',
  emailVerified: true,
  role: 'MERCHANT',
  createdAt: now,
  updatedAt: now,
}
const SYNTHETIC_SESSION = {
  id: 'synthetic-merchant-session',
  userId: SYNTHETIC_MERCHANT.id,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: now,
  updatedAt: now,
}

const hex = (n: number) => n.toString(16).padStart(24, '0')
// Two branches of one synthetic franchise.
const SYNTHETIC_OUTLETS = [
  { id: hex(1), name: 'Ah Seng Chicken Rice (Maxwell)', address: '1 Kadayanallur St, #01-10' },
  { id: hex(2), name: 'Ah Seng Chicken Rice (Tiong Bahru)', address: '30 Seng Poh Rd, #02-05' },
]

type Body = Record<string, unknown> & {
  title: string
  outletId: string
  offerType: MerchantFlashDrop['offerType']
  discountPercent: number | null
  priceCents: number | null
  usualPriceCents: number | null
  startsAt: string | null
  durationMinutes: number
  codeValidity: MerchantFlashDrop['codeValidity']
  radiusMetres: number
  codeLimit: number
}

// What the server would answer for a saved draft.
const toDrop = (id: string, body: Body, version: number): MerchantFlashDrop => {
  const startsAt = body.startsAt ?? new Date().toISOString()
  return {
    id,
    dealId: hex(500 + Number.parseInt(id, 16)),
    dealTitle: body.title,
    outletId: body.outletId,
    outletName: SYNTHETIC_OUTLETS.find((outlet) => outlet.id === body.outletId)?.name ?? '',
    // The form's own offer is the flash offer.
    offerType: body.offerType,
    discountPercent: body.discountPercent,
    flashPriceCents: body.priceCents,
    usualPriceCents: body.usualPriceCents,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + body.durationMinutes * 60_000).toISOString(),
    codeValidity: body.codeValidity,
    codesExpireAt: new Date(
      Date.parse(startsAt) + body.durationMinutes * 60_000 + 2 * 3_600_000,
    ).toISOString(),
    radiusMetres: body.radiusMetres,
    codeLimit: body.codeLimit,
    claimedCount: 0,
    status: 'DRAFT',
    reviewNote: null,
    version,
    demo: false,
    startsOnGoLive: body.startsAt === null,
    deal: {
      title: body.title,
      description: String(body.description),
      category: String(body.category),
      cuisine: (body.cuisine as string | null) ?? null,
      offerType: body.offerType as MerchantFlashDrop['deal']['offerType'],
      discountPercent: (body.discountPercent as number | null) ?? null,
      priceCents: body.priceCents,
      terms: String(body.terms),
      photo: null,
    },
  }
}

const SAVED_DRAFT = toDrop(
  hex(90),
  {
    title: 'Synthetic steamed chicken rice set',
    description: 'Fake deal for tests.',
    category: 'FOOD',
    cuisine: 'CHINESE',
    offerType: 'FIXED_PRICE',
    discountPercent: null,
    priceCents: 250,
    usualPriceCents: 350,
    terms: '',
    outletId: hex(1),
    startsAt: null,
    durationMinutes: 30,
    codeValidity: 'END_OF_DAY',
    radiusMetres: 500,
    codeLimit: 40,
  },
  1,
)

type Boundary = { requests: { method: string; path: string; body: unknown }[] }

const signInAsMerchant = async (page: Page, drafts: MerchantFlashDrop[] = []) => {
  let drops = [...drafts]
  let nextId = 100
  const state: Boundary = { requests: [] }
  await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
  await page.route('**/api/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : undefined
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data })
    if (path.startsWith('/api/auth/get-session'))
      return json({ user: SYNTHETIC_MERCHANT, session: SYNTHETIC_SESSION })
    if (path === '/api/me')
      return json({ user: SYNTHETIC_MERCHANT, session: { expiresAt: SYNTHETIC_SESSION.expiresAt } })
    if (path === '/api/merchant/outlets') return json({ items: SYNTHETIC_OUTLETS })
    if (path === '/api/merchant/deals') return json({ items: [] })
    // No Pusher here, as on a server without it: the dashboard polls.
    if (path === '/api/flash-drops/realtime') return json({ pusher: null })
    if (path.startsWith('/api/merchant/flash-drops')) state.requests.push({ method, path, body })
    if (path === '/api/merchant/flash-drops' && method === 'GET') return json({ items: drops })
    if (path === '/api/merchant/flash-drops' && method === 'POST') {
      const created = toDrop(hex(nextId++), body as Body, 1)
      drops = [created, ...drops]
      return json(created, 201)
    }
    const one = path.match(/^\/api\/merchant\/flash-drops\/([0-9a-f]{24})(\/go-live|\/end)?$/)
    const current = one ? drops.find((drop) => drop.id === one[1]) : undefined
    if (one && current) {
      const replace = (next: MerchantFlashDrop) => {
        drops = drops.map((drop) => (drop.id === next.id ? next : drop))
        return json(next)
      }
      if (!one[2] && method === 'PUT')
        return replace(toDrop(current.id, body as Body, current.version + 1))
      if (!one[2] && method === 'DELETE') {
        drops = drops.filter((drop) => drop.id !== current.id)
        return route.fulfill({ status: 204, body: '' })
      }
      if (one[2] === '/go-live')
        return replace({
          ...current,
          status: 'LIVE',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          version: current.version + 1,
        })
      if (one[2] === '/end')
        return replace({ ...current, status: 'ENDED', version: current.version + 1 })
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
  })
  // Go live, Delete and End now ask in the app's own dialog, never the browser's.
  page.on('dialog', () => {
    throw new Error('The browser confirm should not be used')
  })
  await page.goto('/merchant')
  await expect(page.getByRole('heading', { name: 'Merchant dashboard' })).toBeVisible()
  return state
}

// Confirms the app's own dialog, checking its title first.
const confirmDialog = async (page: Page, title: string) => {
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
  await dialog.getByTestId('confirm-dialog-confirm').click()
  await expect(dialog).toHaveCount(0)
}

const dropCard = (page: Page, text: string) =>
  page.locator('[data-testid^="flash-drop-"]').filter({ hasText: text })

// Fills the ordinary part of the deal form, step by step, and stops on the review: a $4.00
// deal at the Maxwell branch.
const fillDeal = async (page: Page, title: string) => {
  await page.getByRole('button', { name: 'Add a deal' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill('Fake deal for tests.')
  for (const [label, value] of [
    ['Category', 'FOOD'],
    ['Cuisine', 'CHINESE'],
  ] as const) {
    await page.getByLabel(label).click()
    await page.locator(`[role="option"][data-value="${value}"]`).click()
  }
  await page.getByRole('radio', { name: 'Fixed price' }).check()
  await page.getByLabel('Deal price ($)').fill('4')
  await page.getByRole('button', { name: 'Next: Outlets' }).click()
  await page.getByRole('checkbox', { name: 'Ah Seng Chicken Rice (Maxwell)' }).check()
  await page.getByRole('button', { name: 'Next: Validity' }).click()
  await page.getByRole('button', { name: 'Next: Review' }).click()
}

test('save a flash deal as a draft, send it live and end it early', async ({ page }) => {
  const state = await signInAsMerchant(page)
  await page.getByRole('tab', { name: /Flash deals/ }).click()
  await expect(page.getByText('No drafts.', { exact: false })).toBeVisible()
  await expect(page.getByText('Fake flash drops')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Flash drop this/ })).toHaveCount(0)

  await fillDeal(page, 'Synthetic roast chicken rice')
  // On the review, "Save as flash deal" opens the flash timing step in place of the dates.
  await page.getByRole('button', { name: 'Save as flash deal' }).click()
  await expect(page.getByRole('heading', { name: 'New flash deal' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Flash timing' })).toBeVisible()
  await expect(page.getByLabel('Start date (optional)')).toHaveCount(0)

  // The form's offer is now the flash offer, set on the first step.
  await page.getByTestId('step-details').click()
  await expect(page.getByRole('radiogroup', { name: 'Flash offer' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Fixed price' })).toBeChecked()
  await page.getByLabel('Flash price ($)').fill('1.20')

  // A usual price is optional but must be higher; the timing step checks it before the review.
  await page.getByTestId('step-validity').click()
  await page.getByLabel('Usual price ($, optional)').fill('1')
  await page.getByRole('button', { name: 'Next: Review' }).click()
  await expect(
    page.getByText('The usual price has to be higher than the flash price of $1.20.'),
  ).toBeVisible()
  await page.getByLabel('Usual price ($, optional)').fill('4')
  await page.getByText('15 min', { exact: true }).click()
  await expect(page.getByTestId('flash-preview')).toHaveText(
    'FLASH DROP · $1.20 Synthetic roast chicken rice · 15:00 · 500 m circle',
  )
  await page.getByRole('button', { name: 'Next: Review' }).click()
  await page.getByRole('button', { name: 'Save as flash deal' }).click()

  // Saving goes back to the dashboard's Flash deals tab.
  await expect(page).toHaveURL(/\/merchant\?tab=flash$/)
  await expect(page.getByRole('status').filter({ hasText: 'was saved as a draft' })).toBeVisible()
  const draft = dropCard(page, 'Synthetic roast chicken rice')
  await expect(draft.locator('.merchant-card__badge')).toHaveText('Draft')
  await expect(draft).toContainText('Nobody can see it yet')
  const saved = state.requests.find((entry) => entry.method === 'POST')
  expect(saved?.body).toMatchObject({
    title: 'Synthetic roast chicken rice',
    outletId: hex(1),
    offerType: 'FIXED_PRICE',
    priceCents: 120,
    usualPriceCents: 400,
    startsAt: null,
    durationMinutes: 15,
  })

  await draft.getByRole('button', { name: /Go live/ }).click()
  await confirmDialog(page, 'Send this flash deal live?')
  await expect(page.getByRole('status')).toContainText('is live now')
  await expect(draft.locator('.merchant-card__badge')).toHaveText('Live')
  await expect(draft).toContainText('0 of 40 claimed')

  await draft.getByRole('button', { name: /End now/ }).click()
  await confirmDialog(page, 'End this flash deal?')
  await expect(draft.locator('.merchant-card__badge')).toHaveText('Ended')
  await expect(page.getByRole('status')).toContainText('has ended')

  // A past flash deal can be deleted from the history.
  await draft.getByRole('button', { name: /Delete/ }).click()
  await confirmDialog(page, 'Delete this flash deal?')
  await expect(page.getByRole('status')).toContainText('was deleted from your past flash deals')
  await expect(draft).toHaveCount(0)
})

test('edit a draft in the deal form, then delete it', async ({ page }) => {
  const state = await signInAsMerchant(page, [SAVED_DRAFT])
  await page.getByRole('tab', { name: /Flash deals/ }).click()
  const draft = dropCard(page, 'Synthetic steamed chicken rice set')
  await expect(draft.locator('.merchant-card__badge')).toHaveText('Draft')
  await expect(draft).toContainText('Starts at Go live')

  await draft.getByRole('button', { name: /^Edit/ }).click()
  // The draft opens on its own address.
  await expect(page).toHaveURL(new RegExp(`/merchant/flash/${SAVED_DRAFT.id}/edit$`))
  await expect(page.getByRole('heading', { name: 'Edit flash deal draft' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Synthetic steamed chicken rice set')
  await expect(page.getByLabel('Flash price ($)')).toHaveValue('2.5')
  await page.getByLabel('Title').fill('Synthetic duck rice set')
  // A saved draft can open any step straight from the stepper.
  await page.getByTestId('step-validity').click()
  await page.getByText('1 km', { exact: true }).click()
  await page.getByTestId('step-review').click()
  await page.getByRole('button', { name: 'Save draft' }).click()

  // Back on the dashboard, while the flash deals reload.
  await expect(page.getByRole('status').filter({ hasText: 'was updated' })).toBeVisible()
  const edited = dropCard(page, 'Synthetic duck rice set')
  await expect(edited).toContainText('1 km')
  expect(state.requests.find((entry) => entry.method === 'PUT')?.body).toMatchObject({
    title: 'Synthetic duck rice set',
    radiusMetres: 1000,
    version: 1,
  })

  await edited.getByRole('button', { name: /Delete draft/ }).click()
  // Escape keeps the draft; confirming deletes it.
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(edited).toHaveCount(1)
  await edited.getByRole('button', { name: /Delete draft/ }).click()
  await confirmDialog(page, 'Delete this draft?')
  await expect(page.getByRole('status')).toContainText('was deleted')
  await expect(edited).toHaveCount(0)
})
