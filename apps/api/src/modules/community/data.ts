import { ApiErrorException } from '@api/errors'
import {
  type AuthenticatedActor,
  requireActiveSessionWrite,
} from '@api/modules/account/security-access'
import { type CommunityPolicy, communityStatus } from '@broke-oclock/contracts/community-policy'
import type { db } from '@broke-oclock/db'

export type Database = typeof db
export type Transaction = Parameters<Parameters<Database['$transaction']>[0]>[0]
export const visibleComment = {
  AND: [
    { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
    { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
  ],
}

export const publicDeal = async (tx: Transaction, id: string) => {
  const deal = await tx.deal.findUnique({ where: { id } })
  if (
    !deal ||
    deal.deletedAt ||
    !deal.publishedAt ||
    deal.reviewStatus !== 'APPROVED' ||
    deal.reviewedVersion !== deal.contentVersion
  )
    throw new ApiErrorException('NOT_FOUND')
  return deal
}

export const communityTransaction = async <T>(
  database: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> => {
  try {
    return await database.$transaction(work)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['P2002', 'P2034', 'P2025'].includes(String(error.code))
    )
      throw new ApiErrorException('CONFLICT', 'Community data changed. Please try again.')
    throw error
  }
}

// Serialize writes by the same account (including comment/report budgets), and conflict with
// concurrent changes to the target deal. Neither read endpoints nor summary calculation touch rows.
export const lockCommunityWrite = async (
  tx: Transaction,
  dealId: string,
  actor: AuthenticatedActor,
  now: Date,
) => {
  await requireActiveSessionWrite(tx, actor, now)
  const deal = await publicDeal(tx, dealId)
  await tx.deal.update({
    where: { id: deal.id },
    data: { updatedAt: new Date(Math.max(now.getTime(), deal.updatedAt.getTime() + 1)) },
  })
  return deal
}

export const summaryFor = async (
  tx: Transaction,
  dealId: string,
  userId: string | undefined,
  policy: CommunityPolicy,
  now = new Date(),
) => {
  const deal = await publicDeal(tx, dealId)
  const since = new Date(now.getTime() - policy.windowHours * 3600000)
  const publication = deal.reviewedAt ?? deal.publishedAt ?? new Date(0)
  const recent = { dealId, updatedAt: { gt: since, gte: publication, lte: now } }
  const [alive, dead, latest, mine, commentCount] = await Promise.all([
    tx.dealVote.count({ where: { ...recent, value: 'ALIVE' } }),
    tx.dealVote.count({ where: { ...recent, value: 'DEAD' } }),
    tx.dealVote.findFirst({
      where: recent,
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    userId
      ? tx.dealVote.findUnique({
          where: { userId_dealId: { userId, dealId } },
          select: { value: true, updatedAt: true },
        })
      : null,
    tx.comment.count({ where: { dealId, ...visibleComment } }),
  ])
  return {
    alive,
    dead,
    status: communityStatus({ alive, dead }, deal.validUntil?.toISOString() ?? null, now, policy),
    myVote: mine?.value ?? null,
    myVoteIsRecent:
      !!mine && mine.updatedAt > since && mine.updatedAt >= publication && mine.updatedAt <= now,
    lastReportedAt: latest?.updatedAt.toISOString() ?? null,
    asOf: now.toISOString(),
    commentCount,
    policy,
  }
}

export const listCommunityComments = async (
  database: Database,
  dealId: string,
  userId: string | undefined,
  query: { limit: number; cursor?: string },
) =>
  communityTransaction(database, async (tx) => {
    await publicDeal(tx, dealId)
    const rows = await tx.comment.findMany({
      where: { dealId, ...visibleComment, ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: {
        id: true,
        body: true,
        authorId: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    })
    const page = rows.slice(0, query.limit)
    return {
      items: page.map((row) => ({
        id: row.id,
        body: row.body,
        authorName: row.author.name,
        createdAt: row.createdAt.toISOString(),
        canDelete: row.authorId === userId,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    }
  })
