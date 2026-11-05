import type { FlashCode } from '@broke-oclock/contracts/flash-drops'
import type { FlashChannelHandlers } from '@web/modules/flash-drop/flash-channel'
import { useByText, whenText } from '@web/modules/flash-drop/flash-format'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

const rest = vi.hoisted(() => ({ active: vi.fn(), myCodes: vi.fn(), claim: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  api: { flashDrops: { active: rest.active, myCodes: rest.myCodes, claim: rest.claim } },
}))

const channel = vi.hoisted(() => ({
  handlers: null as FlashChannelHandlers | null,
  close: vi.fn(),
}))
vi.mock('@web/modules/flash-drop/flash-channel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/flash-drop/flash-channel')>()),
  openMapFlashChannel: (handlers: FlashChannelHandlers) => {
    channel.handlers = handlers
    return channel.close
  },
}))

const { coalesce } = await import('@web/modules/flash-drop/flash-channel')
const { createFlashDrops } = await import('@web/modules/flash-drop/use-flash-drops')

const NOW = Date.parse('2026-11-01T10:00:00.000Z')
const DROP_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

const code = (overrides: Partial<FlashCode> = {}): FlashCode => ({
  code: 'LB-ABCDEF',
  dropId: DROP_ID,
  dealId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  dealTitle: 'Synthetic chicken rice',
  venueName: 'Synthetic Stall',
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  flashPriceCents: 150,
  claimedAt: inMinutes(-40),
  endsAt: inMinutes(-10),
  expiresAt: inMinutes(300),
  active: true,
  demo: false,
  ...overrides,
})

const signedIn = ref({ data: { user: { id: 'user-1' } } })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('coalesce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs once straight away, then at most once more per window', () => {
    const work = vi.fn()
    const call = coalesce(work, 1000)
    call()
    call()
    call()
    expect(work).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(work).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('drops a waiting call when cancelled', () => {
    const work = vi.fn()
    const call = coalesce(work, 1000)
    call()
    call()
    call.cancel()
    vi.advanceTimersByTime(5000)
    expect(work).toHaveBeenCalledTimes(1)
  })
})

describe('useByText', () => {
  it('gives the time for a code with more than an hour left', () => {
    const at = inMinutes(300)
    expect(useByText(at, NOW)).toBe(`Use by ${whenText(at, new Date(NOW)).toLowerCase()}`)
  })

  it('counts down a code in its last hour', () => {
    expect(useByText(inMinutes(42), NOW)).toBe('Use within 42:00')
  })
})

describe('live flash drops on the map', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(NOW)
    channel.handlers = null
    channel.close.mockReset()
    rest.active.mockReset().mockResolvedValue({ serverTime: inMinutes(0), items: [] })
    rest.myCodes.mockReset().mockResolvedValue({ items: [code()] })
  })
  afterEach(() => vi.useRealTimers())

  const started = async () => {
    const scope = effectScope()
    const store = scope.run(() => createFlashDrops(signedIn))
    if (!store) throw new Error('store missing')
    store.start()
    await flush()
    const stop = () => {
      store.stop()
      scope.stop()
    }
    return { store, stop }
  }

  it('re-reads the drops when a change is pushed', async () => {
    const { stop } = await started()
    expect(rest.active).toHaveBeenCalledTimes(1)
    channel.handlers?.onChange({ dropId: DROP_ID, kind: 'CLAIMED' })
    await flush()
    expect(rest.active).toHaveBeenCalledTimes(2)
    expect(rest.myCodes).toHaveBeenCalledTimes(1)
    stop()
    expect(channel.close).toHaveBeenCalled()
  })

  it('re-reads my codes when a drop I hold a code for is removed', async () => {
    const { stop } = await started()
    channel.handlers?.onChange({ dropId: DROP_ID, kind: 'STOPPED' })
    await flush()
    expect(rest.myCodes).toHaveBeenCalledTimes(2)
    stop()
  })

  it('catches up on a reconnect, not on the first connect', async () => {
    const { stop } = await started()
    channel.handlers?.onLiveChange?.(true)
    await flush()
    expect(rest.active).toHaveBeenCalledTimes(1)
    channel.handlers?.onLiveChange?.(false)
    channel.handlers?.onLiveChange?.(true)
    await flush()
    expect(rest.active).toHaveBeenCalledTimes(2)
    stop()
  })

  it('keeps a code ready to use after claiming closes, until it expires', async () => {
    const { store, stop } = await started()
    expect(store.activeCodes.value).toHaveLength(1)
    rest.myCodes.mockResolvedValue({ items: [code({ expiresAt: inMinutes(-1) })] })
    await store.loadCodes()
    expect(store.activeCodes.value).toHaveLength(0)
    stop()
  })
})
