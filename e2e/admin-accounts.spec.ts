import type { MerchantRequest, PlatformRole } from '@broke-oclock/contracts/platform-admin'
import { expect, type Locator, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend, hex } from './fake-backend'

const ADMIN = account('ADMIN', { name: 'Synthetic operator' })
const at = '2026-10-30T08:00:00.000Z'
const VENUES = [
  {
    id: hex(11),
    name: 'Synthetic Ah Seng (Maxwell)',
    merchantName: 'Synthetic Ah Seng',
    address: '1 Synthetic St',
  },
  {
    id: hex(12),
    name: 'Synthetic Boba Lab',
    merchantName: 'Synthetic Boba',
    address: '2 Synthetic St',
  },
]
const PRIYA = { id: hex(21), name: 'Synthetic Priya', email: 'synthetic-priya@example.test' }
const WEI = { id: hex(22), name: 'Synthetic Wei Ling', email: 'synthetic-weiling@example.test' }

const FIRST_GRANT = hex(500)

type Person = typeof PRIYA & { role: PlatformRole; version: number }
type Grant = { id: string; userId: string; venueId: string; version: number }

const fakeAccounts = async (page: Page) => {
  const backend = await fakeBackend(page, { user: ADMIN })
  const people: Person[] = [
    { ...PRIYA, role: 'USER', version: 0 },
    { ...WEI, role: 'USER', version: 0 },
  ]
  let grants: Grant[] = []
  let nextId = Number.parseInt(FIRST_GRANT, 16)
  const requests: MerchantRequest[] = [
    {
      id: hex(31),
      userId: PRIYA.id,
      userName: PRIYA.name,
      userEmail: PRIYA.email,
      venueId: VENUES[0]?.id ?? '',
      venueName: VENUES[0]?.name ?? '',
      merchantName: VENUES[0]?.merchantName ?? '',
      status: 'PENDING',
      version: 0,
      message: 'I run this stall with my family.',
      reviewNote: null,
      createdAt: at,
    },
  ]
  const conflict = {
    status: 409,
    json: { error: { code: 'CONFLICT', message: 'Version changed' } },
  }
  const summary = (person: Person) => ({ ...person, createdAt: at })
  const grant = (userId: string, venueId: string) => {
    grants.push({ id: hex(nextId++), userId, venueId, version: 0 })
  }
  const personAt = (path: string) => people.find((person) => path.includes(person.id))

  backend.on('GET', '/api/admin/accounts', ({ query }) => {
    const search = (query.get('search') ?? '').toLowerCase()
    const role = query.get('role')
    return {
      json: {
        items: people
          .filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(search))
          .filter((person) => !role || person.role === role)
          .map(summary),
        nextCursor: null,
      },
    }
  })
  backend.on('GET', /^\/api\/admin\/accounts\/[0-9a-f]{24}$/, ({ path }) => {
    const person = personAt(path)
    if (!person) return undefined
    return {
      json: {
        ...summary(person),
        grants: grants
          .filter((item) => item.userId === person.id)
          .map((item) => {
            const venue = VENUES.find((candidate) => candidate.id === item.venueId)
            return {
              id: item.id,
              venueId: item.venueId,
              venueName: venue?.name ?? '',
              merchantName: venue?.merchantName ?? '',
              version: item.version,
              createdAt: at,
            }
          }),
      },
    }
  })
  backend.on('PATCH', /^\/api\/admin\/accounts\/[0-9a-f]{24}\/role$/, ({ path, body }) => {
    const person = personAt(path)
    if (!person) return undefined
    if (body.expectedVersion !== person.version) return conflict
    if (body.role !== 'MERCHANT') grants = grants.filter((item) => item.userId !== person.id)
    person.role = body.role
    person.version++
    return { json: { id: person.id, version: person.version } }
  })
  backend.on('GET', '/api/admin/venues', ({ query }) => ({
    json: {
      items: VENUES.filter((venue) =>
        venue.name.toLowerCase().includes((query.get('search') ?? '').toLowerCase()),
      ),
      nextCursor: null,
    },
  }))
  backend.on('POST', '/api/admin/stall-grants', ({ body }) => {
    const person = people.find((item) => item.id === body.userId)
    if (!person || body.expectedUserVersion !== person.version) return conflict
    grant(person.id, body.venueId)
    return { status: 201, json: { id: grants.at(-1)?.id, version: 0 } }
  })
  backend.on('DELETE', /^\/api\/admin\/stall-grants\/[0-9a-f]{24}$/, ({ path }) => {
    const removed = grants.find((item) => path.endsWith(item.id))
    grants = grants.filter((item) => item !== removed)
    return { json: { id: removed?.id, version: (removed?.version ?? 0) + 1 } }
  })
  backend.on('GET', '/api/admin/merchant-requests', ({ query }) => ({
    json: {
      items: requests.filter((item) => item.status === (query.get('status') ?? 'PENDING')),
      nextCursor: null,
    },
  }))
  backend.on(
    'POST',
    /^\/api\/admin\/merchant-requests\/[0-9a-f]{24}\/review$/,
    ({ path, body }) => {
      const request = requests.find((item) => path.includes(item.id))
      if (!request) return undefined
      if (body.expectedVersion !== request.version) return conflict
      request.status = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      request.reviewNote = body.note
      request.version++
      const person = people.find((item) => item.id === request.userId)
      if (person && body.decision === 'APPROVE') {
        person.role = 'MERCHANT'
        person.version++
        grant(person.id, request.venueId)
      }
      return { json: { id: request.id, version: request.version } }
    },
  )
  return backend
}

const workspace = (page: Page, name: 'Directory' | 'Merchant requests') =>
  page.getByRole('tablist', { name: 'Accounts workspace' }).getByRole('tab', { name })
const notice = (page: Page) => page.getByRole('status').filter({ hasText: /reviewed|completed/ })
const details = (page: Page) => page.getByRole('region', { name: 'Account details' })
const confirmAction = async (panel: Locator, note: string) => {
  await panel.getByLabel('Account action note (required)').fill(note)
  await panel.getByRole('checkbox', { name: /^Confirm / }).check()
}

test('an admin approves a merchant request and the applicant gets that stall', async ({ page }) => {
  const backend = await fakeAccounts(page)
  await page.goto('/admin/accounts')

  await workspace(page, 'Merchant requests').click()
  const requests = page.getByRole('region', { name: 'Merchant requests' })
  await requests.getByRole('button', { name: /Review request: Synthetic Priya/ }).click()
  const request = requests.getByRole('article', { name: 'Request details' })
  await expect(request).toContainText('I run this stall with my family.')
  await expect(request.getByRole('button', { name: 'Approve request' })).toBeDisabled()

  await request.getByLabel('Request review note (required)').fill('Checked the stall licence.')
  await request.getByLabel(`Confirm APPROVE for ${PRIYA.email} at ${VENUES[0]?.name}`).check()
  await request.getByRole('button', { name: 'Approve request' }).click()

  await expect(notice(page)).toHaveText(
    'Request reviewed. Check the panels below for the latest available evidence.',
  )
  expect(backend.callsTo('POST', /\/review$/).at(-1)?.body).toEqual({
    expectedVersion: 0,
    decision: 'APPROVE',
    note: 'Checked the stall licence.',
    confirmed: true,
  })
  await expect(requests.getByText('No requests match this status.')).toBeVisible()
  await chooseOption(requests.getByRole('combobox', { name: 'Request status' }), 'APPROVED')
  await requests.getByRole('button', { name: /Review request: Synthetic Priya .*APPROVED/ }).click()
  await expect(request).toContainText('Review note: Checked the stall licence.')

  await request.getByRole('link', { name: 'View applicant account' }).click()
  await expect(details(page).getByTestId('selected-account-heading')).toHaveText(PRIYA.name)
  await expect(details(page)).toContainText('MERCHANT')
  await expect(
    details(page)
      .getByRole('listitem')
      .filter({ hasText: VENUES[0]?.name ?? '' }),
  ).toBeVisible()
})

test('an admin finds an account, makes it a merchant, grants a stall, then revokes it', async ({
  page,
}) => {
  const backend = await fakeAccounts(page)
  await page.goto('/admin/accounts')

  await page.getByLabel('Search accounts').fill('wei ling')
  await page.getByRole('button', { name: 'Search accounts' }).click()
  const records = page.getByRole('table', { name: 'Account records' })
  await expect(records.getByRole('row')).toHaveCount(2)
  await records.getByRole('button', { name: `View account: ${WEI.name} (${WEI.email})` }).click()
  const panel = details(page)
  await expect(panel.getByTestId('selected-account-heading')).toHaveText(WEI.name)
  await expect(panel).toContainText('No active stall grants.')

  await chooseOption(panel.getByRole('combobox', { name: 'New role' }), 'MERCHANT')
  await confirmAction(panel, 'Verified stall owner.')
  await panel.getByRole('button', { name: 'Change role' }).click()
  await expect(notice(page)).toHaveText(
    'Account action completed. Check the panels below for the latest available evidence.',
  )
  expect(backend.callsTo('PATCH', /\/role$/).at(-1)?.body).toEqual({
    expectedVersion: 0,
    role: 'MERCHANT',
    note: 'Verified stall owner.',
    confirmed: true,
  })

  await chooseOption(panel.getByRole('combobox', { name: 'Account action' }), 'grant')
  await panel.getByLabel('Search existing stalls').fill('boba')
  await panel.getByRole('button', { name: 'Search stalls' }).click()
  await chooseOption(panel.getByRole('combobox', { name: 'Stall to grant' }), VENUES[1]?.id ?? '')
  await confirmAction(panel, 'Owner of the boba stall.')
  await panel.getByRole('button', { name: 'Grant stall access' }).click()
  await expect(notice(page)).toBeVisible()
  await expect(panel.getByRole('listitem').filter({ hasText: VENUES[1]?.name ?? '' })).toBeVisible()
  expect(backend.callsTo('POST', '/api/admin/stall-grants').at(-1)?.body).toMatchObject({
    userId: WEI.id,
    venueId: VENUES[1]?.id,
    expectedUserVersion: 1,
  })

  await chooseOption(panel.getByRole('combobox', { name: 'Account action' }), 'revoke')
  await chooseOption(panel.getByRole('combobox', { name: 'Active grant to revoke' }), FIRST_GRANT)
  await confirmAction(panel, 'Stall closed down.')
  await panel.getByRole('button', { name: 'Revoke stall access' }).click()
  await expect(panel).toContainText('No active stall grants.')
})
