import { publicImportedImage, publicImportedImageSelect } from '@api/modules/deals/public-images'
import type { Database } from '@api/modules/platform-admin/transaction'
import { activeRecord } from '@api/modules/platform-admin/venues'
import { isAway, isPresent, LOBBY_LIFETIME_MS, tally, voters } from '@api/modules/squad/rules'
import type { RoomRow, SeatRow, Tx } from '@api/modules/squad/store'
import type { SquadAvatar, SquadDeal, SquadState } from '@broke-oclock/contracts/squad'

type Reader = Tx | Database

const CENTS = 100

const labelOf = (deal: {
  offerType: string
  priceMinor: number | null
  discountPercent: number | null
}) => {
  if (deal.priceMinor !== null && deal.priceMinor > 0)
    return `$${(deal.priceMinor / CENTS).toFixed(2)}`
  if (deal.offerType === 'BUY_ONE_GET_ONE') return '1-for-1'
  if (deal.offerType === 'PERCENT_OFF' && deal.discountPercent)
    return `${deal.discountPercent}% off`
  return 'Deal'
}

export const loadDeals = async (
  reader: Reader,
  dealIds: readonly string[],
  now: Date,
): Promise<SquadDeal[]> => {
  const rows = await reader.deal.findMany({
    where: { id: { in: [...new Set(dealIds)] } },
    select: {
      id: true,
      title: true,
      category: true,
      offerType: true,
      priceMinor: true,
      discountPercent: true,
      validUntil: true,
      deletedAt: true,
      reviewStatus: true,
      images: {
        where: activeRecord,
        orderBy: { createdAt: 'asc' },
        select: { url: true },
        take: 1,
      },
      sources: publicImportedImageSelect,
      venues: {
        take: 1,
        select: { venue: { select: { id: true, name: true, latitude: true, longitude: true } } },
      },
    },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  return dealIds.flatMap((id): SquadDeal[] => {
    const row = byId.get(id)
    if (!row) return []
    const venue = row.venues[0]?.venue ?? null
    return [
      {
        id: row.id,
        title: row.title,
        label: labelOf(row),
        category: row.category,
        priceMinor: row.priceMinor ?? null,
        imageUrl: row.images[0]?.url ?? publicImportedImage(row).imageUrl,
        venueId: venue?.id ?? null,
        venueName: venue?.name ?? null,
        lat: venue?.latitude ?? null,
        lng: venue?.longitude ?? null,
        ended:
          !!row.deletedAt ||
          row.reviewStatus !== 'APPROVED' ||
          (!!row.validUntil && row.validUntil <= now),
      },
    ]
  })
}

const asAvatar = (value: string) => value as SquadAvatar
const asStance = (value: string | null | undefined) =>
  value === 'YAY' || value === 'NAH' ? value : null
const asChoice = (value: string | null | undefined) =>
  value === 'AGAIN' || value === 'NEXT' ? value : null

export const buildState = async (
  reader: Reader,
  room: RoomRow,
  seats: readonly SeatRow[],
  userId: string,
  now: Date,
): Promise<SquadState> => {
  const [deals, ballots, yayTotals] = await Promise.all([
    loadDeals(reader, room.dealIds, now),
    reader.squadVote.findMany({
      where: { roomId: room.id, dealIndex: room.dealIndex, round: room.round },
      select: { memberId: true, stance: true, choice: true, yays: true },
    }),
    room.phase === 'OUT_OF_DEALS'
      ? reader.squadVote.groupBy({
          by: ['dealIndex'],
          where: { roomId: room.id },
          _sum: { yays: true },
        })
      : Promise.resolve([]),
  ])
  const cast = new Map(ballots.map((ballot) => [ballot.memberId, ballot]))
  const voterIds = voters(seats, now).map((seat) => seat.id)
  const mine = seats.find((seat) => seat.userId === userId)
  const top = [...yayTotals].sort((a, b) => (b._sum.yays ?? 0) - (a._sum.yays ?? 0))[0]
  return {
    code: room.code,
    status: room.status,
    phase: room.phase,
    closeReason:
      room.closeReason === 'HOST_CLOSED' ||
      room.closeReason === 'EXPIRED' ||
      room.closeReason === 'EMPTY'
        ? room.closeReason
        : null,
    capacity: room.capacity,
    dealIndex: room.dealIndex,
    round: room.round,
    deals,
    matchDealId: room.matchDealId ?? null,
    topDealId: top && (top._sum.yays ?? 0) > 0 ? (room.dealIds[top.dealIndex] ?? null) : null,
    members: seats.filter(isPresent).map((seat) => {
      const ballot = cast.get(seat.id)
      return {
        id: seat.id,
        name: seat.displayName,
        avatar: asAvatar(seat.avatar),
        isHost: seat.isHost,
        spectator: seat.spectator,
        away: isAway(seat, now),
        stance: asStance(ballot?.stance),
        choice: asChoice(ballot?.choice),
        yays: ballot?.yays ?? 0,
      }
    }),
    me: mine
      ? {
          memberId: mine.id,
          isHost: mine.isHost && isPresent(mine),
          spectator: mine.spectator,
          left: !!mine.leftAt,
          kicked: !!mine.kickedAt,
        }
      : null,
    tally: tally(
      voterIds,
      ballots.map((ballot) => ({
        memberId: ballot.memberId,
        stance: ballot.stance,
        choice: ballot.choice,
      })),
    ),
    createdAt: room.createdAt.toISOString(),
    expiresAt:
      room.status === 'LOBBY'
        ? new Date(room.createdAt.getTime() + LOBBY_LIFETIME_MS).toISOString()
        : null,
    serverTime: now.toISOString(),
  }
}
