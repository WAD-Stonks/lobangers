import { randomInt } from 'node:crypto'
import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { isLive, newClaimCode } from '@api/modules/flash-drops/policy'
import { dropSelect, loadContext, usualPrice } from '@api/modules/flash-drops/records'
import type { Database } from '@api/modules/platform-admin/transaction'
import type {
  ActiveFlashDropsResponse,
  FlashCode,
  PublicFlashDrop,
} from '@broke-oclock/contracts/flash-drops'

// What visitors see: approved drops running right now, one claim code each, and their codes.

const MAX_ACTIVE = 50
const MAX_CODES = 100
const CODE_ATTEMPTS = 4
const soldOut = () => new DomainError('CONFLICT', 'All the codes for this drop have been claimed')

export const listActiveFlashDrops = async (
  database: Database,
  now: Date,
): Promise<ActiveFlashDropsResponse> => {
  const rows = await database.flashDrop.findMany({
    where: { status: 'APPROVED', startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
    take: MAX_ACTIVE * 2,
    select: dropSelect,
  })
  const live = rows.filter((row) => isLive(row, now))
  // Most of the time nothing is running; skip the three lookups that would find nothing.
  if (live.length === 0) return { serverTime: now.toISOString(), items: [] }
  const context = await loadContext(database, live)
  const items = live.flatMap((row): PublicFlashDrop[] => {
    const deal = context.deals.get(row.dealId)
    const venue = context.venues.get(row.venueId)
    if (!deal || !venue) return []
    return [
      {
        id: row.id,
        dealId: row.dealId,
        dealTitle: deal.title,
        category: deal.category,
        venueId: row.venueId,
        venueName: venue.name,
        lat: venue.latitude,
        lng: venue.longitude,
        flashPriceCents: row.flashPriceMinor,
        usualPriceCents: usualPrice(deal),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        radiusMetres: row.radiusMetres,
        codesLeft: Math.max(0, row.codeLimit - row.claimedCount),
        codeLimit: row.codeLimit,
        demo: row.demo,
      },
    ]
  })
  return { serverTime: now.toISOString(), items: items.slice(0, MAX_ACTIVE) }
}

const isDuplicate = (error: unknown, field: string) =>
  typeof error === 'object' &&
  !!error &&
  'code' in error &&
  error.code === 'P2002' &&
  JSON.stringify((error as { meta?: unknown }).meta ?? '').includes(field)

type ClaimRow = { code: string; dropId: string; createdAt: Date }
type DropRows = Awaited<ReturnType<typeof loadDrops>>

const loadDrops = async (database: Database, dropIds: readonly string[]) => {
  const drops = await database.flashDrop.findMany({
    where: { id: { in: [...new Set(dropIds)] } },
    select: dropSelect,
  })
  return {
    byId: new Map(drops.map((drop) => [drop.id, drop])),
    context: await loadContext(database, drops),
  }
}

const toCode = (claim: ClaimRow, { byId, context }: DropRows, now: Date): FlashCode | null => {
  const drop = byId.get(claim.dropId)
  if (!drop) return null
  return {
    code: claim.code,
    dropId: drop.id,
    dealId: drop.dealId,
    dealTitle: context.deals.get(drop.dealId)?.title ?? 'Unavailable',
    venueName: context.venues.get(drop.venueId)?.name ?? 'Unavailable',
    flashPriceCents: drop.flashPriceMinor,
    claimedAt: claim.createdAt.toISOString(),
    endsAt: drop.endsAt.toISOString(),
    // A code is good until its drop ends or is stopped; it no longer matters if codes ran out.
    active: drop.endsAt > now && drop.status === 'APPROVED',
    demo: drop.demo,
  }
}

const claimRow = (database: Database, dropId: string, userId: string) =>
  database.flashDropClaim.findUnique({ where: { dropId_userId: { dropId, userId } } })

// Writes the code for a count already taken, trying a fresh code on the rare collision. A
// double tap by the same person returns their first code and gives the count back.
const writeClaim = async (database: Database, dropId: string, userId: string) => {
  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
    try {
      const claim = await database.flashDropClaim.create({
        data: { dropId, userId, code: newClaimCode((max) => randomInt(max)) },
      })
      return { created: true, claim }
    } catch (error) {
      if (isDuplicate(error, 'code') && attempt < CODE_ATTEMPTS) continue
      await database.flashDrop.update({
        where: { id: dropId },
        data: { claimedCount: { decrement: 1 } },
      })
      const existing = await claimRow(database, dropId, userId)
      if (existing) return { created: false, claim: existing }
      throw error
    }
  }
  throw new DomainError('CONFLICT', 'Could not make a code. Try again.')
}

// One code per person per drop; claiming again returns the same code. The count goes up in one
// atomic "only while codes are left" update, so a crowd tapping at once never gets more codes
// than the limit and nobody is turned away while codes remain.
export const claimFlashCode = async (
  database: Database,
  actor: AuthenticatedActor,
  dropId: string,
  now: Date,
): Promise<{ created: boolean; code: FlashCode }> => {
  const existing = await claimRow(database, dropId, actor.userId)
  const result = existing
    ? { created: false, claim: existing }
    : await (async () => {
        const drop = await database.flashDrop.findUnique({
          where: { id: dropId },
          select: dropSelect,
        })
        if (!drop || drop.status === 'PENDING' || drop.status === 'SENT_BACK')
          throw new DomainError('NOT_FOUND', 'Flash drop not found')
        if (!isLive(drop, now)) {
          if (drop.claimedCount >= drop.codeLimit) throw soldOut()
          throw new DomainError('PRECONDITION_FAILED', 'This flash drop is not running right now')
        }
        const counted = await database.flashDrop.updateMany({
          where: {
            id: dropId,
            status: 'APPROVED',
            endsAt: { gt: now },
            claimedCount: { lt: drop.codeLimit },
          },
          data: { claimedCount: { increment: 1 } },
        })
        if (counted.count !== 1) throw soldOut()
        return writeClaim(database, dropId, actor.userId)
      })()
  const code = toCode(result.claim, await loadDrops(database, [dropId]), now)
  if (!code) throw new DomainError('NOT_FOUND', 'Flash drop not found')
  return { created: result.created, code }
}

export const listMyFlashCodes = async (
  database: Database,
  actor: AuthenticatedActor,
  now: Date,
): Promise<FlashCode[]> => {
  const claims = await database.flashDropClaim.findMany({
    where: { userId: actor.userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_CODES,
    select: { code: true, dropId: true, createdAt: true },
  })
  const drops = await loadDrops(
    database,
    claims.map((claim) => claim.dropId),
  )
  return claims.flatMap((claim) => toCode(claim, drops, now) ?? [])
}
