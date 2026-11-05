import type { PlatformAuditEntry } from '@broke-oclock/contracts/platform-admin'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend, hex } from './fake-backend'

const ADMIN = account('ADMIN', { name: 'Synthetic operator' })

const entry = (id: number, overrides: Partial<PlatformAuditEntry>): PlatformAuditEntry => ({
  id: hex(id),
  actorId: ADMIN.id,
  actorKind: 'HUMAN',
  actorSource: 'ADMIN',
  actorName: ADMIN.name,
  action: 'ROLE_CHANGED',
  targetUserId: null,
  venueId: null,
  note: 'Synthetic audit note',
  roleBefore: null,
  roleAfter: null,
  subjectType: null,
  subjectId: null,
  detailsJson: null,
  createdAt: '2026-10-20T04:00:00.000Z',
  ...overrides,
})

const ENTRIES = [
  entry(1, {
    action: 'ROLE_CHANGED',
    targetUserId: hex(21),
    subjectType: 'USER',
    subjectId: hex(21),
    note: 'Verified stall owner.',
    roleBefore: 'USER',
    roleAfter: 'MERCHANT',
    createdAt: '2026-10-25T02:00:00.000Z',
  }),
  entry(2, {
    action: 'DEAL_UPDATED',
    subjectType: 'DEAL',
    subjectId: hex(91),
    note: 'Fixed the spelling in the title.',
    detailsJson: { contentVersionBefore: 1, contentVersionAfter: 2, changedFields: ['title'] },
    createdAt: '2026-10-15T09:30:00.000Z',
  }),
  entry(3, {
    action: 'COMMENT_HIDDEN',
    subjectType: 'COMMENT',
    subjectId: hex(201),
    note: 'Advertising another business.',
    createdAt: '2026-09-02T01:00:00.000Z',
  }),
]

const fakeAudit = async (page: Page) => {
  const backend = await fakeBackend(page, { user: ADMIN })
  backend.on('GET', '/api/admin/audit', ({ query }) => {
    const action = query.get('action')
    const subjectType = query.get('subjectType')
    const from = query.get('from')
    const until = query.get('until')
    return {
      json: {
        items: ENTRIES.filter((item) => !action || item.action === action)
          .filter((item) => !subjectType || item.subjectType === subjectType)
          .filter((item) => !from || (item.createdAt >= from && item.createdAt < (until ?? ''))),
        nextCursor: null,
      },
    }
  })
  return backend
}

const entries = (page: Page) => page.getByTestId('audit-entry')
const lastQuery = (backend: Awaited<ReturnType<typeof fakeAudit>>) =>
  Object.fromEntries(backend.callsTo('GET', '/api/admin/audit').at(-1)?.query ?? [])

test('an admin narrows the audit history and reads what an entry changed', async ({ page }) => {
  const backend = await fakeAudit(page)
  await page.goto('/admin/audit')

  await expect(page.getByRole('heading', { name: 'Audit history' })).toBeVisible()
  await expect(entries(page)).toHaveCount(3)

  await chooseOption(page.getByRole('combobox', { name: 'Action' }), 'DEAL_UPDATED')
  await page.getByRole('button', { name: 'Apply audit filters' }).click()
  await expect(entries(page)).toHaveCount(1)
  expect(lastQuery(backend)).toMatchObject({ action: 'DEAL_UPDATED' })
  const updated = entries(page).first()
  await expect(updated.getByRole('heading', { name: 'DEAL UPDATED' })).toBeVisible()
  await expect(updated).toContainText(`DEAL: ${hex(91)}`)
  await updated.getByText('Recorded change details').click()
  await expect(updated.getByRole('definition').filter({ hasText: /^title$/ })).toBeVisible()

  await chooseOption(page.getByRole('combobox', { name: 'Action' }), '')
  await page.getByLabel('From (Singapore time)').fill('2026-10-01T08:00')
  const requestsSoFar = backend.callsTo('GET', '/api/admin/audit').length
  await page.getByRole('button', { name: 'Apply audit filters' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'choose both dates' })).toBeVisible()
  expect(backend.callsTo('GET', '/api/admin/audit')).toHaveLength(requestsSoFar)
  await page.getByLabel('Until, exclusive (Singapore time)').fill('2026-11-01T08:00')
  await page.getByRole('button', { name: 'Apply audit filters' }).click()
  await expect(entries(page)).toHaveCount(2)
  expect(lastQuery(backend)).toMatchObject({
    from: '2026-10-01T00:00:00.000Z',
    until: '2026-11-01T00:00:00.000Z',
  })
  await expect(entries(page).filter({ hasText: 'COMMENT HIDDEN' })).toHaveCount(0)

  await chooseOption(page.getByRole('combobox', { name: 'Subject type' }), 'FLASH_DROP')
  await page.getByRole('button', { name: 'Apply audit filters' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'No audit entries match these filters.' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(entries(page)).toHaveCount(3)
})
