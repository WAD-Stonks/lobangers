import type { CatalogueVenueDetail } from '@broke-oclock/contracts/admin-catalogue'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend, hex } from './fake-backend'

const ADMIN = account('ADMIN', { name: 'Synthetic operator' })
const MERCHANT = {
  id: hex(61),
  name: 'Synthetic Ah Seng',
  version: 0,
  archived: false,
  venueCount: 1,
  dealCount: 2,
}
const OUTLET: CatalogueVenueDetail = {
  id: hex(62),
  merchantId: MERCHANT.id,
  merchantName: MERCHANT.name,
  parentArchived: false,
  name: 'Synthetic Ah Seng (Maxwell)',
  address: '1 Synthetic Kadayanallur St, #01-10',
  postalCode: '069184',
  area: 'Tanjong Pagar',
  latitude: 1.2803,
  longitude: 103.8448,
  imageUrl: null,
  geographyPrecision: 'OUTLET',
  catalogueKey: 'synthetic-ah-seng-069184',
  version: 0,
  archived: false,
  selectable: false,
  geographyVerified: false,
  occupancyVerified: false,
  geographyState: 'UNVERIFIED',
  occupancyState: 'UNVERIFIED',
  dealCount: 2,
  grantCount: 0,
  requestCount: 0,
  evidence: [],
  evidenceTruncated: false,
}

const fakeCatalogue = async (page: Page) => {
  const backend = await fakeBackend(page, { user: ADMIN })
  let outlet = structuredClone(OUTLET)
  const conflict = {
    status: 409,
    json: { error: { code: 'CONFLICT', message: 'Version changed' } },
  }
  const row = () => {
    const { evidence: _evidence, evidenceTruncated: _truncated, ...summary } = outlet
    return summary
  }
  const needsWork = () => !outlet.occupancyVerified || !outlet.geographyVerified
  backend.on('GET', '/api/admin/catalogue/summary', () => ({
    json: {
      needsVerification: needsWork() ? 1 : 0,
      needsVerificationWithDeals: needsWork() ? 1 : 0,
    },
  }))
  backend.on('GET', '/api/admin/catalogue/merchants', () => ({
    json: { items: [MERCHANT], nextCursor: null },
  }))
  backend.on('GET', `/api/admin/catalogue/merchants/${MERCHANT.id}`, () => ({ json: MERCHANT }))
  backend.on('GET', '/api/admin/catalogue/venues', ({ query }) => ({
    json: {
      items: query.get('verification') === 'needed' && !needsWork() ? [] : [row()],
      nextCursor: null,
    },
  }))
  backend.on('GET', `/api/admin/catalogue/venues/${OUTLET.id}`, () => ({ json: outlet }))
  backend.on('POST', `/api/admin/catalogue/venues/${OUTLET.id}/evidence`, ({ body }) => {
    if (body.expectedVersion !== outlet.version) return conflict
    const occupancy = body.kind === 'OCCUPANCY'
    outlet = {
      ...outlet,
      version: outlet.version + 1,
      ...(occupancy
        ? { occupancyVerified: true, occupancyState: 'VERIFIED', selectable: true }
        : { geographyVerified: true, geographyState: 'VERIFIED' }),
      evidence: [
        {
          id: hex(700 + outlet.evidence.length),
          kind: body.kind,
          subjectHash: 'synthetic-hash',
          provider: body.sourceType === 'ADMIN_VERIFIED' ? 'ADMIN' : body.sourceType,
          reference: body.reference,
          sourceUrl: body.sourceUrl ?? null,
          statement: body.statement,
          observedAt: null,
          recordedAt: new Date().toISOString(),
          catalogueVersion: outlet.version + 1,
          actorName: ADMIN.name,
        },
        ...outlet.evidence,
      ],
    }
    return { json: { id: outlet.id, version: outlet.version } }
  })
  backend.on('PATCH', `/api/admin/catalogue/venues/${OUTLET.id}`, ({ body }) => {
    if (body.expectedVersion !== outlet.version) return conflict
    const { note: _note, confirmed: _confirmed, expectedVersion: _version, ...changes } = body
    outlet = { ...outlet, ...changes, version: outlet.version + 1 }
    return { json: { id: outlet.id, version: outlet.version } }
  })
  return backend
}

const views = (page: Page) => page.getByRole('tablist', { name: 'Merchants and outlets views' })
const readiness = (page: Page) =>
  page
    .getByRole('status')
    .filter({ hasText: /Not ready for deals|Deals can pick this outlet|Ready for deals/ })
const verify = async (
  page: Page,
  check: 'occupancy' | 'location',
  source: string,
  statement: string,
) => {
  await page.getByRole('button', { name: `Verify ${check}` }).click()
  const editor = page.getByRole('region', { name: `Verify ${check}` })
  await editor.getByRole('radio', { name: new RegExp(source) }).check()
  await editor.getByLabel('Source', { exact: true }).fill('Synthetic store locator page')
  await editor.getByLabel('What it shows').fill(statement)
  await editor.getByLabel('Reason').fill('New outlet, first check')
  await editor.getByRole('checkbox', { name: /I checked this source myself/ }).check()
  await editor.getByRole('button', { name: `Record ${check} check` }).click()
}

test('an admin verifies an outlet from the to-verify queue until it is ready for deals', async ({
  page,
}) => {
  const backend = await fakeCatalogue(page)
  await page.goto('/admin/catalogue')

  await expect(views(page).getByRole('tab', { name: 'To verify (1)' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('button', { name: OUTLET.name }).click()
  await expect(readiness(page)).toContainText('Not ready for deals')

  await verify(page, 'occupancy', 'Merchant website or app', 'The store locator lists this unit.')
  await expect(readiness(page)).toContainText('Deals can pick this outlet')
  expect(backend.callsTo('POST', /\/evidence$/).at(-1)?.body).toMatchObject({
    expectedVersion: 0,
    kind: 'OCCUPANCY',
    sourceType: 'OFFICIAL_MERCHANT',
    reviewedSource: true,
    confirmed: true,
  })

  await verify(
    page,
    'location',
    'Another source I checked',
    'Visited the hawker centre and saw the stall.',
  )
  await expect(readiness(page)).toContainText('Ready for deals')
  expect(backend.callsTo('POST', /\/evidence$/).at(-1)?.body).toMatchObject({
    expectedVersion: 1,
    kind: 'GEOGRAPHY',
  })

  await page.reload()
  await expect(views(page).getByRole('tab', { name: 'To verify (0)' })).toBeVisible()
})

test('an admin corrects an outlet name and sees the change before saving it', async ({ page }) => {
  const backend = await fakeCatalogue(page)
  await page.goto('/admin/catalogue')
  await views(page).getByRole('tab', { name: 'Outlets' }).click()
  await page.getByRole('button', { name: OUTLET.name }).click()

  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  await page.getByLabel('Outlet name').fill('Synthetic Ah Seng (Maxwell Food Centre)')
  const change = page.getByRole('listitem').filter({ hasText: '→' })
  await expect(change).toHaveText(
    /Synthetic Ah Seng \(Maxwell\)\s*→\s*Synthetic Ah Seng \(Maxwell Food Centre\)/,
  )
  await page.getByLabel('Reason').fill('Name on the signboard.')
  await page
    .getByRole('checkbox', { name: 'I checked these corrections against a reliable source' })
    .check()
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(
    page.getByRole('heading', { name: 'Synthetic Ah Seng (Maxwell Food Centre)' }),
  ).toBeVisible()
  expect(backend.callsTo('PATCH', /\/venues\//).at(-1)?.body).toEqual({
    expectedVersion: 0,
    name: 'Synthetic Ah Seng (Maxwell Food Centre)',
    note: 'Name on the signboard.',
    confirmed: true,
  })
})
