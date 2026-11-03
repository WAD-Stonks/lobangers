import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { dayOf, endAfterDay, lastDayBefore, startOfDay } from '@api/modules/deals/deal-dates'
import { outletScopeHash } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { requireMerchantStall } from '@api/modules/platform-admin/capability'
import {
  type AccessTransaction,
  accessTransaction,
  type Database,
} from '@api/modules/platform-admin/transaction'
import { activeGrant, activeRecord } from '@api/modules/platform-admin/venues'
import type {
  MerchantDeal,
  MerchantDealBody,
  MerchantOutlet,
} from '@broke-oclock/contracts/merchant'

// Merchant promotions: deals a MERCHANT creates for outlets they hold an active stall grant
// for. They publish immediately; the grants are recorded as the evidence that confirms the
// deal's outlet scope, so the public map shows them once the outlets' occupancy is verified.
// Every write re-checks each outlet's grant inside the write transaction (requireMerchantStall).

// Marks a deal as created through the merchant dashboard; only these are listed and editable.
const MERCHANT_EVIDENCE = 'merchant-grant:'
const MAX_LISTED_DEALS = 200

const merchantDealSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  cuisine: true,
  offerType: true,
  discountPercent: true,
  priceMinor: true,
  terms: true,
  validFrom: true,
  validUntil: true,
  contentVersion: true,
  venues: { select: { venueId: true } },
  // The deal's current photo: its first upload that has not been removed.
  images: {
    where: activeRecord,
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: { id: true, key: true, url: true },
  },
} as const

type MerchantDealRow = {
  id: string
  title: string
  description: string
  category: string
  cuisine: string | null
  offerType: MerchantDeal['offerType']
  discountPercent: number | null
  priceMinor: number | null
  terms: string | null
  validFrom: Date | null
  validUntil: Date | null
  contentVersion: number
  venues: { venueId: string }[]
  images: { id: string; key: string; url: string }[]
}

const toMerchantDeal = (row: MerchantDealRow, now: Date): MerchantDeal => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  cuisine: row.cuisine ?? null,
  outletIds: row.venues.map((link) => link.venueId),
  offerType: row.offerType,
  discountPercent: row.discountPercent ?? null,
  priceCents: row.priceMinor ?? null,
  startDate: row.validFrom ? dayOf(row.validFrom) : '',
  endDate: row.validUntil ? lastDayBefore(row.validUntil) : '',
  terms: row.terms ?? '',
  endedAt: row.validUntil && row.validUntil <= now ? row.validUntil.toISOString() : null,
  photo: row.images[0] ? { key: row.images[0].key, url: row.images[0].url } : null,
})

const hasEnded = (row: { validUntil: Date | null }, now: Date) =>
  !!row.validUntil && row.validUntil <= now

const createdByMerchant = (userId: string) => ({
  submittedById: userId,
  ...activeRecord,
  scopeConfirmation: { is: { evidenceRef: { startsWith: MERCHANT_EVIDENCE } } },
})

// Reads re-check the current database role; a MERCHANT role alone grants no outlet.
const requireMerchantRole = async (database: Database | AccessTransaction, userId: string) => {
  const user = await database.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'MERCHANT') throw new DomainError('FORBIDDEN')
}

const grantedVenueIds = async (database: Database, userId: string) => {
  const grants = await database.stallGrant.findMany({
    where: { userId, ...activeGrant },
    select: { venueId: true },
  })
  return new Set(grants.map((grant) => grant.venueId))
}

export const listMerchantOutlets = async (
  database: Database,
  userId: string,
): Promise<MerchantOutlet[]> => {
  await requireMerchantRole(database, userId)
  const ids = await grantedVenueIds(database, userId)
  return database.venue.findMany({
    where: { id: { in: [...ids] }, ...activeRecord, merchant: { is: activeRecord } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, address: true },
  })
}

export const listMerchantDeals = async (
  database: Database,
  userId: string,
  now: Date,
): Promise<MerchantDeal[]> => {
  await requireMerchantRole(database, userId)
  const granted = await grantedVenueIds(database, userId)
  const rows = await database.deal.findMany({
    where: createdByMerchant(userId),
    orderBy: { createdAt: 'desc' },
    take: MAX_LISTED_DEALS,
    select: merchantDealSelect,
  })
  // A revoked grant hides the deals at that outlet from this merchant.
  return rows
    .filter((row) => row.venues.every((link) => granted.has(link.venueId)))
    .map((row) => toMerchantDeal(row, now))
}

// Checks the grant for every outlet inside the transaction, and that they share one merchant.
const authorizeOutlets = async (
  tx: AccessTransaction,
  actor: AuthenticatedActor,
  outletIds: string[],
) => {
  const grantIds = new Map<string, string>()
  for (const venueId of [...new Set(outletIds)].sort()) {
    const { grantId } = await requireMerchantStall(tx, actor, venueId)
    grantIds.set(venueId, grantId)
  }
  const venues = await tx.venue.findMany({
    where: { id: { in: [...grantIds.keys()] } },
    select: { merchantId: true },
  })
  const merchantIds = new Set(venues.map((venue) => venue.merchantId))
  if (merchantIds.size !== 1)
    throw new DomainError('BAD_REQUEST', 'All outlets must belong to the same merchant')
  const [merchantId] = merchantIds as Set<string>
  return { merchantId, grantIds }
}

const confirmedScope = (
  merchantId: string,
  outletIds: string[],
  grantIds: Map<string, string>,
  contentVersion: number,
  now: Date,
  evidence = MERCHANT_EVIDENCE,
) => ({
  basis: 'SOURCE_SELECTED' as const,
  contentVersion,
  scopeHash: outletScopeHash({
    id: '',
    merchantId,
    applicability: 'SELECTED_OUTLETS',
    contentVersion,
    selectedVenueIds: outletIds,
  }),
  evidenceRef: `${evidence}${outletIds
    .map((id) => grantIds.get(id))
    .sort()
    .join(',')}`,
  retainedVenueIds: [],
  confirmedAt: now,
})

const contentOf = (input: MerchantDealBody) => ({
  title: input.title,
  description: input.description,
  category: input.category,
  cuisine: input.cuisine,
  offerType: input.offerType,
  discountPercent: input.discountPercent,
  priceMinor: input.priceCents,
  terms: input.terms === '' ? null : input.terms,
  validFrom: input.startDate ? startOfDay(input.startDate) : null,
  validUntil: input.endDate ? endAfterDay(input.endDate) : null,
})

const rejectPastEnd = (input: MerchantDealBody, now: Date) => {
  if (input.endDate && input.endDate < dayOf(now))
    throw new DomainError('BAD_REQUEST', 'The last day cannot be in the past')
}

const unsetOrNull = (field: string) => ({ OR: [{ [field]: null }, { [field]: { isSet: false } }] })

// Attaches the photo only if it is still this merchant's unused upload, like community
// submissions do.
const claimPhoto = async (
  tx: AccessTransaction,
  userId: string,
  dealId: string,
  photoKey: string,
) => {
  const claimed = await tx.uploadedFile.updateMany({
    where: {
      key: photoKey,
      uploaderId: userId,
      AND: [unsetOrNull('dealId'), unsetOrNull('deletedAt')],
    },
    data: { dealId },
  })
  if (claimed.count !== 1)
    throw new DomainError('BAD_REQUEST', 'The photo was not found. Please upload it again.')
}

// Leaving photoKey out, or sending the current photo's key, keeps it; a new key replaces it and
// null removes it. A removed photo is marked deleted, not unlinked, so the deal's history keeps it.
const changePhoto = async (
  tx: AccessTransaction,
  userId: string,
  dealId: string,
  current: { id: string; key: string } | undefined,
  photoKey: string | null | undefined,
  now: Date,
) => {
  if (photoKey === undefined || photoKey === (current?.key ?? null)) return
  if (current) await tx.uploadedFile.update({ where: { id: current.id }, data: { deletedAt: now } })
  if (photoKey) await claimPhoto(tx, userId, dealId, photoKey)
}

// Each change is a new content version that the merchant's grants approve at once.
const approvedAs = (userId: string, version: number, now: Date) => ({
  contentVersion: version,
  reviewedVersion: version,
  reviewedById: userId,
  reviewedAt: now,
})

export const createMerchantDeal = async (
  database: Database,
  actor: AuthenticatedActor,
  input: MerchantDealBody,
  now: Date,
): Promise<MerchantDeal> => {
  const { userId } = actor
  rejectPastEnd(input, now)
  const dealId = await accessTransaction(database, async (tx) => {
    const { merchantId, grantIds } = await authorizeOutlets(tx, actor, input.outletIds)
    const deal = await tx.deal.create({
      data: {
        ...contentOf(input),
        ...approvedAs(userId, 1, now),
        applicability: 'SELECTED_OUTLETS',
        origin: 'USER_SUBMITTED',
        reviewStatus: 'APPROVED',
        publishedAt: now,
        merchantId,
        submittedById: userId,
        scopeConfirmation: confirmedScope(merchantId, input.outletIds, grantIds, 1, now),
        venues: { create: input.outletIds.map((venueId) => ({ venueId })) },
      },
      select: { id: true },
    })
    if (input.photoKey) await claimPhoto(tx, userId, deal.id, input.photoKey)
    return deal.id
  })
  return readMerchantDeal(database, dealId, now)
}

// Reads a deal back for the response once its write has committed, which keeps the
// transaction short on a slow connection.
const readMerchantDeal = async (database: Database, dealId: string, now: Date) =>
  toMerchantDeal(
    await database.deal.findUniqueOrThrow({ where: { id: dealId }, select: merchantDealSelect }),
    now,
  )

const findOwnDeal = async (tx: AccessTransaction, userId: string, dealId: string) => {
  // Non-merchants are refused outright, before anything about the deal is looked up.
  await requireMerchantRole(tx, userId)
  const deal = await tx.deal.findFirst({
    where: { id: dealId, ...createdByMerchant(userId) },
    select: merchantDealSelect,
  })
  // Other people's deals are reported as missing, not forbidden, so they cannot be probed.
  if (!deal) throw new DomainError('NOT_FOUND', 'Deal not found')
  return deal
}

export const updateMerchantDeal = async (
  database: Database,
  actor: AuthenticatedActor,
  dealId: string,
  input: MerchantDealBody,
  now: Date,
): Promise<MerchantDeal> => {
  const { userId } = actor
  rejectPastEnd(input, now)
  await accessTransaction(database, async (tx) => {
    const deal = await findOwnDeal(tx, userId, dealId)
    if (hasEnded(deal, now))
      throw new DomainError('PRECONDITION_FAILED', 'Ended deals cannot be edited')
    // Moving a deal needs a grant for the outlets it leaves as well as the ones it joins.
    const oldOutletIds = deal.venues.map((link) => link.venueId)
    const { merchantId, grantIds } = await authorizeOutlets(tx, actor, [
      ...oldOutletIds,
      ...input.outletIds,
    ])
    const version = deal.contentVersion + 1
    await changePhoto(tx, userId, dealId, deal.images[0], input.photoKey, now)
    await tx.dealVenue.deleteMany({ where: { dealId } })
    await tx.deal.update({
      where: { id: dealId },
      data: {
        ...contentOf(input),
        ...approvedAs(userId, version, now),
        merchantId,
        scopeConfirmation: {
          set: confirmedScope(merchantId, input.outletIds, grantIds, version, now),
        },
        venues: { create: input.outletIds.map((venueId) => ({ venueId })) },
      },
      select: { id: true },
    })
  })
  return readMerchantDeal(database, dealId, now)
}

export const endMerchantDeal = async (
  database: Database,
  actor: AuthenticatedActor,
  dealId: string,
  now: Date,
): Promise<MerchantDeal> =>
  accessTransaction(database, async (tx) => {
    const { userId } = actor
    const deal = await findOwnDeal(tx, userId, dealId)
    if (hasEnded(deal, now)) return toMerchantDeal(deal, now)
    const outletIds = deal.venues.map((link) => link.venueId)
    const { merchantId, grantIds } = await authorizeOutlets(tx, actor, outletIds)
    const version = deal.contentVersion + 1
    const ended = await tx.deal.update({
      where: { id: dealId },
      data: {
        validUntil: now,
        ...approvedAs(userId, version, now),
        scopeConfirmation: {
          set: confirmedScope(merchantId, outletIds, grantIds, version, now),
        },
      },
      select: merchantDealSelect,
    })
    return toMerchantDeal(ended, now)
  })

// Deletes a deal that is scheduled (not started yet) or has ended; a live deal is ended first.
// It leaves the map and the merchant's dashboard at once, but the record is only marked deleted,
// so its comments, saves and history stay intact.
export const deleteMerchantDeal = async (
  database: Database,
  actor: AuthenticatedActor,
  dealId: string,
  now: Date,
): Promise<void> =>
  accessTransaction(database, async (tx) => {
    const deal = await findOwnDeal(tx, actor.userId, dealId)
    const scheduled = !!deal.validFrom && deal.validFrom > now
    if (!scheduled && !hasEnded(deal, now))
      throw new DomainError('PRECONDITION_FAILED', 'End this deal before deleting it')
    await authorizeOutlets(
      tx,
      actor,
      deal.venues.map((link) => link.venueId),
    )
    await tx.deal.update({ where: { id: dealId }, data: { deletedAt: now } })
  })

// ----- The deal behind a flash deal -----
// A flash deal saved from the deal form keeps its deal (the usual offer, title, photo) as an
// approved but unpublished deal at its one outlet, and its own evidence prefix keeps it out of the
// merchant's deal list. Go live publishes it for the flash window only (see flash-drops/merchant),
// so it is never public on its own as an ordinary deal.

const FLASH_EVIDENCE = 'merchant-flash:'

export type FlashDealContent = {
  title: string
  description: string
  category: string
  cuisine: string | null
  offerType: MerchantDeal['offerType']
  discountPercent: number | null
  priceCents: number | null
  terms: string
  photoKey?: string | null
}

const flashContentOf = (input: FlashDealContent) => ({
  title: input.title,
  description: input.description,
  category: input.category,
  cuisine: input.cuisine,
  offerType: input.offerType,
  discountPercent: input.discountPercent,
  priceMinor: input.priceCents,
  terms: input.terms === '' ? null : input.terms,
  validFrom: null,
  validUntil: null,
})

// Creates the hidden deal for a new flash deal and returns its id. Runs inside the flash deal's
// own transaction, which has already fenced platform access.
export const createFlashDeal = async (
  tx: AccessTransaction,
  actor: AuthenticatedActor,
  input: FlashDealContent,
  outletId: string,
  now: Date,
): Promise<string> => {
  const { merchantId, grantIds } = await authorizeOutlets(tx, actor, [outletId])
  const deal = await tx.deal.create({
    data: {
      ...flashContentOf(input),
      ...approvedAs(actor.userId, 1, now),
      applicability: 'SELECTED_OUTLETS',
      origin: 'USER_SUBMITTED',
      reviewStatus: 'APPROVED',
      publishedAt: null,
      merchantId,
      submittedById: actor.userId,
      scopeConfirmation: confirmedScope(merchantId, [outletId], grantIds, 1, now, FLASH_EVIDENCE),
      venues: { create: [{ venueId: outletId }] },
    },
    select: { id: true },
  })
  if (input.photoKey) await claimPhoto(tx, actor.userId, deal.id, input.photoKey)
  return deal.id
}

// Updates the hidden deal of a flash deal draft, possibly moving it to another outlet.
export const updateFlashDeal = async (
  tx: AccessTransaction,
  actor: AuthenticatedActor,
  dealId: string,
  input: FlashDealContent,
  outletId: string,
  now: Date,
) => {
  const deal = await tx.deal.findFirst({
    where: { id: dealId, submittedById: actor.userId, ...activeRecord },
    select: merchantDealSelect,
  })
  if (!deal) throw new DomainError('NOT_FOUND', 'Flash deal not found')
  const oldOutletIds = deal.venues.map((link) => link.venueId)
  const { merchantId, grantIds } = await authorizeOutlets(tx, actor, [...oldOutletIds, outletId])
  const version = deal.contentVersion + 1
  await changePhoto(tx, actor.userId, dealId, deal.images[0], input.photoKey, now)
  await tx.dealVenue.deleteMany({ where: { dealId } })
  await tx.deal.update({
    where: { id: dealId },
    data: {
      ...flashContentOf(input),
      ...approvedAs(actor.userId, version, now),
      merchantId,
      scopeConfirmation: {
        set: confirmedScope(merchantId, [outletId], grantIds, version, now, FLASH_EVIDENCE),
      },
      venues: { create: [{ venueId: outletId }] },
    },
  })
}
