import type { SquadMember, SquadState } from '@broke-oclock/contracts/squad'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

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

const HOST = member('1', 'Synthetic Allison', { isHost: true })
const ASHLEY = member('2', 'Synthetic Ashley', { stance: 'YAY' })
const WATCHER = member('3', 'Synthetic Noah', { spectator: true })
const DEAL = {
  id: 'd'.repeat(24),
  title: 'Synthetic chicken rice',
  label: '$3.50',
  category: 'FOOD',
  priceMinor: 350,
  imageUrl: null,
  venueId: null,
  venueName: null,
  lat: 1.3,
  lng: 103.9,
  ended: false,
}

const liveState = (overrides: Partial<SquadState> = {}, me = HOST): SquadState => ({
  code: 'KOPI',
  status: 'LIVE',
  phase: 'VOTING',
  closeReason: null,
  capacity: 4,
  dealIndex: 0,
  round: 0,
  deals: [DEAL],
  matchDealId: null,
  topDealId: null,
  members: [HOST, ASHLEY, WATCHER],
  me: { memberId: me.id, isHost: me.isHost, spectator: false, left: false, kicked: false },
  tally: { yesPeople: 1, voters: 2, voted: 1, again: 0, next: 0 },
  createdAt: new Date().toISOString(),
  expiresAt: null,
  serverTime: new Date().toISOString(),
  ...overrides,
})

const stub = { render: () => h('div') }
const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'browse', component: stub }],
  })

describe('SquadDock after a match', () => {
  it('offers a Keep looking vote with its count, and directions', async () => {
    const { default: SquadDock } = await import('@web/modules/squad/SquadDock.vue')
    const state = liveState({
      phase: 'MATCHED',
      matchDealId: DEAL.id,
      tally: { yesPeople: 2, voters: 2, voted: 2, again: 0, next: 1 },
    })
    const wrapper = mount(SquadDock, {
      props: { state, deal: DEAL, busy: false, dealLink: () => '/' },
      global: { plugins: [router()] },
    })
    const keep = wrapper.get('[data-testid="squad-keep-looking"]')
    expect(keep.text()).toContain('Keep looking')
    expect(keep.text()).toContain('1/2')
    await keep.trigger('click')
    expect(wrapper.emitted('choose')).toEqual([['NEXT']])
    expect(wrapper.text()).toContain('Get directions')
  })
})

describe('SquadMembers', () => {
  it('seats watchers with an eye, and lets the host remove anyone but themselves', async () => {
    const { default: SquadMembers } = await import('@web/modules/squad/SquadMembers.vue')
    const wrapper = mount(SquadMembers, { props: { state: liveState() } })
    const watcher = wrapper.get(`[data-member-id="${WATCHER.id}"]`)
    expect(watcher.find('.squad-seat__badge--watch').exists()).toBe(true)
    expect(watcher.text()).toContain('is watching')
    expect(wrapper.find(`[aria-label="Remove ${HOST.name}"]`).exists()).toBe(false)
    await wrapper.get(`[aria-label="Remove ${WATCHER.name}"]`).trigger('click')
    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ id: WATCHER.id })
  })

  it('gives guests no remove buttons', async () => {
    const { default: SquadMembers } = await import('@web/modules/squad/SquadMembers.vue')
    const wrapper = mount(SquadMembers, { props: { state: liveState({}, ASHLEY) } })
    expect(wrapper.find('[aria-label^="Remove"]').exists()).toBe(false)
  })
})

describe('SquadOptionsMenu', () => {
  it('opens to share the code, and only the host can close the room', async () => {
    const { default: SquadOptionsMenu } = await import('@web/modules/squad/SquadOptionsMenu.vue')
    const wrapper = mount(SquadOptionsMenu, { props: { isHost: true }, attachTo: document.body })
    const toggle = wrapper.get('[data-testid="squad-options"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await wrapper.get('[data-testid="squad-close-room"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    await wrapper.get('[data-testid="squad-share"]').trigger('click')
    expect(wrapper.emitted('share')).toHaveLength(1)
    wrapper.unmount()

    const guest = mount(SquadOptionsMenu, { props: { isHost: false } })
    await guest.get('[data-testid="squad-options"]').trigger('click')
    await flushPromises()
    expect(guest.find('[data-testid="squad-close-room"]').exists()).toBe(false)
  })

  it('closes on Escape and returns focus to the toggle', async () => {
    const { default: SquadOptionsMenu } = await import('@web/modules/squad/SquadOptionsMenu.vue')
    const wrapper = mount(SquadOptionsMenu, { props: { isHost: true }, attachTo: document.body })
    const toggle = wrapper.get('[data-testid="squad-options"]')
    await toggle.trigger('click')
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle.element)
    wrapper.unmount()
  })
})
