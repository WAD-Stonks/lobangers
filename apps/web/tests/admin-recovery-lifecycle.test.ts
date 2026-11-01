import { flushPromises, mount } from '@vue/test-utils'
import { ApiClientError, api } from '@web/lib/api-client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }))
vi.mock('@web/lib/auth-client', () => ({
  authClient: { ...auth, useSession: () => ({ value: { refetch: async () => {} } }) },
}))
const id = '0123456789abcdef01234567'
const merchant = {
  id,
  name: 'Synthetic reviewed merchant',
  version: 7,
  archived: false,
  venueCount: 0,
  dealCount: 0,
}
const report = {
  id,
  targetType: 'COMMENT',
  targetId: id,
  moderationVersion: 4,
  reason: 'SPAM',
  status: 'OPEN',
  details: 'Synthetic evidence',
  reporter: { id, name: 'Synthetic reporter' },
  deal: null,
  comment: null,
  resolution: null,
  resolvedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
}
const deal = {
  id,
  title: 'Synthetic meal',
  origin: 'USER_SUBMITTED',
  reviewStatus: 'PENDING',
  contentVersion: 1,
  operationVersion: 0,
  merchantId: null,
  deletedAt: null,
  publishedAt: null,
  validFrom: null,
  validUntil: null,
  publication: 'UNPUBLISHED',
  description: 'Synthetic full copy',
  terms: null,
  category: 'other',
  cuisine: null,
  offerType: 'OTHER',
  priceMinor: null,
  currency: 'SGD',
  discountPercent: null,
  rawValidityText: null,
  applicability: 'ONLINE',
  submittedById: id,
  reviewedById: null,
  reviewedVersion: null,
  reviewedAt: null,
  reviewNote: null,
  sources: [],
  images: [],
  outlets: [],
  outletCount: 0,
  selectedVenueIds: [],
  nextOutletCursor: null,
  scopeEditable: true,
  scopeConfirmed: false,
  blockers: [],
  approvalReady: true,
  publicationReady: false,
  scopeEvidenceLabel: null,
}
let writes: { url: string; method: string | undefined; body: unknown }[],
  commitLedger: unknown[],
  readFails = false,
  version = 7
let testSession = 0
let auditReads = 0
let denyAudit = false
let delayAudit: Promise<void> | null = null
const privateAudit = {
  id,
  actorId: id,
  actorName: 'Synthetic prior actor',
  action: 'DEAL_UPDATED',
  targetUserId: null,
  venueId: null,
  subjectType: 'DEAL',
  subjectId: id,
  detailsJson: null,
  note: 'PRIVATE A AUDIT NOTE',
  roleBefore: null,
  roleAfter: null,
  createdAt: '2026-10-28T00:00:00Z',
}

let delayWrite: Promise<void> | null = null
let delayDetail: Promise<void> | null = null
let writeResult: { id: string; version: number } | null = null

beforeEach(() => {
  writes = []
  commitLedger = []
  readFails = false
  version = 7
  testSession++
  auditReads = 0
  denyAudit = false
  delayAudit = null
  delayWrite = null
  delayDetail = null
  writeResult = null
  auth.getSession.mockResolvedValue({
    data: {
      user: { id, name: 'Synthetic operator', email: 'operator@example.test' },
      session: { id: `synthetic-session-${testSession}` },
    },
    error: null,
  })
  auth.signOut.mockRejectedValue(new Error('Synthetic unconfirmed sign-out'))
  api.http.defaults.adapter = async (c) => {
    const url = c.url ?? '',
      method = c.method
    if (method !== 'get') {
      writes.push({ url, method, body: JSON.parse(String(c.data)) })
      if (url === '/admin/catalogue/merchants')
        commitLedger.push({ id, name: JSON.parse(String(c.data)).name })
      if (delayWrite) await delayWrite
      if (writeResult)
        return { data: writeResult, status: 200, statusText: 'OK', headers: {}, config: c }
      throw new ApiClientError('INTERNAL_SERVER_ERROR', 500, 'Synthetic lost response')
    }
    if (delayDetail && url === `/admin/catalogue/merchants/${id}`) await delayDetail
    if (readFails && url === `/admin/catalogue/merchants/${id}`)
      throw new Error('Synthetic followup read failure')
    if (url === '/admin/audit') {
      auditReads++
      if (delayAudit) await delayAudit
      if (denyAudit) throw new ApiClientError('FORBIDDEN', 403, 'Synthetic lower privilege denied')
      return {
        data: { items: [privateAudit], nextCursor: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: c,
      }
    }
    let data: unknown
    if (url === '/auth-methods')
      data = { password: true, google: false, emailOtp: false, passwordRecovery: false }
    else if (url === '/admin/catalogue/merchants')
      data = { items: [{ ...merchant, version }], nextCursor: null }
    else if (url === `/admin/catalogue/merchants/${id}`) data = { ...merchant, version }
    else if (url === '/admin/deals')
      data = {
        items: [
          Object.fromEntries(
            [
              'id',
              'title',
              'origin',
              'reviewStatus',
              'contentVersion',
              'operationVersion',
              'merchantId',
              'deletedAt',
              'publishedAt',
              'validFrom',
              'validUntil',
              'publication',
            ].map((k) => [k, Reflect.get(deal, k)]),
          ),
        ],
        nextCursor: null,
      }
    else if (url === `/admin/deals/${id}`) data = deal
    else if (url === '/admin/moderation/reports') data = { items: [report], nextCursor: null }
    else if (url === `/admin/moderation/reports/COMMENT/${id}`) data = report
    else throw Error(`Unexpected transport ${method} ${url}`)
    return { data, status: 200, statusText: 'OK', headers: {}, config: c }
  }
})
const button = async (w: ReturnType<typeof mount>, text: string) => {
  const b = w.findAll('button').find((b) => b.text() === text)
  expect(b, `button ${text}`).toBeDefined()
  if (!b) throw new Error(`Missing button ${text}`)
  await b.trigger('click')
  await flushPromises()
}
const consent = async (w: ReturnType<typeof mount>, confirmation = 'confirmed') => {
  await w.get('[name="note"]').setValue('Fresh deliberate reviewed action')
  await w.get(`[name="${confirmation}"]`).setValue(true)
}
const remount = async (w: ReturnType<typeof mount>) => {
  await w.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(w.find('[name="note"]').exists()).toBe(false)
  await button(w, 'Recheck session')
  await w.get('[data-testid="admin-access-reload"]').trigger('click')
  await flushPromises()
}
it('same-mount unknown -> failed detail -> unchanged detail stays locked; newer evidence requires new consent', async () => {
  const Panel = (await import('@web/modules/admin-catalogue/CataloguePanel.vue')).default
  const w = mount(Panel)
  try {
    await flushPromises()
    await w.get(`button[aria-label="Open ${merchant.name}"]`).trigger('click')
    await flushPromises()
    await consent(w)
    await w.get('[name="merchantName"]').setValue('Reviewed corrected spelling')
    await w.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    expect(writes).toHaveLength(1)
    readFails = true
    await button(w, 'Reload target detail')
    expect(w.find('[name="merchantName"]').exists()).toBe(false)
    readFails = false
    await w.get(`button[aria-label="Open ${merchant.name}"]`).trigger('click')
    await flushPromises()
    expect(w.get('fieldset').attributes('disabled')).toBeDefined()
    version = 8
    await button(w, 'Reload target detail')
    expect(w.get('fieldset').attributes('disabled')).toBeUndefined()
    expect(w.get<HTMLInputElement>('[name="confirmed"]').element.checked).toBe(false)
  } finally {
    w.unmount()
  }
})
it('receiptless committed creation remains locked after original page session-close/remount', async () => {
  const Page = (await import('@web/pages/AdminCataloguePage.vue')).default
  const w = mount(Page)
  try {
    await flushPromises()
    await button(w, 'New merchant')
    await w.get('[name="merchantName"]').setValue('Synthetic ambiguous creation')
    await consent(w)
    await w.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(w.get('fieldset').attributes('disabled')).toBeDefined()
    await remount(w)
    await button(w, 'New merchant')
    await w.get('[name="merchantName"]').setValue('Synthetic ambiguous creation')
    await consent(w)
    await w.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    expect(writes, 'unresolved create context must survive original parent unmount').toHaveLength(1)
  } finally {
    w.unmount()
  }
})
it.each(['deals', 'moderation'])(
  '%s uncertain target remains locked after original session-close/remount with unchanged detail',
  async (kind) => {
    const Page =
      kind === 'deals'
        ? (await import('@web/pages/AdminDealsPage.vue')).default
        : (await import('@web/pages/AdminModerationPage.vue')).default
    const w = mount(Page)
    const act = async () => {
      await w
        .get(kind === 'deals' ? '[data-testid="select-deal"]' : '[data-testid="inspect-report"]')
        .trigger('click')
      await flushPromises()
      if (kind === 'deals') await w.get('[name="edit-title"]').setValue('Reviewed correction')
      await consent(w, kind === 'deals' ? 'confirm' : 'confirmed')
      await w
        .get(kind === 'deals' ? 'form:has([name="edit-title"])' : '[data-testid="decision-form"]')
        .trigger('submit')
      await flushPromises()
    }
    try {
      await flushPromises()
      await act()
      expect(writes).toHaveLength(1)
      await remount(w)
      await act()
      expect(writes, 'unchanged version may not erase the unresolved target lock').toHaveLength(1)
    } finally {
      w.unmount()
    }
  },
)

afterEach(async () => {
  auth.getSession.mockResolvedValue({ data: null, error: null })
  const { createAdminSession } = await import('@web/lib/admin-session')
  const state = createAdminSession({
    closing: () => {},
    signedOut: () => {},
    accessReload: () => {},
  })
  await state.refresh()
  state.dispose()
})

const mountedCases = ['catalogue', 'create', 'deals', 'moderation'] as const
const originalPage = async (kind: (typeof mountedCases)[number]) =>
  kind === 'deals'
    ? (await import('@web/pages/AdminDealsPage.vue')).default
    : kind === 'moderation'
      ? (await import('@web/pages/AdminModerationPage.vue')).default
      : (await import('@web/pages/AdminCataloguePage.vue')).default
const act = async (w: ReturnType<typeof mount>, kind: (typeof mountedCases)[number]) => {
  if (kind === 'create') await button(w, 'New merchant')
  else
    await w
      .get(
        kind === 'catalogue'
          ? `button[aria-label="Open ${merchant.name}"]`
          : kind === 'deals'
            ? '[data-testid="select-deal"]'
            : '[data-testid="inspect-report"]',
      )
      .trigger('click')
  await flushPromises()
  if (kind === 'catalogue' || kind === 'create')
    await w.get('[name="merchantName"]').setValue('PRIVATE NEW FORM NAME')
  if (kind === 'deals') await w.get('[name="edit-title"]').setValue('PRIVATE NEW TITLE')
  await consent(w, kind === 'deals' ? 'confirm' : 'confirmed')
  await w
    .get(
      kind === 'catalogue' || kind === 'create'
        ? 'form:has([name="merchantName"])'
        : kind === 'deals'
          ? 'form:has([name="edit-title"])'
          : '[data-testid="decision-form"]',
    )
    .trigger('submit')
  await flushPromises()
}
it.each(mountedCases)(
  '%s preserves pre-dispatch lock through original SPA navigation while response is pending',
  async (kind) => {
    const Page = await originalPage(kind)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/catalogue', component: Page },
        {
          path: '/admin/audit',
          component: defineComponent({ template: '<p>Outside protected content</p>' }),
        },
      ],
    })
    await router.push('/admin/catalogue')
    await router.isReady()
    const w = mount(RouterView, { global: { plugins: [router] } })
    let release = () => {}
    delayWrite = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
      await w.get('a[href="/admin/audit"]').trigger('click')
      await flushPromises()
      await flushPromises()
      expect(w.text()).not.toContain('PRIVATE NEW')
      await router.push('/admin/catalogue')
      await flushPromises()
      await act(w, kind)
      expect(writes, 'pending attempt must exist before response').toHaveLength(1)
      release()
      await flushPromises()
      expect(w.text()).not.toContain('PRIVATE NEW TITLE')
      await act(w, kind)
      expect(writes, 'late unknown completion cannot lose lock').toHaveLength(1)
      if (kind === 'create') expect(commitLedger).toHaveLength(1)
    } finally {
      release()
      w.unmount()
      await flushPromises()
    }
  },
)
it.each(mountedCases)(
  '%s unknown lock survives ordinary original-page SPA navigation and fresh form consent',
  async (kind) => {
    const Page = await originalPage(kind)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/catalogue', component: Page },
        {
          path: '/admin/audit',
          component: defineComponent({ template: '<p>Outside protected content</p>' }),
        },
      ],
    })
    await router.push('/admin/catalogue')
    await router.isReady()
    const w = mount(RouterView, { global: { plugins: [router] } })
    try {
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
      await w.get('a[href="/admin/audit"]').trigger('click')
      await flushPromises()
      await flushPromises()
      await router.push('/admin/catalogue')
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
    } finally {
      w.unmount()
    }
  },
)

it.each(['catalogue', 'deals', 'moderation'] as const)(
  '%s same-session focus renewal preserves reviewed consent, then confirmed replacement clears old presentation',
  async (kind) => {
    const w = mount(await originalPage(kind))
    try {
      await flushPromises()
      await w
        .get(
          kind === 'catalogue'
            ? `button[aria-label="Open ${merchant.name}"]`
            : kind === 'deals'
              ? '[data-testid="select-deal"]'
              : '[data-testid="inspect-report"]',
        )
        .trigger('click')
      await flushPromises()
      await consent(w, kind === 'deals' ? 'confirm' : 'confirmed')
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(w.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe(
        'Fresh deliberate reviewed action',
      )
      expect(writes).toHaveLength(0)
      auth.getSession.mockResolvedValue({
        data: {
          user: {
            id: 'b'.repeat(24),
            name: 'Synthetic lower privilege',
            email: 'lower@example.test',
            role: 'USER',
          },
          session: { id: 'replacement-session' },
        },
        error: null,
      })
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(w.find('[name="note"]').exists()).toBe(false)
      expect(w.text()).not.toContain(merchant.name)
      expect(w.text()).not.toContain(deal.title)
      expect(w.text()).not.toContain(report.details)
      expect(writes).toHaveLength(0)
    } finally {
      w.unmount()
    }
  },
)
it.each(['catalogue', 'deals', 'moderation'] as const)(
  '%s changed exact authoritative version after remount unlocks only with new consent',
  async (kind) => {
    const w = mount(await originalPage(kind))
    const originalDeal = deal.operationVersion,
      originalReport = report.moderationVersion
    try {
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
      await remount(w)
      version++
      deal.operationVersion++
      report.moderationVersion++
      await w
        .get(
          kind === 'catalogue'
            ? `button[aria-label="Open ${merchant.name}"]`
            : kind === 'deals'
              ? '[data-testid="select-deal"]'
              : '[data-testid="inspect-report"]',
        )
        .trigger('click')
      await flushPromises()
      expect(w.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
      expect(
        w.get<HTMLInputElement>(kind === 'deals' ? '[name="confirm"]' : '[name="confirmed"]')
          .element.checked,
      ).toBe(false)
      expect(writes).toHaveLength(1)
      await act(w, kind)
      expect(writes).toHaveLength(2)
    } finally {
      deal.operationVersion = originalDeal
      report.moderationVersion = originalReport
      w.unmount()
    }
  },
)
it('retains no protected creation body in stable owner and retires attempts only after confirmed native end', async () => {
  const w = mount(await originalPage('create'))
  try {
    await flushPromises()
    await act(w, 'create')
    expect(writes).toHaveLength(1)
    const { adminRecovery } = await import('@web/lib/admin-recovery')
    const ledger = adminRecovery('catalogue')
    expect(ledger.attempts.size).toBe(1)
    const serialized = JSON.stringify([...ledger.attempts])
    expect(serialized).not.toContain('PRIVATE NEW FORM NAME')
    expect(serialized).not.toContain('Fresh deliberate reviewed action')
    expect(serialized).not.toContain('operator@example.test')
    await remount(w)
    expect(ledger.attempts.size).toBe(1)
    expect(w.text()).not.toContain('PRIVATE NEW FORM NAME')
    auth.getSession.mockResolvedValue({ data: null, error: null })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(ledger.attempts.size).toBe(0)
    expect(w.find('[name="note"]').exists()).toBe(false)
  } finally {
    w.unmount()
  }
})
it.each(['catalogue', 'create', 'deals', 'moderation'] as const)(
  '%s late A write cannot alter replacement B attempt or protected presentation',
  async (kind) => {
    let release = () => {}
    delayWrite = new Promise<void>((resolve) => {
      release = resolve
    })
    const w = mount(await originalPage(kind))
    try {
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
      auth.getSession.mockResolvedValue({
        data: {
          user: { id: 'b'.repeat(24), name: 'Synthetic B', email: 'b@example.test' },
          session: { id: 'session-B' },
        },
        error: null,
      })
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      await w.get('[data-testid="admin-access-reload"]').trigger('click')
      await flushPromises()
      // Same target/version is permitted for a genuinely new native owner after real client reads.
      delayWrite = null
      await act(w, kind)
      expect(writes).toHaveLength(2)
      const { adminRecovery } = await import('@web/lib/admin-recovery')
      const domain = kind === 'deals' ? 'deals' : kind === 'moderation' ? 'moderation' : 'catalogue'
      const before = JSON.stringify([...adminRecovery(domain).attempts])
      release()
      await flushPromises()
      expect(JSON.stringify([...adminRecovery(domain).attempts])).toBe(before)
      await act(w, kind)
      expect(writes).toHaveLength(2)
    } finally {
      release()
      w.unmount()
      await flushPromises()
    }
  },
)

it('a detail read started before a late creation receipt cannot reconcile the creation context', async () => {
  const Page = await originalPage('create')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/catalogue', component: Page },
      { path: '/admin/audit', component: defineComponent({ template: '<p>Outside</p>' }) },
    ],
  })
  await router.push('/admin/catalogue')
  await router.isReady()
  let releaseWrite = () => {},
    releaseRead = () => {}
  delayWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  writeResult = { id, version: 7 }
  const w = mount(RouterView, { global: { plugins: [router] } })
  try {
    await flushPromises()
    await act(w, 'create')
    expect(writes).toHaveLength(1)
    await w.get('a[href="/admin/audit"]').trigger('click')
    await flushPromises()
    await router.push('/admin/catalogue')
    await flushPromises()
    delayDetail = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    await w.get(`button[aria-label="Open ${merchant.name}"]`).trigger('click')
    await flushPromises()
    releaseWrite()
    await flushPromises()
    releaseRead()
    await flushPromises()
    await act(w, 'create')
    expect(writes, 'pre-receipt read is not post-receipt reconciliation').toHaveLength(1)
    delayDetail = null
    await w.get(`button[aria-label="Open ${merchant.name}"]`).trigger('click')
    await flushPromises()
    await act(w, 'create')
    expect(writes).toHaveLength(2)
  } finally {
    releaseWrite()
    releaseRead()
    w.unmount()
    await flushPromises()
  }
})

it('a newer parent alone cannot reconcile a late outlet creation receipt', async () => {
  const Page = await originalPage('catalogue')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/catalogue', component: Page },
      { path: '/admin/audit', component: defineComponent({ template: '<p>Outside</p>' }) },
    ],
  })
  await router.push('/admin/catalogue')
  await router.isReady()
  let release = () => {}
  delayWrite = new Promise<void>((resolve) => {
    release = resolve
  })
  writeResult = { id: 'd'.repeat(24), version: 1 }
  const w = mount(RouterView, { global: { plugins: [router] } })
  const openCreate = async () => {
    await w.get(`button[aria-label="Open ${merchant.name}"]`).trigger('click')
    await flushPromises()
    await button(w, 'Add outlet to this merchant')
  }
  const submit = async () => {
    for (const [field, value] of Object.entries({
      name: 'PRIVATE OUTLET',
      address: '1 Synthetic Road',
      postalCode: '123456',
      area: 'Synthetic',
      latitude: '1.3',
      longitude: '103.8',
      catalogueKey: 'synthetic-outlet',
    }))
      await w.get(`[name="${field}"]`).setValue(value)
    await consent(w)
    await w.get('form:has([name="catalogueKey"])').trigger('submit')
    await flushPromises()
  }
  try {
    await flushPromises()
    await openCreate()
    await submit()
    expect(writes).toHaveLength(1)
    await w.get('a[href="/admin/audit"]').trigger('click')
    await flushPromises()
    await router.push('/admin/catalogue')
    await flushPromises()
    release()
    await flushPromises()
    version = 8
    await openCreate()
    await submit()
    expect(writes, 'parent version is not the exact created outlet read').toHaveLength(1)
  } finally {
    release()
    w.unmount()
    await flushPromises()
  }
})

it.each(['different-user', 'same-user-new-session'] as const)(
  'original Audit HTTP consumer clears warm A for %s before deliberate lower-B authorization',
  async (replacement) => {
    const Page = (await import('@web/pages/AdminAuditPage.vue')).default
    const w = mount(Page)
    try {
      await flushPromises()
      expect(w.text()).toContain(privateAudit.note)
      expect(auditReads).toBe(1)
      auth.getSession.mockResolvedValue({
        data: {
          user: {
            id: replacement === 'different-user' ? 'b'.repeat(24) : id,
            name: 'Synthetic B',
            email: 'b@example.test',
            role: 'USER',
          },
          session: { id: 'native-B' },
        },
        error: null,
      })
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(w.text()).toContain('b@example.test')
      expect(w.text()).not.toContain(privateAudit.note)
      expect(auditReads).toBe(1)
      expect(writes).toHaveLength(0)
      denyAudit = true
      await w.get('[data-testid="admin-access-reload"]').trigger('click')
      await flushPromises()
      expect(auditReads).toBe(2)
      expect(w.text()).toContain('You do not have permission')
      expect(w.text()).not.toContain(privateAudit.note)
      expect(writes).toHaveLength(0)
    } finally {
      w.unmount()
    }
  },
)
it('original Audit HTTP consumer fences a delayed A success after confirmed native B', async () => {
  let release = () => {}
  delayAudit = new Promise<void>((resolve) => {
    release = resolve
  })
  const w = mount((await import('@web/pages/AdminAuditPage.vue')).default)
  try {
    await flushPromises()
    expect(auditReads).toBe(1)
    auth.getSession.mockResolvedValue({
      data: {
        user: { id: 'b'.repeat(24), name: 'Synthetic B', email: 'b@example.test' },
        session: { id: 'native-B' },
      },
      error: null,
    })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    release()
    await flushPromises()
    expect(w.text()).not.toContain(privateAudit.note)
    expect(auditReads).toBe(1)
  } finally {
    release()
    w.unmount()
    await flushPromises()
  }
})
it.each(mountedCases)(
  '%s pending attempt survives unconfirmed sign-out and same-session access reload',
  async (kind) => {
    let release = () => {}
    delayWrite = new Promise<void>((resolve) => {
      release = resolve
    })
    const w = mount(await originalPage(kind))
    try {
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
      await remount(w)
      await act(w, kind)
      expect(writes).toHaveLength(1)
      release()
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
    } finally {
      release()
      w.unmount()
      await flushPromises()
    }
  },
)
it('same-version catalogue correction remains locked after uncertain sign-out and new consent', async () => {
  const w = mount(await originalPage('catalogue'))
  try {
    await flushPromises()
    await act(w, 'catalogue')
    expect(writes).toHaveLength(1)
    await remount(w)
    await act(w, 'catalogue')
    expect(writes).toHaveLength(1)
  } finally {
    w.unmount()
  }
})

it.each(mountedCases)(
  '%s unknown-session failure closes presentation but does not terminate its unresolved ledger',
  async (kind) => {
    const w = mount(await originalPage(kind))
    try {
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
      auth.getSession.mockRejectedValueOnce(new Error('Synthetic unknown native response'))
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(w.find('[name="note"]').exists()).toBe(false)
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(w.text()).not.toContain('Retry sign-out')
      await w.get('[data-testid="admin-access-reload"]').trigger('click')
      await flushPromises()
      await act(w, kind)
      expect(writes).toHaveLength(1)
    } finally {
      w.unmount()
    }
  },
)
it('confirmed anonymous after uncertain sign-out does not claim sign-out still needs retry', async () => {
  const w = mount(await originalPage('create'))
  try {
    await flushPromises()
    await w.get('[data-testid="admin-sign-out"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Server sign-out could not be confirmed')
    auth.getSession.mockResolvedValue({ data: null, error: null })
    await button(w, 'Recheck session')
    expect(w.text()).toContain('No active session was found')
    expect(w.text()).not.toContain('Retry sign-out')
    expect(w.find('[data-testid="admin-sign-out"]').exists()).toBe(false)
  } finally {
    w.unmount()
  }
})

it('shared confirmed replacement releases a sibling native refresh without accepting its delayed A identity', async () => {
  const w = mount((await import('@web/pages/AdminAuditPage.vue')).default)
  const other = mount((await import('@web/components/admin/AdminSessionControls.vue')).default)
  let release: (v: unknown) => void = () => {}
  try {
    await flushPromises()
    expect(w.text()).toContain(privateAudit.note)
    auth.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    auth.getSession.mockResolvedValue({
      data: {
        user: { id: 'b'.repeat(24), name: 'Synthetic B', email: 'b@example.test' },
        session: { id: 'native-B' },
      },
      error: null,
    })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(w.text()).not.toContain(privateAudit.note)
    expect(w.get('section[aria-label="Admin session"]').attributes('aria-busy')).toBe('false')
    release({
      data: {
        user: { id, name: 'Late A', email: 'late-a@example.test' },
        session: { id: `synthetic-session-${testSession}` },
      },
      error: null,
    })
    await flushPromises()
    expect(w.text()).not.toContain('late-a@example.test')
    expect(auditReads).toBe(1)
    await button(w, 'Recheck session')
    expect(w.text()).toContain('b@example.test')
  } finally {
    release({ data: null, error: null })
    w.unmount()
    other.unmount()
    await flushPromises()
  }
})

it.each(['catalogue', 'deals', 'moderation'] as const)(
  '%s confirmed page-level native absence retires old ledger even if the shell probe is unknown',
  async (kind) => {
    const Page = await originalPage(kind)
    const first = mount(Page)
    await flushPromises()
    await act(first, kind)
    expect(writes).toHaveLength(1)
    const { adminRecovery } = await import('@web/lib/admin-recovery')
    const ledger = adminRecovery(kind)
    expect(ledger.attempts.size).toBe(1)
    first.unmount()
    // The parent starts its native GET before the shell finishes native renewal.
    auth.getSession.mockResolvedValueOnce({ data: null, error: null })
    auth.getSession.mockResolvedValue({
      data: null,
      error: { message: 'Synthetic unknown shell probe' },
    })
    const second = mount(Page)
    try {
      await flushPromises()
      expect(ledger.attempts.size).toBe(0)
      expect(second.find('[name="note"]').exists()).toBe(false)
      expect(writes).toHaveLength(1)
    } finally {
      second.unmount()
    }
  },
)

// Real original parents/router/typed clients; only native SDK and HTTP are synthetic.
const absenceParents = [
  {
    kind: 'audit',
    path: '/admin/audit',
    read: '/admin/audit',
    signIn: 'Sign in to view audit history',
  },
  {
    kind: 'overview',
    path: '/admin',
    read: '/admin/overview',
    signIn: 'Sign in to view administration',
  },
  {
    kind: 'ingestion',
    path: '/admin/ingestion',
    read: '/ingestion/dashboard',
    signIn: 'Sign in to review ingestion',
  },
  {
    kind: 'accounts',
    path: '/admin/accounts',
    read: '/admin/accounts',
    signIn: 'Sign in to manage accounts',
  },
] as const
const absenceParentPage = async (kind: (typeof absenceParents)[number]['kind']) => {
  if (kind === 'audit') return (await import('@web/pages/AdminAuditPage.vue')).default
  if (kind === 'overview') return (await import('@web/pages/AdminOverviewPage.vue')).default
  if (kind === 'ingestion') return (await import('@web/pages/IngestionAdminPage.vue')).default
  return (await import('@web/pages/PlatformAdminPage.vue')).default
}
const nativeUnknown = { data: null, error: { message: 'Synthetic unknown native probe' } }
const sameNativeIdentity = () => ({
  data: {
    user: { id, name: 'Synthetic operator', email: 'operator@example.test' },
    session: { id: `synthetic-session-${testSession}` },
  },
  error: null,
})
const originalCreationRouter = async (parent: (typeof absenceParents)[number]) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/catalogue', component: await originalPage('create') },
      { path: parent.path, component: await absenceParentPage(parent.kind) },
    ],
  })
  await router.push('/admin/catalogue')
  await router.isReady()
  const w = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return { router, w }
}
const expectCreationRedacted = (w: ReturnType<typeof mount>) => {
  expect(w.text()).not.toContain('PRIVATE NEW FORM NAME')
  expect(w.text()).not.toContain('Fresh deliberate reviewed action')
  expect(w.find('[name="merchantName"]').exists()).toBe(false)
  expect(w.find('[name="note"]').exists()).toBe(false)
}

it.each(
  absenceParents.flatMap((parent) =>
    (['absent', 'unknown', 'rejected'] as const).map((outcome) => ({ ...parent, outcome })),
  ),
)('$kind parent $outcome while shell unknown preserves only unknown ownership', async (parent) => {
  const { router, w } = await originalCreationRouter(parent)
  const reads: string[] = []
  const adapter = api.http.defaults.adapter
  if (typeof adapter !== 'function') throw new Error('Expected synthetic adapter')
  api.http.defaults.adapter = async (config) => {
    if (config.method === 'get' && config.url !== '/auth-methods') reads.push(config.url ?? '')
    return adapter(config)
  }
  try {
    await act(w, 'create')
    const { adminRecovery } = await import('@web/lib/admin-recovery')
    const old = adminRecovery('catalogue')
    const attempt = [...old.attempts.values()][0]
    expect(old.current()).toBe(true)
    expect(old.attempts.size).toBe(1)
    expect(writes).toHaveLength(1)
    auth.getSession.mockResolvedValue(nativeUnknown)
    if (parent.outcome === 'rejected')
      auth.getSession.mockRejectedValueOnce(new Error('Synthetic unknown native rejection'))
    else
      auth.getSession.mockResolvedValueOnce(
        parent.outcome === 'absent' ? { data: null, error: null } : nativeUnknown,
      )
    await router.push(parent.path)
    await flushPromises()
    await flushPromises()
    expectCreationRedacted(w)
    expect(reads).toEqual([])
    expect(writes).toHaveLength(1)
    expect(commitLedger).toHaveLength(1)
    expect(old.attempts.size).toBe(parent.outcome === 'absent' ? 0 : 1)
    expect(old.current()).toBe(parent.outcome !== 'absent')
    if (parent.outcome === 'absent') expect(w.text()).toContain(parent.signIn)
    else expect([...old.attempts.values()][0]).toBe(attempt)
    const retained = JSON.stringify([...old.attempts])
    expect(retained).not.toContain('PRIVATE NEW FORM NAME')
    expect(retained).not.toContain('Fresh deliberate reviewed action')
    expect(retained).not.toContain('operator@example.test')
    auth.getSession.mockResolvedValue(sameNativeIdentity())
    await router.push('/admin/catalogue')
    await flushPromises()
    expect(writes, 'native recovery and page mount never replay a write').toHaveLength(1)
    if (parent.outcome !== 'absent') {
      await act(w, 'create')
      expect(writes, 'fresh form consent cannot replay unresolved creation').toHaveLength(1)
      expect([...old.attempts.values()][0]).toBe(attempt)
    }
  } finally {
    w.unmount()
    await flushPromises()
  }
})

it.each(
  absenceParents.flatMap((parent) =>
    (['UNAUTHORIZED', 'FORBIDDEN'] as const).map((code) => ({ ...parent, code })),
  ),
)('$kind REST $code is not confirmed native absence', async (parent) => {
  const { router, w } = await originalCreationRouter(parent)
  const adapter = api.http.defaults.adapter
  if (typeof adapter !== 'function') throw new Error('Expected synthetic adapter')
  let protectedReads = 0
  api.http.defaults.adapter = async (config) => {
    if (config.url === parent.read) {
      protectedReads++
      throw new ApiClientError(
        parent.code,
        parent.code === 'UNAUTHORIZED' ? 401 : 403,
        'Synthetic read refusal',
      )
    }
    return adapter(config)
  }
  try {
    await act(w, 'create')
    const { adminRecovery } = await import('@web/lib/admin-recovery')
    const old = adminRecovery('catalogue')
    const attempt = [...old.attempts.values()][0]
    auth.getSession.mockResolvedValueOnce(sameNativeIdentity())
    auth.getSession.mockResolvedValue(nativeUnknown)
    await router.push(parent.path)
    await flushPromises()
    await flushPromises()
    expect(protectedReads).toBe(1)
    expectCreationRedacted(w)
    expect(old.current()).toBe(true)
    expect(old.attempts.size).toBe(1)
    expect([...old.attempts.values()][0]).toBe(attempt)
    expect(writes).toHaveLength(1)
  } finally {
    w.unmount()
    await flushPromises()
  }
})

const lateParentData = (kind: (typeof absenceParents)[number]['kind']) => {
  if (kind === 'audit') return { items: [privateAudit], nextCursor: null }
  if (kind === 'accounts')
    return {
      items: [
        {
          id,
          name: 'PRIVATE LATE ACCOUNT',
          email: 'late@example.test',
          role: 'USER',
          version: 7,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      nextCursor: null,
    }
  if (kind === 'ingestion')
    return {
      source: {
        name: 'PRIVATE LATE SOURCE',
        enabled: false,
        reuseApproved: false,
        onemapConfigured: false,
      },
      counts: { pending: 3, approved: 4, rejected: 2, failed: 1 },
    }
  return {
    generatedAt: '2026-10-10T00:00:00Z',
    counts: { pendingMerchantRequests: 3, pendingImportedDrafts: 5, failedImportedPosts: 7 },
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
}
it.each(
  absenceParents.flatMap((parent) =>
    (['absent', 'unknown'] as const).map((outcome) => ({ ...parent, outcome })),
  ),
)(
  '$kind late protected data and creation receipt cannot revive $outcome parent context',
  async (parent) => {
    let releaseRead = () => {},
      releaseWrite = () => {}
    const pendingRead = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    delayWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    writeResult = { id, version: 7 }
    const { router, w } = await originalCreationRouter(parent)
    const adapter = api.http.defaults.adapter
    if (typeof adapter !== 'function') throw new Error('Expected synthetic adapter')
    const protectedReads: string[] = []
    api.http.defaults.adapter = async (config) => {
      if (
        config.method === 'get' &&
        config.url !== '/auth-methods' &&
        !config.url?.startsWith('/admin/catalogue')
      ) {
        protectedReads.push(config.url ?? '')
        expect(config.url).toBe(parent.read)
        await pendingRead
        return {
          data: lateParentData(parent.kind),
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      return adapter(config)
    }
    try {
      await act(w, 'create')
      const { adminRecovery } = await import('@web/lib/admin-recovery')
      const old = adminRecovery('catalogue')
      expect(old.attempts.size).toBe(1)
      expect([...old.attempts.values()][0]?.pending).toBe(true)
      await router.push(parent.path)
      await flushPromises()
      expect(protectedReads).toEqual([parent.read])
      // Native failure closes/fences the original in-flight protected reader.
      auth.getSession.mockResolvedValue(nativeUnknown)
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      auth.getSession.mockResolvedValue(sameNativeIdentity())
      await button(w, 'Recheck session')
      auth.getSession.mockResolvedValueOnce(
        parent.outcome === 'absent' ? { data: null, error: null } : nativeUnknown,
      )
      auth.getSession.mockResolvedValue(nativeUnknown)
      await w.get('[data-testid="admin-access-reload"]').trigger('click')
      await flushPromises()
      expect(old.current()).toBe(parent.outcome !== 'absent')
      expect(old.attempts.size).toBe(parent.outcome === 'absent' ? 0 : 1)
      if (parent.outcome === 'absent') expect(w.text()).toContain(parent.signIn)
      releaseRead()
      releaseWrite()
      await flushPromises()
      await flushPromises()
      expectCreationRedacted(w)
      expect(w.text()).not.toContain(privateAudit.note)
      expect(w.text()).not.toContain('PRIVATE LATE')
      expect(w.text()).not.toContain('Snapshot:')
      expect(w.find('[aria-label="Ingestion counts"]').exists()).toBe(false)
      expect(w.find('[aria-label="Accounts"]').exists()).toBe(false)
      expect(protectedReads).toEqual([parent.read])
      expect(writes).toHaveLength(1)
      expect(commitLedger).toHaveLength(1)
      expect(old.current()).toBe(parent.outcome !== 'absent')
      expect(old.attempts.size).toBe(parent.outcome === 'absent' ? 0 : 1)
    } finally {
      releaseRead()
      releaseWrite()
      w.unmount()
      await flushPromises()
    }
  },
)
