import { randomBytes, randomInt } from 'node:crypto'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  defaultAvatarFor,
  distanceMetres,
  fuzzPoint,
  type Point,
  randomOffset,
} from '@api/modules/presence/fuzz'
import {
  type MyPresence,
  type NearbyPeopleResponse,
  type NearbyPerson,
  PRESENCE_MAX_ITEMS,
  PRESENCE_RADIUS_METRES,
  PRESENCE_TTL_MS,
  type PresenceAvatar,
  type PresenceBody,
  presenceAvatarSchema,
} from '@broke-oclock/contracts/presence'

export const MIN_MOVE_INTERVAL_MS = 10_000
const SCAN_LIMIT = 600
const METRES_PER_DEGREE_LAT = 111_320

type PresenceRow = {
  token: string
  avatar: string
  lat: number
  lng: number
  offsetNorth: number
  offsetEast: number
  expiresAt: Date
  updatedAt: Date
}

const select = {
  token: true,
  avatar: true,
  lat: true,
  lng: true,
  offsetNorth: true,
  offsetEast: true,
  expiresAt: true,
  updatedAt: true,
} as const

const secureRandom = () => randomInt(0, 2 ** 32) / 2 ** 32
const newToken = () => randomBytes(16).toString('base64url')

const avatarOf = (row: Pick<PresenceRow, 'avatar'>, fallback: PresenceAvatar): PresenceAvatar => {
  const parsed = presenceAvatarSchema.safeParse(row.avatar)
  return parsed.success ? parsed.data : fallback
}

const toMine = (row: PresenceRow, fallback: PresenceAvatar): MyPresence => ({
  token: row.token,
  avatar: avatarOf(row, fallback),
  lat: row.lat,
  lng: row.lng,
  expiresAt: row.expiresAt.toISOString(),
})

const isDuplicate = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'

const freshSession = (raw: Point) => {
  const offset = randomOffset(secureRandom)
  const point = fuzzPoint(raw, offset)
  return { token: newToken(), offsetNorth: offset.north, offsetEast: offset.east, ...point }
}

const nextData = (
  row: PresenceRow | null,
  body: PresenceBody,
  avatar: PresenceAvatar,
  now: Date,
) => {
  const expiresAt = new Date(now.getTime() + PRESENCE_TTL_MS)
  const raw = { lat: body.lat, lng: body.lng }
  if (!row || row.expiresAt <= now) return { ...freshSession(raw), avatar, expiresAt }
  if (now.getTime() - row.updatedAt.getTime() < MIN_MOVE_INTERVAL_MS) return { avatar }
  return {
    avatar,
    expiresAt,
    ...fuzzPoint(raw, { north: row.offsetNorth, east: row.offsetEast }),
  }
}

export const sharePresence = async (
  database: Database,
  userId: string,
  body: PresenceBody,
  now: Date,
): Promise<MyPresence> => {
  const fallback = defaultAvatarFor(userId)
  const existing = await database.nearbyPresence.findUnique({ where: { userId }, select })
  const avatar = body.avatar ?? (existing ? avatarOf(existing, fallback) : fallback)
  const data = nextData(existing, body, avatar, now)
  if (existing) {
    const row = await database.nearbyPresence.update({ where: { userId }, data, select })
    return toMine(row, fallback)
  }
  try {
    const created = {
      ...freshSession(body),
      avatar,
      expiresAt: new Date(now.getTime() + PRESENCE_TTL_MS),
    }
    const row = await database.nearbyPresence.create({ data: { userId, ...created }, select })
    return toMine(row, fallback)
  } catch (error) {
    if (!isDuplicate(error)) throw error
    const row = await database.nearbyPresence.update({
      where: { userId },
      data: { avatar },
      select,
    })
    return toMine(row, fallback)
  }
}

export const hidePresence = async (database: Database, userId: string): Promise<void> => {
  await database.nearbyPresence.deleteMany({ where: { userId } })
}

const boxAround = (centre: Point, metres: number) => {
  const dLat = metres / METRES_PER_DEGREE_LAT
  const dLng = metres / (METRES_PER_DEGREE_LAT * Math.cos((centre.lat * Math.PI) / 180))
  return {
    lat: { gte: centre.lat - dLat, lte: centre.lat + dLat },
    lng: { gte: centre.lng - dLng, lte: centre.lng + dLng },
  }
}

export const listNearbyPeople = async (
  database: Database,
  viewerUserId: string | null,
  centre: Point,
  now: Date,
): Promise<NearbyPeopleResponse> => {
  const rows = await database.nearbyPresence.findMany({
    where: {
      expiresAt: { gt: now },
      ...boxAround(centre, PRESENCE_RADIUS_METRES),
      ...(viewerUserId ? { userId: { not: viewerUserId } } : {}),
    },
    select: { ...select, userId: true },
    take: SCAN_LIMIT,
  })
  const items = rows
    .map((row) => ({ row, distance: distanceMetres(centre, row) }))
    .filter(({ distance }) => distance <= PRESENCE_RADIUS_METRES)
    .sort((a, b) => a.distance - b.distance || a.row.token.localeCompare(b.row.token))
    .slice(0, PRESENCE_MAX_ITEMS)
    .map(
      ({ row }): NearbyPerson => ({
        token: row.token,
        avatar: avatarOf(row, defaultAvatarFor(row.userId)),
        lat: row.lat,
        lng: row.lng,
      }),
    )
  const mine = viewerUserId
    ? await database.nearbyPresence.findFirst({
        where: { userId: viewerUserId, expiresAt: { gt: now } },
        select,
      })
    : null
  return {
    serverTime: now.toISOString(),
    items,
    me: mine && viewerUserId ? toMine(mine, defaultAvatarFor(viewerUserId)) : null,
  }
}
