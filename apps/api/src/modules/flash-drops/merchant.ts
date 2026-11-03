import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import {
  codesExpireAt,
  displayStatus,
  isDraft,
  scheduleWindow,
} from '@api/modules/flash-drops/policy'
import {
  type DropRow,
  dropSelect,
  loadContext,
  toMerchantDrop,
} from '@api/modules/flash-drops/records'
import { createFlashDeal, updateFlashDeal } from '@api/modules/merchant/promotions'
import { requireMerchantStall } from '@api/modules/platform-admin/capability'
import {
  type AccessTransaction,
  accessTransaction,
  conflict,
  type Database,
} from '@api/modules/platform-admin/transaction'
import {
  DEFAULT_FLASH_CODE_VALIDITY,
  type MerchantFlashDrop,
  type MerchantFlashDropBody,
} from '@broke-oclock/contracts/flash-drops'

// A merchant's flash deals at outlets they hold a grant for. Saving from the deal form makes a
// draft (with its own hidden deal); only the merchant sees drafts and only they can edit them.
// Go live makes a draft public from its start time, with no admin review; after that nothing
// changes except ending it early. Every write re-checks the grant inside the transaction.

const MAX_LISTED = 100
const MINUTE_MS = 60_000

export const requireMerchant = async (database: Database | AccessTransaction, userId: string) => {
  const user = await database.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'MERCHANT') throw new DomainError('FORBIDDEN')
}

const nullOrMissing = (field: string) => [{ [field]: null }, { [field]: { isSet: false } }]

// Two live flash deals at one outlet may not overlap in time.
const refuseOverlap = async (
  tx: AccessTransaction,
  outletId: string,
  window: { startsAt: Date; endsAt: Date },
  exceptId: string,
) => {
  const clash = await tx.flashDrop.findFirst({
    where: {
      venueId: outletId,
      status: 'APPROVED',
      startsAt: { lt: window.endsAt },
      endsAt: { gt: window.startsAt },
      id: { not: exceptId },
    },
    select: { id: true },
  })
  if (clash)
    throw new DomainError('CONFLICT', 'Another flash deal at this outlet already covers that time')
}

// A draft's window: the saved time (which must still be ahead), or "when Go live is pressed",
// stored for now as starting at the moment it is saved.
const draftWindow = (input: MerchantFlashDropBody, now: Date) =>
  input.startsAt === null
    ? { startsAt: now, endsAt: new Date(now.getTime() + input.durationMinutes * MINUTE_MS) }
    : scheduleWindow(input.startsAt, input.durationMinutes, now)

// The flash offer is the deal form's own offer. Its hidden deal carries the same offer, so the
// deal shows it on the map while the flash deal runs.
const dropContentOf = (input: MerchantFlashDropBody, window: { startsAt: Date; endsAt: Date }) => ({
  venueId: input.outletId,
  offerType: input.offerType,
  discountPercent: input.discountPercent,
  flashPriceMinor: input.priceCents,
  usualPriceMinor: input.usualPriceCents,
  startsAt: window.startsAt,
  endsAt: window.endsAt,
  codeValidity: input.codeValidity,
  codesExpireAt: codesExpireAt(window.endsAt, input.codeValidity),
  startsOnGoLive: input.startsAt === null,
  radiusMetres: input.radiusMetres,
  codeLimit: input.codeLimit,
})

// Builds the response once the transaction has committed: the deal, outlet and merchant names
// are plain reads, and keeping them out keeps the transaction short on a slow connection.
const projectOne = async (database: Database, row: DropRow, now: Date) =>
  toMerchantDrop(row, await loadContext(database, [row]), now)

// Runs the write, then projects the row it returns.
const writeThenProject = async (
  database: Database,
  now: Date,
  work: (tx: AccessTransaction) => Promise<DropRow>,
) => projectOne(database, await accessTransaction(database, work), now)

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
    where: { merchantUserId: userId, OR: nullOrMissing('deletedAt') },
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    take: MAX_LISTED,
    select: dropSelect,
  })
  // Only the merchant's own flash deals, and a revoked grant hides the ones at that outlet.
  const visible = rows.filter((row) => granted.has(row.venueId))
  const context = await loadContext(database, visible)
  return visible.map((row) => toMerchantDrop(row, context, now))
}

// "Save as flash deal": a new draft. Nothing is public until Go live.
export const createMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  input: MerchantFlashDropBody,
  now: Date,
): Promise<MerchantFlashDrop> =>
  writeThenProject(database, now, async (tx) => {
    // createFlashDeal checks the merchant's role and grant for the outlet.
    const window = draftWindow(input, now)
    const dealId = await createFlashDeal(tx, actor, input, input.outletId, now)
    const row = await tx.flashDrop.create({
      data: {
        ...dropContentOf(input, window),
        dealId,
        merchantUserId: actor.userId,
        status: 'DRAFT',
      },
      select: dropSelect,
    })
    return row
  })

const findOwnDrop = async (tx: AccessTransaction, userId: string, dropId: string) => {
  await requireMerchant(tx, userId)
  const row = await tx.flashDrop.findFirst({
    where: { id: dropId, merchantUserId: userId, OR: nullOrMissing('deletedAt') },
    select: dropSelect,
  })
  // Someone else's flash deal reads as missing, so it cannot be probed.
  if (!row) throw new DomainError('NOT_FOUND', 'Flash deal not found')
  return row
}

// Edits a draft (deal and flash details) as a new version. Live ones can only be ended.
export const updateMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  input: MerchantFlashDropBody,
  now: Date,
): Promise<MerchantFlashDrop> =>
  writeThenProject(database, now, async (tx) => {
    const current = await findOwnDrop(tx, actor.userId, dropId)
    if (!isDraft(current.status))
      throw new DomainError('PRECONDITION_FAILED', 'Only a draft flash deal can be edited')
    if (input.version !== undefined && input.version !== current.version) throw conflict()
    // updateFlashDeal checks the grant for both the old and the new outlet.
    const window = draftWindow(input, now)
    await updateFlashDeal(tx, actor, current.dealId, input, input.outletId, now)
    const result = await tx.flashDrop.updateMany({
      where: { id: dropId, version: current.version, status: current.status },
      data: {
        ...dropContentOf(input, window),
        status: 'DRAFT',
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
        version: current.version + 1,
      },
    })
    if (result.count !== 1) throw conflict()
    return findOwnDrop(tx, actor.userId, dropId)
  })

// Go live: the draft shows on the map from its start time (straight away for "when I press Go
// live"). The time and overlap are checked again, since a saved time can pass. Its deal is
// published for exactly the flash window, so it can be opened on the map while it runs and drops
// off by itself afterwards.
export const goLiveMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  version: number,
  now: Date,
): Promise<MerchantFlashDrop> =>
  writeThenProject(database, now, async (tx) => {
    const current = await findOwnDrop(tx, actor.userId, dropId)
    if (!isDraft(current.status))
      throw new DomainError('PRECONDITION_FAILED', 'This flash deal has already gone live')
    if (current.version !== version) throw conflict()
    await requireMerchantStall(tx, actor, current.venueId)
    const minutes = Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / MINUTE_MS)
    if (!current.startsOnGoLive && current.startsAt.getTime() < now.getTime() - MINUTE_MS)
      throw new DomainError(
        'BAD_REQUEST',
        'Its start time has passed. Edit the flash deal and choose a new time.',
      )
    const window = current.startsOnGoLive
      ? { startsAt: now, endsAt: new Date(now.getTime() + minutes * MINUTE_MS) }
      : scheduleWindow(current.startsAt.toISOString(), minutes, now)
    await refuseOverlap(tx, current.venueId, window, dropId)
    const validity = current.codeValidity ?? DEFAULT_FLASH_CODE_VALIDITY
    const result = await tx.flashDrop.updateMany({
      where: { id: dropId, version: current.version, status: current.status },
      data: {
        ...window,
        codeValidity: validity,
        codesExpireAt: codesExpireAt(window.endsAt, validity),
        status: 'APPROVED',
        version: current.version + 1,
      },
    })
    if (result.count !== 1) throw conflict()
    await tx.deal.update({
      where: { id: current.dealId },
      data: { publishedAt: now, validFrom: window.startsAt, validUntil: window.endsAt },
    })
    return findOwnDrop(tx, actor.userId, dropId)
  })

// Deletes a draft or a past flash deal. A draft was never public and nobody claimed it, so it goes
// for good. A past one (ended or removed) only leaves the merchant's history: people's claimed
// codes still point at it. Its hidden deal is marked deleted either way. A scheduled or live flash
// deal has to be ended first.
export const deleteMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  version: number,
  now: Date,
): Promise<void> =>
  accessTransaction(database, async (tx) => {
    const current = await findOwnDrop(tx, actor.userId, dropId)
    const shown = displayStatus(current, now)
    if (shown === 'SCHEDULED' || shown === 'LIVE')
      throw new DomainError('PRECONDITION_FAILED', 'End this flash deal before deleting it')
    if (current.version !== version) throw conflict()
    const where = { id: dropId, version: current.version, status: current.status }
    const result = isDraft(current.status)
      ? await tx.flashDrop.deleteMany({ where })
      : await tx.flashDrop.updateMany({
          where,
          data: { deletedAt: now, version: current.version + 1 },
        })
    if (result.count !== 1) throw conflict()
    await tx.deal.updateMany({ where: { id: current.dealId }, data: { deletedAt: now } })
  })

// Ends a scheduled or live flash deal early: nobody new can claim it, but codes already claimed
// keep working until they expire. Ending twice is a no-op.
export const endMerchantFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  version: number,
  now: Date,
): Promise<MerchantFlashDrop> =>
  writeThenProject(database, now, async (tx) => {
    const current = await findOwnDrop(tx, actor.userId, dropId)
    const shown = displayStatus(current, now)
    if (shown === 'DRAFT')
      throw new DomainError('PRECONDITION_FAILED', 'A draft has not gone live; delete it instead')
    if (!['SCHEDULED', 'LIVE'].includes(shown)) return current
    if (current.version !== version) throw conflict()
    await requireMerchantStall(tx, actor, current.venueId)
    const result = await tx.flashDrop.updateMany({
      where: { id: dropId, version: current.version, status: current.status },
      data: { status: 'ENDED_EARLY', version: current.version + 1 },
    })
    if (result.count !== 1) throw conflict()
    // Its deal leaves the map with it.
    await tx.deal.updateMany({ where: { id: current.dealId }, data: { validUntil: now } })
    return findOwnDrop(tx, actor.userId, dropId)
  })
