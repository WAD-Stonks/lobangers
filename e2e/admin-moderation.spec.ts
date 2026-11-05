import type { ModerationComment, ModerationReport } from '@broke-oclock/contracts/admin-moderation'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend, hex } from './fake-backend'

const ADMIN = account('ADMIN', { name: 'Synthetic operator' })
const at = '2026-10-30T08:00:00.000Z'
const DEAL = {
  id: hex(101),
  title: 'Synthetic chicken rice set',
  deletedAt: null,
  publishedAt: at,
  reviewStatus: 'APPROVED' as const,
  contentVersion: 3,
  reviewedVersion: 3,
  applicability: 'SELECTED_OUTLETS' as const,
}
const COMMENT: ModerationComment = {
  id: hex(201),
  dealId: DEAL.id,
  body: 'Synthetic spam: visit my fake shop for cheaper rice!!!',
  author: { id: hex(301), name: 'Synthetic spammer' },
  createdAt: at,
  deletedAt: null,
  hiddenAt: null,
  state: 'VISIBLE',
  moderationVersion: 0,
  deal: DEAL,
}
const REPORT: ModerationReport = {
  id: hex(401),
  targetType: 'COMMENT',
  targetId: COMMENT.id,
  reporter: { id: hex(302), name: 'Synthetic Priya' },
  reason: 'SPAM',
  details: 'This comment is advertising another shop.',
  status: 'OPEN',
  resolution: null,
  resolvedAt: null,
  createdAt: at,
  moderationVersion: 0,
  deal: DEAL,
  comment: COMMENT,
}

const fakeModeration = async (page: Page) => {
  const backend = await fakeBackend(page, { user: ADMIN })
  let report = structuredClone(REPORT)
  let comment = structuredClone(COMMENT)
  const conflict = {
    status: 409,
    json: { error: { code: 'CONFLICT', message: 'Version changed' } },
  }
  backend.on('GET', '/api/admin/moderation/reports', ({ query }) => ({
    json: {
      items:
        query.get('targetType') === 'COMMENT' && (query.get('status') ?? 'OPEN') === report.status
          ? [{ ...report, comment }]
          : [],
      nextCursor: null,
    },
  }))
  backend.on('GET', `/api/admin/moderation/reports/COMMENT/${REPORT.id}`, () => ({
    json: { ...report, comment },
  }))
  backend.on('GET', `/api/admin/moderation/comments/${COMMENT.id}`, () => ({ json: comment }))
  backend.on('GET', '/api/admin/moderation/comments', ({ query }) => ({
    json: {
      items: (query.get('state') ?? 'VISIBLE') === comment.state ? [comment] : [],
      nextCursor: null,
    },
  }))
  backend.on('POST', `/api/admin/moderation/comments/${COMMENT.id}/visibility`, ({ body }) => {
    if (body.expectedVersion !== comment.moderationVersion) return conflict
    const hidden = body.visibility === 'HIDDEN'
    comment = {
      ...comment,
      state: hidden ? 'HIDDEN' : 'VISIBLE',
      hiddenAt: hidden ? new Date().toISOString() : null,
      moderationVersion: comment.moderationVersion + 1,
    }
    return { json: comment }
  })
  backend.on('POST', `/api/admin/moderation/reports/COMMENT/${REPORT.id}/resolve`, ({ body }) => {
    if (body.expectedVersion !== report.moderationVersion) return conflict
    report = {
      ...report,
      status: body.decision,
      resolution: body.resolution,
      resolvedAt: new Date().toISOString(),
      moderationVersion: report.moderationVersion + 1,
    }
    return { json: { ...report, comment } }
  })
  return backend
}

const decide = async (page: Page, note: string) => {
  const form = page.getByTestId('decision-form')
  await form.getByLabel(/Resolution|Moderation note/).fill(note)
  await form
    .getByLabel('I reviewed this exact target and version, and confirm this action.')
    .check()
  return form
}

test('a moderator hides a reported spam comment, resolves the report, and it leaves the open queue', async ({
  page,
}) => {
  const backend = await fakeModeration(page)
  await page.goto('/admin/moderation')

  await expect(page.getByRole('heading', { name: 'Report queue' })).toBeVisible()
  await page.getByTestId('inspect-report').click()
  await expect(page.getByTestId('moderation-detail-heading')).toBeFocused()
  const evidence = page.getByRole('region', { name: 'Evidence', exact: true })
  await expect(evidence).toContainText('Reported by Synthetic Priya')
  await expect(evidence).toContainText(COMMENT.body)
  await expect(page.getByRole('region', { name: 'Deal context' })).toContainText(DEAL.title)

  await page.getByTestId('open-reported-comment').click()
  await expect(page.getByTestId('moderation-detail-heading')).toHaveText('Review comment')
  const hide = await decide(page, 'Advertising another business.')
  await hide.getByRole('button', { name: 'Hide comment' }).click()
  await expect(page.getByText('Comment hidden. Reports and votes were not changed.')).toBeVisible()
  expect(backend.callsTo('POST', /\/visibility$/).at(-1)?.body).toEqual({
    expectedVersion: 0,
    visibility: 'HIDDEN',
    note: 'Advertising another business.',
    confirmed: true,
  })

  await page.getByTestId('back-to-report').click()
  const form = page.getByTestId('decision-form')
  await expect(form.getByRole('button', { name: 'Record report decision' })).toBeDisabled()
  await decide(page, 'Comment hidden as spam.')
  await form.getByRole('button', { name: 'Record report decision' }).click()
  await expect(
    page.getByText('Report resolved. Content visibility and sibling reports were not changed.'),
  ).toBeVisible()
  expect(backend.callsTo('POST', /\/resolve$/).at(-1)?.body).toEqual({
    expectedVersion: 0,
    decision: 'RESOLVED',
    resolution: 'Comment hidden as spam.',
    confirmed: true,
  })
  await expect(page.getByText('Recorded resolution: Comment hidden as spam.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('No records match these filters.')).toBeVisible()
  await chooseOption(page.getByRole('combobox', { name: 'Report status' }), 'RESOLVED')
  await expect(page.getByTestId('inspect-report')).toHaveCount(1)
  await chooseOption(page.getByRole('combobox', { name: 'Queue' }), 'COMMENTS')
  await chooseOption(page.getByRole('combobox', { name: 'Comment state' }), 'HIDDEN')
  await expect(page.getByTestId('inspect-comment')).toHaveCount(1)
})

test('a moderator dismisses a report without touching the comment', async ({ page }) => {
  const backend = await fakeModeration(page)
  await page.goto('/admin/moderation')
  await page.getByTestId('inspect-report').click()

  await chooseOption(page.getByRole('combobox', { name: 'Decision' }), 'DISMISSED')
  const form = await decide(page, 'Not spam, just a strong opinion.')
  await form.getByRole('button', { name: 'Record report decision' }).click()

  await expect(
    page.getByText('Report dismissed. Content visibility and sibling reports were not changed.'),
  ).toBeVisible()
  await expect(form.getByRole('button', { name: 'Record report decision' })).toBeDisabled()
  expect(backend.callsTo('POST', /\/visibility$/)).toHaveLength(0)
})
