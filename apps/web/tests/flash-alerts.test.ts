import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { flashAlertText, watchFlashAlerts } from '@web/modules/flash-drop/use-flash-alerts'
import type { FlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import type { ToastQueue } from '@web/modules/map-shell/use-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'

// Labelled synthetic fixtures: none of these are real stalls or flash deals.
const NOW = Date.parse('2026-11-03T10:00:00.000Z')
const live = (id: string, overrides: Partial<PublicFlashDrop> = {}): PublicFlashDrop => ({
  id: id.padEnd(24, '0'),
  dealId: 'b'.repeat(24),
  dealTitle: 'Synthetic chicken rice',
  category: 'FOOD',
  venueId: 'c'.repeat(24),
  venueName: 'Synthetic Stall',
  lat: 1.3,
  lng: 103.8,
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  flashPriceCents: 150,
  usualPriceCents: 400,
  startsAt: new Date(NOW - 60_000).toISOString(),
  endsAt: new Date(NOW + 30 * 60_000).toISOString(),
  radiusMetres: 500,
  codesLeft: 10,
  codeLimit: 10,
  demo: false,
  ...overrides,
})

const setup = (initial: PublicFlashDrop[] = []) => {
  const drops = shallowRef<readonly PublicFlashDrop[]>(initial)
  const flash = { drops, now: shallowRef(NOW) } as unknown as FlashDrops
  const toast = { show: vi.fn() } as unknown as ToastQueue & { show: ReturnType<typeof vi.fn> }
  const open = vi.fn()
  watchFlashAlerts(flash, toast, open)
  return { drops, toast, open }
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.clearAllMocks())

describe('flash deal alerts', () => {
  it('announces a flash deal that has gone live, once, with a button to open it', async () => {
    const { drops, toast, open } = setup()
    expect(toast.show).not.toHaveBeenCalled()

    const first = live('a')
    drops.value = [first]
    await nextTick()
    expect(toast.show).toHaveBeenCalledOnce()
    const [text, options] = toast.show.mock.calls[0] ?? []
    expect(text).toBe('⚡ Flash deal live now: $1.50 Synthetic chicken rice at Synthetic Stall')
    options.action.run()
    expect(open).toHaveBeenCalledWith(first)

    // The next refresh brings the same flash deal again: no second toast.
    drops.value = [{ ...first, codesLeft: 9 }]
    await nextTick()
    expect(toast.show).toHaveBeenCalledOnce()
  })

  it('does not announce demo flash deals, ones not started yet, or ones with no codes left', async () => {
    const { drops, toast } = setup()
    drops.value = [
      live('a', { demo: true }),
      live('b', { startsAt: new Date(NOW + 60_000).toISOString() }),
      live('c', { codesLeft: 0 }),
    ]
    await nextTick()
    expect(toast.show).not.toHaveBeenCalled()
  })

  it('announces the newest of several at once and counts the rest', async () => {
    const { toast } = setup([
      live('a', { startsAt: new Date(NOW - 5 * 60_000).toISOString() }),
      live('b', { dealTitle: 'Synthetic kopi', startsAt: new Date(NOW - 60_000).toISOString() }),
    ])
    expect(toast.show).toHaveBeenCalledOnce()
    expect(toast.show.mock.calls[0]?.[0]).toBe(
      `${flashAlertText(live('b', { dealTitle: 'Synthetic kopi' }))} (+1 more)`,
    )
  })

  it('remembers announced flash deals across a reload', () => {
    setup([live('a')])
    const reloaded = setup([live('a')])
    expect(reloaded.toast.show).not.toHaveBeenCalled()
  })
})
