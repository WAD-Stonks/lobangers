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

const MAX_LISTED = 100
const MINUTE_MS = 60_000

export const requireMerchant = async (database: Database | AccessTransaction, userId: string) => {
  const user = await database.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'MERCHANT') throw new DomainError('FORBIDDEN')
}

const nullOrMissing = (field: string) => [{ [field]: null }, { [field]: { isSet: false } }]

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

const draftWindow = (input: MerchantFlashDropBody, now: Date) =>
  input.startsAt === null
    ? { startsAt: now, endsAt: new Date(now.getTime() + input.durationMinutes * MINUTE_MS) }
    : scheduleWindow(input.startsAt, input.durationMinutes, now)

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

const projectOne = async (database: Database, row: DropRow, now: Date) =>
  toMerchantDrop(row, await loadContext(database, [row]), now)

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
  writeThenProject(database, now, async (tx) => {
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
  if (!row) throw new DomainError('NOT_FOUND', 'Flash deal not found')
  return row
}

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
    await tx.deal.updateMany({ where: { id: current.dealId }, data: { validUntil: now } })
    return findOwnDrop(tx, actor.userId, dropId)
  })
