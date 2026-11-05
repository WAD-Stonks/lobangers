import {
  type AuthenticatedActor,
  requireActiveSessionWrite,
} from '@api/modules/account/security-access'
import { catalogueVenueSelect } from '@api/modules/deals/catalogue-select'
import { isPickableStall } from '@api/modules/deals/community-stalls'
import { dayOf, endAfterDay, startOfDay } from '@api/modules/deals/deal-dates'
import { DomainError } from '@api/modules/domain-error'
import { type AccessTransaction, accessTransaction } from '@api/modules/platform-admin/transaction'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { SubmitDealBody } from '@broke-oclock/contracts/deal-forms'
import type { db } from '@broke-oclock/db'

type Database = typeof db

const unsetOrNull = (field: string) => ({ OR: [{ [field]: null }, { [field]: { isSet: false } }] })

export const submitCommunityDeal = async (
  database: Database,
  userId: string,
  input: SubmitDealBody,
  now: Date,
) => {
  if (input.endDate < dayOf(now))
    throw new DomainError('BAD_REQUEST', 'The last day cannot be in the past')

  const venues = await database.venue.findMany({
    where: { id: { in: input.stallIds }, ...activeRecord },
    select: catalogueVenueSelect,
  })
  const usable = venues.filter(isPickableStall)
  if (usable.length !== input.stallIds.length)
    throw new DomainError('PRECONDITION_FAILED', 'One of the stalls is no longer available')
  const merchantIds = new Set(usable.map((venue) => venue.merchantId))
  if (merchantIds.size !== 1)
    throw new DomainError(
      'BAD_REQUEST',
      'All stalls must belong to the same merchant. Submit separate deals for different shops.',
    )
  const [merchantId] = merchantIds

  try {
    return await database.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          cuisine: input.cuisine,
          offerType: input.offerType,
          discountPercent: input.discountPercent,
          priceMinor: input.priceCents,
          terms: input.terms,
          validFrom: startOfDay(input.startDate),
          validUntil: endAfterDay(input.endDate),
          applicability: 'SELECTED_OUTLETS',
          origin: 'USER_SUBMITTED',
          reviewStatus: 'PENDING',
          merchantId,
          submittedById: userId,
          venues: { create: input.stallIds.map((venueId) => ({ venueId })) },
        },
        select: { id: true },
      })
      const claimed = await tx.uploadedFile.updateMany({
        where: {
          key: input.photoKey,
          uploaderId: userId,
          AND: [unsetOrNull('dealId'), unsetOrNull('deletedAt')],
        },
        data: { dealId: deal.id },
      })
      if (claimed.count !== 1)
        throw new DomainError('BAD_REQUEST', 'The photo was not found. Please upload it again.')
      return deal
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2034')
      throw new DomainError('CONFLICT', 'The photo was used by another submission')
    throw error
  }
}

export const approvedDealIds = async (
  database: Database | AccessTransaction,
  dealIds: string[],
): Promise<Set<string>> => {
  if (dealIds.length === 0) return new Set()
  const approvals = await database.platformAudit.findMany({
    where: { subjectType: 'DEAL', subjectId: { in: dealIds }, action: 'DEAL_APPROVED' },
    select: { subjectId: true },
  })
  return new Set(approvals.flatMap((approval) => (approval.subjectId ? [approval.subjectId] : [])))
}

export const deletePendingSubmission = async (
  database: Database,
  actor: AuthenticatedActor,
  dealId: string,
  now: Date,
): Promise<void> =>
  accessTransaction(database, async (tx) => {
    await requireActiveSessionWrite(tx, actor)
    const owned = { id: dealId, submittedById: actor.userId, ...activeRecord }
    const deal = await tx.deal.findFirst({ where: owned, select: { id: true } })
    if (!deal) throw new DomainError('NOT_FOUND', 'This submission was not found')
    const refused = new DomainError(
      'PRECONDITION_FAILED',
      'Only a deal that is still pending review can be deleted',
    )
    if ((await approvedDealIds(tx, [dealId])).size > 0) throw refused
    const deleted = await tx.deal.updateMany({
      where: { ...owned, reviewStatus: 'PENDING' },
      data: { deletedAt: now },
    })
    if (deleted.count !== 1) throw refused
  })
