import type { Page, Route } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import * as fixtures from './community-fixtures'

const { DEALS } = fixtures

type FakeMember = {
  id: string
  name: string
  avatar: string
  isHost: boolean
  spectator: boolean
  mine: boolean
}

type FakeRoom = {
  code: string
  status: 'LOBBY' | 'LIVE' | 'CLOSED'
  closeReason: 'HOST_CLOSED' | 'EXPIRED' | 'EMPTY' | null
  capacity: number
  dealIds: string[]
  members: FakeMember[]
  left: boolean
  kicked: boolean
  createdAt: string
}

const hexId = (seed: number) => seed.toString(16).padStart(24, 'b')
let nextId = 1

export const fakeMember = (name: string, overrides: Partial<FakeMember> = {}): FakeMember => ({
  id: hexId(nextId++),
  name,
  avatar: 'teh',
  isHost: false,
  spectator: false,
  mine: false,
  ...overrides,
})

const squadDeal = (id: string) => {
  const deal = DEALS.find((item) => item.id === id) ?? DEALS[0]
  const venues = (deal?.venues ?? []) as { id: string; name: string; lat: number; lng: number }[]
  const venue = venues[0]
  return {
    id: String(deal?.id),
    title: String(deal?.title),
    label: String(deal?.label),
    category: String(deal?.category),
    priceMinor: (deal?.priceMinor as number | null) ?? null,
    imageUrl: null,
    venueId: venue?.id ?? null,
    venueName: venue?.name ?? null,
    lat: venue?.lat ?? null,
    lng: venue?.lng ?? null,
    ended: false,
  }
}

const stateOf = (room: FakeRoom) => {
  const me = room.members.find((member) => member.mine)
  const now = new Date().toISOString()
  return {
    code: room.code,
    status: room.status,
    phase: 'VOTING',
    closeReason: room.closeReason,
    capacity: room.capacity,
    dealIndex: 0,
    round: 0,
    deals: room.dealIds.map(squadDeal),
    matchDealId: null,
    topDealId: null,
    members: room.members.map(({ mine: _mine, ...member }) => ({
      ...member,
      away: false,
      stance: null,
      choice: null,
      yays: 0,
    })),
    me:
      me || room.left || room.kicked
        ? {
            memberId: me?.id ?? hexId(9999),
            isHost: me?.isHost ?? false,
            spectator: me?.spectator ?? false,
            left: room.left,
            kicked: room.kicked,
          }
        : null,
    tally: { yesPeople: 0, voters: 0, voted: 0, again: 0, next: 0 },
    createdAt: room.createdAt,
    expiresAt:
      room.status === 'LOBBY'
        ? new Date(new Date(room.createdAt).getTime() + 30 * 60_000).toISOString()
        : null,
    serverTime: now,
  }
}

const fail = (route: Route, status: number, code: string, message: string) =>
  route.fulfill({ status, json: { error: { code, message } } })

export const mockSquadApi = async (page: Page) => {
  const rooms = new Map<string, FakeRoom>()

  const seed = (room: Partial<FakeRoom> & { code: string; members: FakeMember[] }) => {
    rooms.set(room.code, {
      status: 'LOBBY',
      closeReason: null,
      capacity: 4,
      dealIds: [String(DEALS[0]?.id), String(DEALS[1]?.id)],
      left: false,
      kicked: false,
      createdAt: new Date().toISOString(),
      ...room,
    })
  }

  const handle = async (route: Route) => {
    const request = route.request()
    const parts = new URL(request.url()).pathname.split('/').slice(4)
    const [code, action] = parts
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    if (!code) {
      const created = {
        code: 'KOPI',
        members: [
          fakeMember(String(body.displayName), {
            avatar: String(body.avatar),
            isHost: true,
            mine: true,
          }),
        ],
        capacity: Number(body.capacity),
        dealIds: body.dealIds as string[],
      }
      seed(created)
      return route.fulfill({ json: stateOf(rooms.get('KOPI') as FakeRoom) })
    }
    const room = rooms.get(code)
    if (!room)
      return fail(
        route,
        404,
        'NOT_FOUND',
        'No room with that code. Check the letters with your friend.',
      )
    const players = room.members.filter((member) => !member.spectator)
    if (!action) {
      return route.fulfill({
        json: {
          code: room.code,
          status: room.status,
          capacity: room.capacity,
          members: players.length,
          hostName: room.members.find((member) => member.isHost)?.name ?? null,
          names: room.members.map((member) => member.name),
          createdAt: room.createdAt,
          serverTime: new Date().toISOString(),
        },
      })
    }
    if (action === 'join') {
      if (room.status === 'CLOSED')
        return fail(route, 412, 'PRECONDITION_FAILED', 'This room has closed')
      const name = String(body.displayName)
      const taken = room.members.find((member) => member.name.toLowerCase() === name.toLowerCase())
      if (taken)
        return fail(
          route,
          409,
          'CONFLICT',
          `Someone here is already called ${taken.name}. Add an initial?`,
        )
      const spectator = room.status === 'LIVE'
      if (!spectator && players.length >= room.capacity)
        return fail(
          route,
          409,
          'CONFLICT',
          `Room ${room.code} is full (${room.capacity} of ${room.capacity})`,
        )
      room.members = [
        ...room.members,
        fakeMember(name, { avatar: String(body.avatar), spectator, mine: true }),
      ]
      return route.fulfill({ json: stateOf(room) })
    }
    if (action === 'sync')
      return route.fulfill({ json: { state: stateOf(room), events: [], nextSeq: 0 } })
    if (action === 'start') room.status = 'LIVE'
    if (action === 'close') {
      room.status = 'CLOSED'
      room.closeReason = 'HOST_CLOSED'
    }
    if (action === 'leave') {
      room.members = room.members.filter((member) => !member.mine)
      room.left = true
    }
    if (action === 'members') room.members = room.members.filter((member) => member.id !== parts[2])
    return route.fulfill({ json: stateOf(room) })
  }

  await page.route('**/api/squad/rooms**', handle)

  return {
    seed,
    addMember: (code: string, member: FakeMember) => {
      const room = rooms.get(code)
      if (room) room.members = [...room.members, member]
    },
  }
}
