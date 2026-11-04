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
  await page.getByRole('button', { name: '+ New deal' }).click()
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


const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('zz screenshot stepped merchant form', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await signInAsMerchant(page)
  await page.getByRole('button', { name: '+ New deal' }).click()
  await page.getByLabel('Title').fill('Synthetic roast chicken rice')
  await page.locator('form.deal-form').screenshot({ path: '/private/tmp/claude-501/-Users-damien-Documents-Y2S1-IS216-Web-Application-Development-II-broke-oclock/abaaaa21-87ac-4bba-8f53-150f71df06d8/scratchpad/e2e-shots/step-details.png' })
  const zone = page.getByTestId('photo-drop')
  const dt = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const d = new DataTransfer()
    d.items.add(new File([bytes], 'promo.png', { type: 'image/png' }))
    return d
  }, PNG)
  await zone.dispatchEvent('dragenter', { dataTransfer: dt })
  await zone.screenshot({ path: '/private/tmp/claude-501/-Users-damien-Documents-Y2S1-IS216-Web-Application-Development-II-broke-oclock/abaaaa21-87ac-4bba-8f53-150f71df06d8/scratchpad/e2e-shots/drop-dragging.png' })
  await zone.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.locator('.deal-form__photo img')).toHaveCount(1)
  await expect(zone).toContainText('Drag a new photo here')
  await zone.screenshot({ path: '/private/tmp/claude-501/-Users-damien-Documents-Y2S1-IS216-Web-Application-Development-II-broke-oclock/abaaaa21-87ac-4bba-8f53-150f71df06d8/scratchpad/e2e-shots/drop-after.png' })
  await fillDeal(page, 'Synthetic roast chicken rice')
  await page.locator('form.deal-form').screenshot({ path: '/private/tmp/claude-501/-Users-damien-Documents-Y2S1-IS216-Web-Application-Development-II-broke-oclock/abaaaa21-87ac-4bba-8f53-150f71df06d8/scratchpad/e2e-shots/step-review.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('step-details').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-damien-Documents-Y2S1-IS216-Web-Application-Development-II-broke-oclock/abaaaa21-87ac-4bba-8f53-150f71df06d8/scratchpad/e2e-shots/phone-step.png' })
})
