import { type AuthenticatedActor, readActiveSession } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import {
  clashes,
  DRAFT_STATUSES,
  displayStatus,
  distanceMetres,
  isDraft,
  manyCodes,
  viewOf,
} from '@api/modules/flash-drops/policy'
import {
  type DropContext,
  type DropRow,
  dropSelect,
  flashOfferOf,
  loadContext,
  toDropCore,
} from '@api/modules/flash-drops/records'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import {
  type AccessTransaction,
  accessTransaction,
  conflict,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import type {
  AdminFlashDrop,
  AdminFlashDropDecision,
  AdminFlashDropsResponse,
  FlashDropView,
} from '@broke-oclock/contracts/flash-drops'

// Admin oversight of merchant flash deals. Merchants send their own flash deals live; admins see
// every one once it has gone live (scheduled, live or ended) and can remove it, which stops it at
// once and hides it from the map while keeping the record and its claimed codes. Each removal is
// written to the platform audit log in the same transaction. Drafts stay the merchant's own.

const MAX_LISTED = 100
const DAY_MS = 86_400_000
const SINGAPORE_OFFSET_MS = 8 * 3_600_000
// Ended drops stay in the Ended tab for a week.
const ENDED_WINDOW_DAYS = 7

const readAsAdmin = <T>(
  database: Database,
  actor: AuthenticatedActor,
  work: (tx: AccessTransaction) => Promise<T>,
): Promise<T> =>
  database.$transaction(async (tx) => {
    const { user } = await readActiveSession(tx, actor)
    if (user.role !== 'ADMIN') throw new DomainError('FORBIDDEN')
    return work(tx)
  })

const startOfSingaporeDay = (now: Date) =>
  new Date(
    Math.floor((now.getTime() + SINGAPORE_OFFSET_MS) / DAY_MS) * DAY_MS - SINGAPORE_OFFSET_MS,
  )

const placed = (row: DropRow, context: DropContext) => {
  const venue = context.venues.get(row.venueId)
  return venue
    ? {
        lat: venue.latitude,
        lng: venue.longitude,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        radiusMetres: row.radiusMetres,
      }
    : null
}

const toAdminDrop = async (
  tx: AccessTransaction,
  row: DropRow,
  context: DropContext,
  rivals: readonly DropRow[],
  now: Date,
): Promise<AdminFlashDrop> => {
  const venue = context.venues.get(row.venueId)
  const deal = context.deals.get(row.dealId)
  const grant = await tx.stallGrant.findUnique({
    where: { userId_venueId: { userId: row.merchantUserId, venueId: row.venueId } },
    select: { revokedAt: true },
  })
  const here = placed(row, context)
  const overlaps = here
    ? rivals
        .filter((other) => other.id !== row.id)
        .flatMap((other) => {
          const there = placed(other, context)
          if (!there || !clashes(here, there)) return []
          return [
            {
              id: other.id,
              dealTitle: context.deals.get(other.dealId)?.title ?? 'Unavailable',
              outletName: context.venues.get(other.venueId)?.name ?? 'Unavailable',
              distanceMetres: distanceMetres(here, there),
            },
          ]
        })
        .slice(0, 10)
    : []
  const offer = flashOfferOf(row, deal)
  const usual = offer.usualPriceCents
  return {
    ...toDropCore(row, context, now),
    merchantName: (venue && context.merchants.get(venue.merchantId)) ?? 'Unavailable',
    outletLat: venue?.latitude ?? 0,
    outletLng: venue?.longitude ?? 0,
    checks: {
      merchantHoldsOutlet: !!grant && !grant.revokedAt,
      outletLocated: !!venue?.geographyEvidence,
      // Only a fixed flash price with a usual price can be compared.
      priceLower:
        usual === null || offer.flashPriceCents === null ? null : offer.flashPriceCents < usual,
      manyCodes: manyCodes(row.codeLimit),
      overlaps,
    },
  }
}

export const listAdminFlashDrops = (
  database: Database,
  actor: AuthenticatedActor,
  view: FlashDropView,
  now: Date,
): Promise<AdminFlashDropsResponse> =>
  readAsAdmin(database, actor, async (tx) => {
    const since = new Date(now.getTime() - ENDED_WINDOW_DAYS * DAY_MS)
    const rows = await tx.flashDrop.findMany({
      where: { endsAt: { gt: since }, status: { notIn: [...DRAFT_STATUSES] } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: dropSelect,
    })
    const counts = { scheduled: 0, live: 0, ended: 0 }
    for (const row of rows) {
      const shown = viewOf(displayStatus(row, now))
      if (shown) counts[shown] += 1
    }
    const listed = rows
      .filter((row) => viewOf(displayStatus(row, now)) === view)
      .sort((a, b) =>
        view === 'ended'
          ? b.endsAt.getTime() - a.endsAt.getTime()
          : a.startsAt.getTime() - b.startsAt.getTime(),
      )
      .slice(0, MAX_LISTED)
    // Overlaps are checked against every drop that could still run, not just this tab.
    const rivals = rows.filter((row) => row.status === 'APPROVED' && row.endsAt > now)
    const context = await loadContext(tx, [...listed, ...rivals])
    const claimedToday = await tx.flashDropClaim.count({
      where: { createdAt: { gte: startOfSingaporeDay(now) } },
    })
    return {
      items: await Promise.all(listed.map((row) => toAdminDrop(tx, row, context, rivals, now))),
      counts: { ...counts, claimedToday },
    }
  })

// Only a flash deal that is scheduled or live can be removed.
const REMOVABLE = ['SCHEDULED', 'LIVE']

export const decideFlashDrop = (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  input: AdminFlashDropDecision,
  now: Date,
): Promise<AdminFlashDrop> =>
  accessTransaction(database, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const current = await tx.flashDrop.findUnique({ where: { id: dropId }, select: dropSelect })
    // Drafts are the merchant's own and read as missing.
    if (!current || isDraft(current.status))
      throw new DomainError('NOT_FOUND', 'Flash deal not found')
    if (current.version !== input.version) throw conflict()
    const shown = displayStatus(current, now)
    if (!REMOVABLE.includes(shown))
      throw new DomainError(
        'PRECONDITION_FAILED',
        `This flash deal is ${shown.toLowerCase()} and cannot be removed`,
      )
    const note = input.note.trim()
    const result = await tx.flashDrop.updateMany({
      where: { id: dropId, version: current.version, status: current.status },
      data: {
        status: 'STOPPED',
        reviewNote: note,
        reviewedById: admin.id,
        reviewedAt: now,
        version: current.version + 1,
      },
    })
    if (result.count !== 1) throw conflict()
    // Its deal is taken off the map too.
    await tx.deal.updateMany({
      where: { id: current.dealId },
      data: { validUntil: now, publishedAt: null },
    })
    await appendAdminAudit(tx, admin, {
      action: 'FLASH_DROP_STOPPED',
      subjectType: 'FLASH_DROP',
      subjectId: dropId,
      venueId: current.venueId,
      targetUserId: current.merchantUserId,
      note,
      details: {
        operationVersionBefore: current.version,
        operationVersionAfter: current.version + 1,
        previousStatus: 'APPROVED',
        newStatus: 'STOPPED',
        changedFields: ['status'],
      },
    })
    const row = await tx.flashDrop.findUniqueOrThrow({ where: { id: dropId }, select: dropSelect })
    const rivals = await tx.flashDrop.findMany({
      where: { status: 'APPROVED', endsAt: { gt: now } },
      take: 500,
      select: dropSelect,
    })
    const context = await loadContext(tx, [row, ...rivals])
    return toAdminDrop(tx, row, context, rivals, now)
  })
