import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { watchFlashDeals } from '@web/modules/flash-drop/use-flash-deal-sync'
import type { FlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'

// Labelled synthetic fixtures: none of these are real stalls or flash deals.
const NOW = Date.parse('2026-11-03T10:00:00.000Z')
const LOADED_DEAL = 'a'.repeat(24)
const FLASH_DEAL = 'b'.repeat(24)
const live = (overrides: Partial<PublicFlashDrop> = {}): PublicFlashDrop => ({
  id: 'd'.repeat(24),
  dealId: FLASH_DEAL,
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
  codesExpireAt: new Date(NOW + 3 * 3_600_000).toISOString(),
  radiusMetres: 500,
  codesLeft: 10,
  codeLimit: 10,
  demo: false,
  ...overrides,
})

const setup = (status: 'loading' | 'ready' = 'ready') => {
  const drops = shallowRef<readonly PublicFlashDrop[]>([])
  const now = shallowRef(NOW)
  const flash = { drops, now } as unknown as FlashDrops
  const shell = {
    deals: shallowRef<readonly { id: string }[]>([{ id: LOADED_DEAL }]),
    status: ref(status),
    reload: vi.fn(),
  }
  watchFlashDeals(flash, shell)
  return { drops, now, shell }
}

describe('flash deal sync', () => {
  it('reloads the deals once when a live flash deal is not among them', async () => {
    const { drops, shell } = setup()
    drops.value = [live()]
    await nextTick()
    expect(shell.reload).toHaveBeenCalledOnce()

    // Still missing after the reload (and every later refresh): no reload loop.
    drops.value = [live({ codesLeft: 9 })]
    await nextTick()
    expect(shell.reload).toHaveBeenCalledOnce()
  })

  it('leaves the deals alone when the flash deal is already loaded', async () => {
    const { drops, shell } = setup()
    drops.value = [live({ dealId: LOADED_DEAL })]
    await nextTick()
    expect(shell.reload).not.toHaveBeenCalled()
  })

  it('waits for the deals to finish loading before checking', async () => {
    const { drops, shell } = setup('loading')
    drops.value = [live()]
    await nextTick()
    expect(shell.reload).not.toHaveBeenCalled()

    shell.status.value = 'ready'
    await nextTick()
    expect(shell.reload).toHaveBeenCalledOnce()
  })

  it('waits for a scheduled flash deal to start', async () => {
    const { drops, now, shell } = setup()
    drops.value = [live({ startsAt: new Date(NOW + 60_000).toISOString() })]
    await nextTick()
    expect(shell.reload).not.toHaveBeenCalled()

    now.value = NOW + 60_000
    await nextTick()
    expect(shell.reload).toHaveBeenCalledOnce()
  })
})
