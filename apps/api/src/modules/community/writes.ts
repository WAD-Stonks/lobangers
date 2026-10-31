import { ApiErrorException } from '@api/errors'
import type { AuthenticatedActor } from '@api/modules/account/security-access'
import {
  communityTransaction,
  type Database,
  lockCommunityWrite,
  summaryFor,
  visibleComment,
} from '@api/modules/community/data'
import { normalizeVersion } from '@api/modules/platform-admin/operation-version'
import type { CommunityPolicy } from '@broke-oclock/contracts/community-policy'

export const setCommunityVote = (
  database: Database,
  dealId: string,
  actor: AuthenticatedActor,
  value: 'ALIVE' | 'DEAD' | null,
  policy: CommunityPolicy,
) =>
  communityTransaction(database, async (tx) => {
    const userId = actor.userId
    const now = new Date()
    const deal = await lockCommunityWrite(tx, dealId, actor, now)
    if (
      value &&
      ((deal.validUntil && deal.validUntil <= now) || (deal.validFrom && deal.validFrom > now))
    )
      throw new ApiErrorException('BAD_REQUEST', 'This promotion is not currently running.')
    const where = { userId_dealId: { userId, dealId } }
    const current = await tx.dealVote.findUnique({ where })
    if (value === null) await tx.dealVote.deleteMany({ where: { userId, dealId } })
    else if (
      !current ||
      current.value !== value ||
      current.updatedAt < (deal.reviewedAt ?? deal.publishedAt ?? new Date(0)) ||
      current.updatedAt.getTime() <= now.getTime() - policy.windowHours * 3600000
    )
      await tx.dealVote.upsert({
        where,
        create: { userId, dealId, value, updatedAt: now },
        update: { value, updatedAt: now },
      })
    return summaryFor(tx, dealId, userId, policy, now)
  })

export const addCommunityComment = (
  database: Database,
  dealId: string,
  actor: AuthenticatedActor,
  body: string,
) =>
  communityTransaction(database, async (tx) => {
    const userId = actor.userId
    const now = new Date()
    await lockCommunityWrite(tx, dealId, actor, now)
    const [minute, hour] = await Promise.all([
      tx.comment.count({
        where: { authorId: userId, createdAt: { gt: new Date(now.getTime() - 60000) } },
      }),
      tx.comment.count({
        where: { authorId: userId, createdAt: { gt: new Date(now.getTime() - 3600000) } },
      }),
    ])
    if (minute >= 5 || hour >= 30)
      throw new ApiErrorException(
        'TOO_MANY_REQUESTS',
        'Please wait before posting another comment.',
      )
    const row = await tx.comment.create({
      data: { dealId, authorId: userId, body },
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    })
    return {
      id: row.id,
      body: row.body,
      authorName: row.author.name,
      createdAt: row.createdAt.toISOString(),
      canDelete: true,
    }
  })

export const deleteCommunityComment = (
  database: Database,
  commentId: string,
  actor: AuthenticatedActor,
) =>
  communityTransaction(database, async (tx) => {
    const userId = actor.userId
    const row = await tx.comment.findUnique({ where: { id: commentId } })
    if (!row || row.deletedAt || row.hiddenAt) throw new ApiErrorException('NOT_FOUND')
    if (row.authorId !== userId) throw new ApiErrorException('FORBIDDEN')
    await lockCommunityWrite(tx, row.dealId, actor, new Date())
    await tx.comment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        moderationVersion: normalizeVersion(row.moderationVersion) + 1,
      },
    })
    return { ok: true as const }
  })

type Report = { reason: 'SPAM' | 'MISLEADING' | 'INAPPROPRIATE' | 'OTHER'; details?: string }
export const reportCommunityContent = (
  database: Database,
  targetId: string,
  actor: AuthenticatedActor,
  report: Report,
  target: 'deal' | 'comment',
) =>
  communityTransaction(database, async (tx) => {
    const userId = actor.userId
    const now = new Date()
    const comment =
      target === 'comment'
        ? await tx.comment.findFirst({ where: { id: targetId, ...visibleComment } })
        : null
    if (target === 'comment' && !comment) throw new ApiErrorException('NOT_FOUND')
    await lockCommunityWrite(tx, comment?.dealId ?? targetId, actor, now)
    const existing =
      target === 'comment'
        ? await tx.commentReport.findUnique({
            where: { reporterId_commentId: { reporterId: userId, commentId: targetId } },
          })
        : await tx.dealReport.findUnique({
            where: { reporterId_dealId: { reporterId: userId, dealId: targetId } },
          })
    if (existing) return { ok: true as const }
    const where = { reporterId: userId, createdAt: { gt: new Date(now.getTime() - 3600000) } }
    const count = (await tx.commentReport.count({ where })) + (await tx.dealReport.count({ where }))
    if (count >= 10)
      throw new ApiErrorException('TOO_MANY_REQUESTS', 'Please wait before sending another report.')
    if (target === 'comment')
      await tx.commentReport.create({
        data: { ...report, commentId: targetId, reporterId: userId },
      })
    else await tx.dealReport.create({ data: { ...report, dealId: targetId, reporterId: userId } })
    return { ok: true as const }
  })
