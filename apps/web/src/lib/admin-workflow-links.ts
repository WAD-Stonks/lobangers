export type DealWorkflowTab = 'content' | 'scope' | 'evidence' | 'review'
const adminPaths = new Set([
  '/admin',
  '/admin/deals',
  '/admin/catalogue',
  '/admin/moderation',
  '/admin/accounts',
  '/admin/audit',
  '/admin/ingestion',
  '/admin/flash-drops',
])

export const adminRecordId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-f0-9]{24}$/u.test(value) ? value : undefined

export const adminReturnTo = (value: unknown): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length > 4000 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return undefined
  try {
    const url = new URL(value, 'http://admin.local')
    if (url.origin !== 'http://admin.local' || !adminPaths.has(url.pathname)) return undefined
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return undefined
  }
}

const href = (path: string, values: Record<string, string | undefined>) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value)
  return `${path}${query.size ? `?${query}` : ''}`
}

export const adminDealHref = (options: {
  dealId: string
  tab?: DealWorkflowTab
  returnTo?: string
}) =>
  href('/admin/deals', {
    dealId: adminRecordId(options.dealId),
    tab: options.tab,
    returnTo: adminReturnTo(options.returnTo),
  })

export const adminCatalogueHref = (options: {
  kind?: 'merchants' | 'venues'
  merchantId?: string
  recordId?: string
  returnTo?: string
}) =>
  href('/admin/catalogue', {
    kind: options.kind,
    merchantId: adminRecordId(options.merchantId),
    recordId: adminRecordId(options.recordId),
    returnTo: adminReturnTo(options.returnTo),
  })

export const adminAuditHref = (options: {
  userId?: string
  subjectType?: string
  subjectId?: string
  returnTo?: string
}) =>
  href('/admin/audit', {
    userId: adminRecordId(options.userId),
    subjectType: options.subjectType,
    subjectId: adminRecordId(options.subjectId),
    returnTo: adminReturnTo(options.returnTo),
  })
