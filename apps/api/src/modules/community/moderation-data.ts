import { type AuthenticatedActor, readActiveSession } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { normalizeVersion } from '@api/modules/platform-admin/operation-version'
import type { AccessTransaction, Database } from '@api/modules/platform-admin/transaction'
import type {
  ModerationCommentsQuery,
  ModerationReportsQuery,
  ModerationTargetType,
} from '@broke-oclock/contracts/admin-moderation'

// Reads share a persisted authorization snapshot, but never acquire mutation fences or touch timestamps.
const readTransaction = <T>(
  db: Database,
  actor: AuthenticatedActor,
  work: (tx: AccessTransaction) => Promise<T>,
): Promise<T> =>
  db.$transaction(async (tx) => {
    const { user } = await readActiveSession(tx, actor)
    if (user.role !== 'ADMIN') throw new DomainError('FORBIDDEN')
    return work(tx)
  })

const person = { id: true, name: true } as const
export const dealSelect = {
  id: true,
  title: true,
  deletedAt: true,
  publishedAt: true,
  reviewStatus: true,
  contentVersion: true,
  reviewedVersion: true,
  applicability: true,
} as const
export const commentSelect = {
  id: true,
  dealId: true,
  body: true,
  author: { select: person },
  createdAt: true,
  deletedAt: true,
  hiddenAt: true,
  moderationVersion: true,
  deal: { select: dealSelect },
} as const
const reportFields = {
  id: true,
  reporter: { select: person },
  reason: true,
  details: true,
  status: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
  moderationVersion: true,
} as const
const iso = (v: Date | null | undefined) => v?.toISOString() ?? null
type SelectedDeal = Pick<
  NonNullable<Awaited<ReturnType<AccessTransaction['deal']['findUnique']>>>,
  keyof typeof dealSelect
>
const dealDTO = (row: SelectedDeal | null) =>
  row ? { ...row, deletedAt: iso(row.deletedAt), publishedAt: iso(row.publishedAt) } : null
type SelectedComment = {
  id: string
  dealId: string
  body: string
  author: { id: string; name: string } | null
  createdAt: Date
  deletedAt: Date | null
  hiddenAt: Date | null
  moderationVersion: number | null
  deal: SelectedDeal | null
}
export const commentDTO = (row: SelectedComment) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  deletedAt: iso(row.deletedAt),
  hiddenAt: iso(row.hiddenAt),
  moderationVersion: normalizeVersion(row.moderationVersion),
  state: row.deletedAt
    ? ('AUTHOR_DELETED' as const)
    : row.hiddenAt
      ? ('HIDDEN' as const)
      : ('VISIBLE' as const),
  deal: dealDTO(row.deal),
})
export const reportFor = async (
  tx: AccessTransaction,
  targetType: ModerationTargetType,
  id: string,
) => {
  if (targetType === 'DEAL') {
    const row = await tx.dealReport.findUnique({
      where: { id },
      select: { ...reportFields, dealId: true, deal: { select: dealSelect } },
    })
    if (!row) throw new DomainError('NOT_FOUND')
    const { dealId, deal, ...rest } = row
    return {
      ...rest,
      targetType,
      targetId: dealId,
      moderationVersion: normalizeVersion(row.moderationVersion),
      createdAt: row.createdAt.toISOString(),
      resolvedAt: iso(row.resolvedAt),
      deal: dealDTO(deal),
      comment: null,
    }
  }
  const row = await tx.commentReport.findUnique({
    where: { id },
    select: { ...reportFields, commentId: true, comment: { select: commentSelect } },
  })
  if (!row) throw new DomainError('NOT_FOUND')
  const { commentId, comment, ...rest } = row
  return {
    ...rest,
    targetType,
    targetId: commentId,
    moderationVersion: normalizeVersion(row.moderationVersion),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
    deal: dealDTO(comment?.deal ?? null),
    comment: comment ? commentDTO(comment) : null,
  }
}
export const readModerationReport = (
  db: Database,
  actor: AuthenticatedActor,
  type: ModerationTargetType,
  id: string,
) =>
  readTransaction(db, actor, async (tx) => {
    return reportFor(tx, type, id)
  })
export const listModerationReports = (
  db: Database,
  actor: AuthenticatedActor,
  q: ModerationReportsQuery,
) =>
  readTransaction(db, actor, async (tx) => {
    const where = {
      status: q.status,
      reason: q.reason,
      ...(q.cursor ? { id: { lt: q.cursor } } : {}),
    }
    const rows =
      q.targetType === 'DEAL'
        ? await tx.dealReport.findMany({
            where: { ...where, dealId: q.dealId },
            orderBy: { id: 'desc' },
            take: q.limit + 1,
            select: { id: true },
          })
        : await tx.commentReport.findMany({
            where: { ...where, ...(q.dealId ? { comment: { is: { dealId: q.dealId } } } : {}) },
            orderBy: { id: 'desc' },
            take: q.limit + 1,
            select: { id: true },
          })
    const page = rows.slice(0, q.limit)
    return {
      items: await Promise.all(page.map((r) => reportFor(tx, q.targetType, r.id))),
      nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    }
  })

export const commentFor = async (tx: AccessTransaction, id: string) => {
  const row = await tx.comment.findUnique({ where: { id }, select: commentSelect })
  if (!row) throw new DomainError('NOT_FOUND')
  return commentDTO(row)
}
export const readModerationComment = (db: Database, actor: AuthenticatedActor, id: string) =>
  readTransaction(db, actor, async (tx) => {
    return commentFor(tx, id)
  })
export const listModerationComments = (
  db: Database,
  actor: AuthenticatedActor,
  q: ModerationCommentsQuery,
) =>
  readTransaction(db, actor, async (tx) => {
    const absent = (field: 'deletedAt' | 'hiddenAt') => ({
      OR: [{ [field]: null }, { [field]: { isSet: false } }],
    })
    const state =
      q.state === 'AUTHOR_DELETED'
        ? { deletedAt: { not: null } }
        : q.state === 'HIDDEN'
          ? { AND: [absent('deletedAt'), { hiddenAt: { not: null } }] }
          : { AND: [absent('deletedAt'), absent('hiddenAt')] }
    const rows = await tx.comment.findMany({
      where: { dealId: q.dealId, ...state, ...(q.cursor ? { id: { lt: q.cursor } } : {}) },
      select: commentSelect,
      orderBy: { id: 'desc' },
      take: q.limit + 1,
    })
    const page = rows.slice(0, q.limit)
    return {
      items: page.map(commentDTO),
      nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    }
  })
