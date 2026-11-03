import type { SquadState } from '@broke-oclock/contracts/squad'
import { flushPromises, mount } from '@vue/test-utils'
import { SHEET_CONTROL_KEY } from '@web/modules/squad/sheet-control'
import { describe, expect, it, vi } from 'vitest'
import { computed, h, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// The room panel around the lobby and live vote. The room, its member and the sheet are fakes.
const fakes = vi.hoisted(() => ({ room: null as unknown }))

vi.mock('@web/lib/auth-client', () => ({
  authClient: { useSession: () => ref({ data: { user: { id: 'f'.repeat(24) } } }) },
}))
vi.mock('@web/modules/squad/use-squad-room', () => ({ useSquadRoom: () => fakes.room }))

const roomState = (status: SquadState['status']) =>
  ({
    code: 'KOPI',
    status,
    me: { memberId: 'a'.repeat(24), isHost: true },
    members: [],
  }) as unknown as SquadState

describe('SquadRoomPanel', () => {
  it('opens the sheet to full screen the moment the room starts stirring', async () => {
    const { default: SquadRoomPanel } = await import('@web/modules/squad/SquadRoomPanel.vue')
    const state = shallowRef<SquadState | null>(roomState('LOBBY'))
    fakes.room = { state, error: shallowRef(''), connection: shallowRef('ok'), open: vi.fn() }
    const minimised = ref(true)
    const sheet = {
      mode: computed(() => 'sheet' as const),
      minimised,
      minimise: vi.fn(),
      expand: vi.fn(() => {
        minimised.value = false
      }),
    }
    const stub = { render: () => h('div') }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/squad/:code', name: 'squad-room', component: stub }],
    })
    await router.push('/squad/KOPI')
    mount(SquadRoomPanel, {
      global: {
        plugins: [router],
        provide: { [SHEET_CONTROL_KEY as symbol]: sheet },
        stubs: ['SquadLobby', 'SquadLive', 'SquadMiniBar', 'SquadStirring', 'SquadEnded'],
      },
    })
    await flushPromises()
    expect(sheet.expand).not.toHaveBeenCalled()

    state.value = roomState('LIVE')
    await flushPromises()
    expect(sheet.expand).toHaveBeenCalledTimes(1)
  })
})
