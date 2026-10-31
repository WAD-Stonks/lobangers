import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { displayStatus, scheduleWindow } from '@api/modules/flash-drops/policy'
import {
  type DropRow,
  dropSelect,
  loadContext,
  toMerchantDrop,
} from '@api/modules/flash-drops/records'
import { requireMerchantStall } from '@api/modules/platform-admin/capability'
import {
  type AccessTransaction,
  accessTransaction,
  conflict,
  type Database,
} from '@api/modules/platform-admin/transaction'
import type { MerchantFlashDrop, MerchantFlashDropBody } from '@broke-oclock/contracts/flash-drops'

// A merchant drops one of their own live deals at one outlet they hold a grant for. Every write
// re-checks the grant inside the transaction. Drops go to admin review; only a drop that was
// sent back can be edited and sent again, and nothing changes once it is approved except ending
// it early.

const MAX_LISTED = 100

const requireMerchant = async (database: Database | AccessTransaction, userId: string) => {
  const user = await database.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'MERCHANT') throw new DomainError('FORBIDDEN')
}

const nullOrMissing = (field: string) => [{ [field]: null }, { [field]: { isSet: false } }]

// The deal must be the merchant's own, still running, and offered at the chosen outlet.
const requireOwnRunningDeal = async (
  tx: AccessTransaction,
  userId: string,
  dealId: string,
  outletId: string,
  endsAt: Date,
) => {
  const deal = await tx.deal.findFirst({
    where: {
      id: dealId,
      submittedById: userId,
      reviewStatus: 'APPROVED',
      AND: [
        { OR: nullOrMissing('deletedAt') },
        { OR: [...nullOrMissing('validUntil'), { validUntil: { gte: endsAt } }] },
      ],
    },
    select: { id: true, priceMinor: true, venues: { select: { venueId: true } } },
  })
  // Someone else's deal reads as missing, so it cannot be probed.
  if (!deal)
    throw new DomainError('NOT_FOUND', 'Choose one of your deals that runs for the whole drop')
  if (!deal.venues.some((link) => link.venueId === outletId))
    throw new DomainError('BAD_REQUEST', 'That deal does not run at the chosen outlet')
  return deal
}

const refuseOwnOverlap = async (
  tx: AccessTransaction,
  outletId: string,
  window: { startsAt: Date; endsAt: Date },
  exceptId?: string,
) => {
  const clash = await tx.flashDrop.findFirst({
    where: {
      venueId: outletId,
      status: { in: ['PENDING', 'APPROVED'] },
      startsAt: { lt: window.endsAt },
      endsAt: { gt: window.startsAt },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  if (clash)
    throw new DomainError('CONFLICT', 'Another flash drop at this outlet already covers that time')
}

const projectOne = async (tx: AccessTransaction, row: DropRow, now: Date) =>
  toMerchantDrop(row, await loadContext(tx, [row]), now)

const contentOf = (input: MerchantFlashDropBody, window: { startsAt: Date; endsAt: Date }) => ({
  dealId: input.dealId,
  venueId: input.outletId,
  flashPriceMinor: input.flashPriceCents,
  startsAt: window.startsAt,
  endsAt: window.endsAt,
  radiusMetres: input.radiusMetres,
  codeLimit: input.codeLimit,
})

const checkPrice = (input: MerchantFlashDropBody, usual: number | null) => {
  if (usual !== null && usual > 0 && input.flashPriceCents >= usual)
    throw new DomainError('BAD_REQUEST', 'The flash price has to be lower than the usual price')
}

export const listMerchantFlashDrops = async (
  database: Database,
  userId: string,
  now: Date,
): Promise<MerchantFlashDrop[]> => {
  await requireMerchant(database, userId)
  const grants = await database.stallGrant.findMany({
    where: { userId, OR: nullOrMissing('revokedAt') },
    select: { venueId: true },
  })
  const granted = new Set(grants.map((grant) => grant.venueId))
  const rows = await database.flashDrop.findMany({
    where: { merchantUserId: userId },
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    take: MAX_LISTED,
    select: dropSelect,
  })
  // A revoked grant hides the drops at that outlet, as it does the outlet's deals.
  const visible = rows.filter((row) => granted.has(row.venueId))
  const context = await loadContext(database, visible)
  return visible.map((row) => toMerchantDrop(row, context, now))
}

export const createMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  input: MerchantFlashDropBody,
  now: Date,
): Promise<MerchantFlashDrop> =>
  accessTransaction(database, async (tx) => {
    await requireMerchantStall(tx, actor, input.outletId)
    const window = scheduleWindow(input.startsAt, input.durationMinutes, now)
    const deal = await requireOwnRunningDeal(
      tx,
      actor.userId,
      input.dealId,
      input.outletId,
      window.endsAt,
    )
    checkPrice(input, deal.priceMinor)
    await refuseOwnOverlap(tx, input.outletId, window)
    const row = await tx.flashDrop.create({
      data: { ...contentOf(input, window), merchantUserId: actor.userId },
      select: dropSelect,
    })
    return projectOne(tx, row, now)
  })

const findOwnDrop = async (tx: AccessTransaction, userId: string, dropId: string) => {
  await requireMerchant(tx, userId)
  const row = await tx.flashDrop.findFirst({
    where: { id: dropId, merchantUserId: userId },
    select: dropSelect,
  })
  if (!row) throw new DomainError('NOT_FOUND', 'Flash drop not found')
  return row
}

// Only a drop LoBangers sent back can be changed; it goes back into review as a new version.
export const resubmitMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  input: MerchantFlashDropBody,
  now: Date,
): Promise<MerchantFlashDrop> =>
  accessTransaction(database, async (tx) => {
    const current = await findOwnDrop(tx, actor.userId, dropId)
    if (current.status !== 'SENT_BACK')
      throw new DomainError('PRECONDITION_FAILED', 'Only a drop that was sent back can be edited')
    if (input.version !== undefined && input.version !== current.version) throw conflict()
    await requireMerchantStall(tx, actor, current.venueId)
    if (input.outletId !== current.venueId) await requireMerchantStall(tx, actor, input.outletId)
    const window = scheduleWindow(input.startsAt, input.durationMinutes, now)
    const deal = await requireOwnRunningDeal(
      tx,
      actor.userId,
      input.dealId,
      input.outletId,
      window.endsAt,
    )
    checkPrice(input, deal.priceMinor)
    await refuseOwnOverlap(tx, input.outletId, window, dropId)
    const result = await tx.flashDrop.updateMany({
      where: { id: dropId, version: current.version, status: 'SENT_BACK' },
      data: {
        ...contentOf(input, window),
        status: 'PENDING',
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
        version: current.version + 1,
      },
    })
    if (result.count !== 1) throw conflict()
    return projectOne(tx, await findOwnDrop(tx, actor.userId, dropId), now)
  })

// Withdraws a drop in review, or ends a scheduled or live one early. Ending twice is a no-op.
export const endMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  version: number,
  now: Date,
): Promise<MerchantFlashDrop> =>
  accessTransaction(database, async (tx) => {
    const current = await findOwnDrop(tx, actor.userId, dropId)
    const shown = displayStatus(current, now)
    if (!['IN_REVIEW', 'SCHEDULED', 'LIVE'].includes(shown)) return projectOne(tx, current, now)
    if (current.version !== version) throw conflict()
    await requireMerchantStall(tx, actor, current.venueId)
    const result = await tx.flashDrop.updateMany({
      where: { id: dropId, version: current.version, status: current.status },
      data: { status: 'ENDED_EARLY', version: current.version + 1 },
    })
    if (result.count !== 1) throw conflict()
    return projectOne(tx, await findOwnDrop(tx, actor.userId, dropId), now)
  })
