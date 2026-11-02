import type { SquadMember, SquadState } from '@broke-oclock/contracts/squad'
import { flushPromises, mount } from '@vue/test-utils'
import {
  clampCapacity,
  codeFromQuery,
  defaultSquadName,
  formatCountdown,
  joinProblemFor,
  NEARBY_METRES,
  nearbyDealIds,
  nearestDeals,
  normaliseCode,
  squadNameError,
  toggleDealId,
} from '@web/modules/squad/squad-forms'
import { DEALS, HAWKER_VENUE, KOPI, NOODLES, RICE } from '@web-tests/support/shell-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic Makan Squad rooms, members and deals for the screens around the live vote. Nothing
// here is a real person, room or price.
const fakes = vi.hoisted(() => ({ room: null as unknown, shell: null as unknown, peek: vi.fn() }))

vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () =>
      ref({ data: { user: { id: 'f'.repeat(24), name: 'Synthetic Allison Tan', role: 'USER' } } }),
  },
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: { squad: { peek: (code: string) => fakes.peek(code) } },
}))
vi.mock('@web/modules/squad/use-squad-room', () => ({
  useSquadRoom: () => fakes.room,
  messageFor: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('@web/modules/map-shell/shell-state', () => ({ useShell: () => fakes.shell }))
vi.mock('@web/modules/map-shell/use-saved-deals', () => ({
  useSavedDeals: () => ({ isSaved: (id: string) => id === 'e'.repeat(24) }),
}))

const member = (id: string, name: string, overrides: Partial<SquadMember> = {}): SquadMember => ({
  id: id.repeat(24),
  name,
  avatar: 'kopi',
  isHost: false,
  spectator: false,
  away: false,
  stance: null,
  choice: null,
  yays: 0,
  ...overrides,
})

const HOST = member('1', 'Synthetic Allison', { isHost: true, avatar: 'bao' })
const GUEST = member('2', 'Synthetic Noah', { avatar: 'teh' })

const lobbyState = (members: SquadMember[], me = HOST): SquadState => ({
  code: 'KOPI',
  status: 'LOBBY',
  phase: 'VOTING',
  closeReason: null,
  capacity: 4,
  dealIndex: 0,
  round: 0,
  deals: [],
  matchDealId: null,
  topDealId: null,
  members,
  me: { memberId: me.id, isHost: me.isHost, spectator: false, left: false, kicked: false },
  tally: { yesPeople: 0, voters: 0, voted: 0, again: 0, next: 0 },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  serverTime: new Date().toISOString(),
})

const fakeRoom = (state: SquadState | null = null) => ({
  code: shallowRef(state?.code ?? null),
  state: shallowRef(state),
  error: shallowRef(''),
  busy: shallowRef(false),
  open: vi.fn(),
  forget: vi.fn(),
  start: vi.fn(async () => state),
  close: vi.fn(async () => state),
  leave: vi.fn(async () => state),
  remove: vi.fn(async () => state),
  create: vi.fn(async () => ({ code: 'KOPI' })),
  join: vi.fn(async () => state),
  addDeals: vi.fn(async () => state),
})

fakes.shell = {
  deals: shallowRef(DEALS),
  position: shallowRef(null),
  status: ref('ready'),
  reload: () => undefined,
}

const stub = { render: () => h('div') }
const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'browse', component: stub },
      { path: '/deals/:dealId', name: 'deal', component: stub },
      { path: '/squad/new', name: 'squad-new', component: stub },
      { path: '/squad/join', name: 'squad-join', component: stub },
      { path: '/squad/:code', name: 'squad-room', component: stub },
      { path: '/login', name: 'login', component: stub },
      { path: '/register', name: 'register', component: stub },
    ],
  })

const mountAt = async (component: object, path: string, props: Record<string, unknown> = {}) => {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { props, global: { plugins: [router] } })
  await flushPromises()
  return { router, wrapper }
}

describe('squad form helpers', () => {
  it('normalises typed and pasted codes to four capitals', () => {
    expect(normaliseCode('kopi')).toBe('KOPI')
    expect(normaliseCode(' k o-p i x')).toBe('KOPI')
    expect(normaliseCode('k0p')).toBe('KP')
    expect(codeFromQuery('teh0')).toBeNull()
    expect(codeFromQuery('tehc')).toBe('TEHC')
    expect(codeFromQuery(['KOPI'])).toBeNull()
  })

  it('defaults the name to the first name and validates it', () => {
    expect(defaultSquadName('Synthetic Allison Tan')).toBe('Synthetic')
    expect(defaultSquadName('  Noah ')).toBe('Noah')
    expect(defaultSquadName('Abcdefghijklmnopqrstuvwxyz')).toHaveLength(16)
    expect(defaultSquadName(null)).toBe('')
    expect(squadNameError('   ')).toMatch(/Type the name/)
    expect(squadNameError('x'.repeat(17))).toMatch(/16 characters/)
    expect(squadNameError('Noah')).toBe('')
  })

  it('keeps the room size between two and eight', () => {
    expect(clampCapacity(1)).toBe(2)
    expect(clampCapacity(9)).toBe(8)
    expect(clampCapacity(5)).toBe(5)
  })

  it('toggles deals without changing the list it was given, up to the limit', () => {
    const picked = ['a', 'b'] as const
    expect(toggleDealId(picked, 'c')).toEqual(['a', 'b', 'c'])
    expect(toggleDealId(picked, 'a')).toEqual(['b'])
    expect(toggleDealId(picked, 'c', 2)).toBe(picked)
    expect(picked).toEqual(['a', 'b'])
  })

  it('offers each deal once, nearest first', () => {
    const position = { lat: HAWKER_VENUE.lat, lng: HAWKER_VENUE.lng }
    const rows = nearestDeals([KOPI, NOODLES, RICE, KOPI], position)
    expect(rows.map((row) => row.deal.id)).toEqual([NOODLES.id, RICE.id, KOPI.id])
    expect(rows[0]?.distanceMetres).toBe(0)
    expect(nearestDeals(DEALS, null).map((row) => row.deal.id)).toEqual(DEALS.map((d) => d.id))
  })

  it('picks every nearby deal for a random room, capped at the room limit', () => {
    const rows = ['a', 'b', 'c', 'd'].map((id, index) => ({
      deal: { ...KOPI, id },
      venueName: id,
      distanceMetres: index === 3 ? NEARBY_METRES + 1 : index * 100,
    }))
    expect([...nearbyDealIds(rows, 10, () => 0)].sort()).toEqual(['a', 'b', 'c'])
    expect(nearbyDealIds(rows, 2, () => 0)).toHaveLength(2)
    // No position: every deal counts as nearby.
    const unlocated = rows.map((row) => ({ ...row, distanceMetres: null }))
    expect([...nearbyDealIds(unlocated, 10, () => 0)].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(rows).toHaveLength(4)
  })

  it('formats the lobby countdown and sorts join refusals by field', () => {
    expect(formatCountdown(27 * 60_000 + 41_000)).toBe('27:41')
    expect(formatCountdown(-5)).toBe('0:00')
    expect(joinProblemFor('Someone here is already called Noah. Add an initial?')).toBe('name')
    expect(joinProblemFor('Room KOPI is full (6 of 6)')).toBe('full')
    expect(joinProblemFor('No room with that code.')).toBe('code')
  })
})

describe('SquadLobby', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps Start disabled until a friend joins, then starts the room', async () => {
    const { default: SquadLobby } = await import('@web/modules/squad/SquadLobby.vue')
    const room = fakeRoom(lobbyState([HOST]))
    const { wrapper } = await mountAt(SquadLobby, '/squad/KOPI', { room })
    const start = () => wrapper.get('[data-testid="squad-start"]')
    expect(start().attributes('disabled')).toBeDefined()
    expect(start().text()).toBe('Waiting for at least 1 friend')
    expect(wrapper.get('[data-testid="squad-lobby-count"]').text()).toContain('1 of 4 in the lobby')

    room.state.value = lobbyState([HOST, GUEST])
    await flushPromises()
    expect(start().attributes('disabled')).toBeUndefined()
    expect(start().text()).toBe('Start stirring the pot!')
    await start().trigger('click')
    expect(room.start).toHaveBeenCalledTimes(1)
  })

  it('asks before removing someone, and guests only see Leave', async () => {
    const { default: SquadLobby } = await import('@web/modules/squad/SquadLobby.vue')
    const room = fakeRoom(lobbyState([HOST, GUEST]))
    const { wrapper } = await mountAt(SquadLobby, '/squad/KOPI', { room })
    await wrapper.get('[aria-label="Remove Synthetic Noah"]').trigger('click')
    expect(wrapper.text()).toContain('Remove Synthetic Noah?')
    await wrapper.get('[data-testid="squad-confirm"]').trigger('click')
    await flushPromises()
    expect(room.remove).toHaveBeenCalledWith(GUEST.id)

    const guestRoom = fakeRoom(lobbyState([HOST, GUEST], GUEST))
    const guest = await mountAt(SquadLobby, '/squad/KOPI', { room: guestRoom })
    expect(guest.wrapper.text()).toContain('Waiting for Synthetic Allison')
    expect(guest.wrapper.find('[data-testid="squad-start"]').exists()).toBe(false)
    expect(guest.wrapper.find('[aria-label^="Remove"]').exists()).toBe(false)
    expect(guest.wrapper.find('[data-testid="squad-leave-lobby"]').exists()).toBe(true)
  })

  it('asks a guest before leaving the lobby, and Stay keeps them in', async () => {
    const { default: SquadLobby } = await import('@web/modules/squad/SquadLobby.vue')
    const room = fakeRoom(lobbyState([HOST, GUEST], GUEST))
    const { wrapper } = await mountAt(SquadLobby, '/squad/KOPI', { room })
    await wrapper.get('[data-testid="squad-leave-lobby"]').trigger('click')
    expect(room.leave).not.toHaveBeenCalled()
    expect(wrapper.get('[role="dialog"]').text()).toContain('Leave Room')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(room.leave).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="squad-leave-lobby"]').trigger('click')
    await wrapper.get('[data-testid="squad-leave-confirm"]').trigger('click')
    await flushPromises()
    expect(room.leave).toHaveBeenCalledTimes(1)
  })
})

describe('SquadJoinPanel', () => {
  beforeEach(() => {
    fakes.room = fakeRoom()
    fakes.peek.mockReset()
  })

  it('upper-cases the code and refuses an empty name before asking the server', async () => {
    const { default: SquadJoinPanel } = await import('@web/modules/squad/SquadJoinPanel.vue')
    const { wrapper } = await mountAt(SquadJoinPanel, '/squad/join?code=kopi')
    const code = wrapper.get<HTMLInputElement>('[data-testid="squad-code"]')
    expect(code.element.value).toBe('KOPI')
    await code.setValue('te h c9')
    expect(code.element.value).toBe('TEHC')
    expect(wrapper.get('[data-testid="squad-join"]').text()).toBe('Join as Synthetic')

    await wrapper.get('[data-testid="squad-name"]').setValue('  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Type the name your friends know you by.')
    expect(wrapper.get('[data-testid="squad-name"]').attributes('aria-invalid')).toBe('true')
    expect(fakes.peek).not.toHaveBeenCalled()
  })

  it('puts a taken name on the name field', async () => {
    const room = fakeRoom()
    room.join = vi.fn(async () => {
      room.error.value = 'Someone here is already called Synthetic. Add an initial?'
      return null
    })
    fakes.room = room
    fakes.peek.mockResolvedValue({ code: 'KOPI', status: 'LOBBY', members: 1, capacity: 4 })
    const { default: SquadJoinPanel } = await import('@web/modules/squad/SquadJoinPanel.vue')
    const { wrapper } = await mountAt(SquadJoinPanel, '/squad/join?code=KOPI')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(room.join).toHaveBeenCalledWith(
      'KOPI',
      expect.objectContaining({ displayName: 'Synthetic' }),
    )
    expect(wrapper.get('[data-testid="squad-name"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[data-testid="squad-code"]').attributes('aria-invalid')).toBe('false')
  })
})

describe('SquadCreatePanel', () => {
  it('pre-picks the deal from the link and opens the lobby', async () => {
    const room = fakeRoom()
    fakes.room = room
    const { default: SquadCreatePanel } = await import('@web/modules/squad/SquadCreatePanel.vue')
    const { router, wrapper } = await mountAt(SquadCreatePanel, `/squad/new?deal=${NOODLES.id}`)
    expect(wrapper.get('[data-testid="squad-picked-count"]').text()).toBe('1 of 10 picked')
    expect(wrapper.text()).toContain('Your saved deals')
    await wrapper.get('[aria-label="More people"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(room.create).toHaveBeenCalledWith(
      expect.objectContaining({ dealIds: [NOODLES.id], capacity: 5, displayName: 'Synthetic' }),
    )
    expect(router.currentRoute.value.fullPath).toBe('/squad/KOPI')
  })

  it('in add mode shows only the deal picker and adds deals to the room', async () => {
    const room = fakeRoom({ ...lobbyState([HOST]), status: 'LIVE', deals: [] })
    fakes.room = room
    const { default: SquadCreatePanel } = await import('@web/modules/squad/SquadCreatePanel.vue')
    const { router, wrapper } = await mountAt(SquadCreatePanel, '/squad/new?room=KOPI')
    expect(wrapper.text()).toContain('Add deals to Room KOPI')
    expect(wrapper.find('[data-testid="squad-name"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="squad-capacity"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="squad-open"]').attributes('disabled')).toBeDefined()
    await wrapper.get(`[data-testid="squad-pick-${KOPI.id}"]`).setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(room.addDeals).toHaveBeenCalledWith([KOPI.id])
    expect(room.create).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/squad/KOPI')
  })
})
