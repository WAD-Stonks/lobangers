import { mount } from '@vue/test-utils'
import FlashEdgeBanner from '@web/modules/flash-drop/FlashEdgeBanner.vue'
import { describe, expect, it } from 'vitest'

const NOW = Date.parse('2026-11-01T10:00:00.000Z')
const banner = {
  drop: {
    id: 'd'.repeat(24),
    dealId: 'e'.repeat(24),
    dealTitle: 'Synthetic fishball noodles',
    venueName: 'Synthetic Jurong Hawker',
    flashPriceCents: 150,
    endsAt: new Date(NOW + 25 * 60_000).toISOString(),
    codesExpireAt: new Date(NOW + 3 * 3_600_000).toISOString(),
  },
  point: { x: 488, y: 340, angle: 180 },
  distanceMetres: 20_500,
} as never

describe('FlashEdgeBanner', () => {
  it('keeps its centre inside the map area a side panel leaves uncovered', () => {
    const wrapper = mount(FlashEdgeBanner, {
      props: { banner, now: NOW, lifeMs: 5000, inset: { left: 472, right: 0 } },
    })
    const style = wrapper.get('[data-testid="flash-edge-banner"]').attributes('style') ?? ''
    expect(style).toContain('--flash-x: 488px')
    expect(style).toContain('--flash-inset-left: 472px')
    expect(style).toContain('--flash-inset-right: 0px')
  })

  it('treats a map with nothing over it as uncovered', () => {
    const wrapper = mount(FlashEdgeBanner, { props: { banner, now: NOW, lifeMs: 5000 } })
    const style = wrapper.get('[data-testid="flash-edge-banner"]').attributes('style') ?? ''
    expect(style).toContain('--flash-inset-left: 0px')
    expect(style).toContain('--flash-inset-right: 0px')
  })
})
