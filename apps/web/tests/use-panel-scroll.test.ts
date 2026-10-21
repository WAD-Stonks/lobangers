import { mount } from '@vue/test-utils'
import { usePanelScrollReset } from '@web/modules/map-shell/use-panel-scroll'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

// Content keys reset the scroll; per-item state (votes, saves) does not.
const setup = () => {
  const state = ref({ dealId: 'd1', tab: 'now', step: 1, filters: 'q=', votes: 0, saved: false })
  const Panel = defineComponent({
    setup() {
      const body = ref<HTMLElement | null>(null)
      usePanelScrollReset(body, [
        () => state.value.dealId,
        () => state.value.tab,
        () => state.value.step,
        () => state.value.filters,
      ])
      return () => h('div', { ref: body, 'data-testid': 'panel-body' }, [state.value.votes])
    },
  })
  const wrapper = mount(Panel)
  const body = wrapper.get('[data-testid="panel-body"]').element as HTMLElement
  return { state, body }
}

const scrolled = async (
  change: (s: ReturnType<typeof setup>['state']['value']) => void,
): Promise<number> => {
  const { state, body } = setup()
  body.scrollTop = 400
  change(state.value)
  await nextTick()
  return body.scrollTop
}

describe('panel scroll reset', () => {
  it('returns to the top when the route param changes', async () => {
    expect(await scrolled((s) => (s.dealId = 'd2'))).toBe(0)
  })

  it('returns to the top on a tab change', async () => {
    expect(await scrolled((s) => (s.tab = 'past'))).toBe(0)
  })

  it('returns to the top on a step change', async () => {
    expect(await scrolled((s) => (s.step = 2))).toBe(0)
  })

  it('returns to the top on a filter change', async () => {
    expect(await scrolled((s) => (s.filters = 'q=kopi'))).toBe(0)
  })

  it('stays put for a vote or a save', async () => {
    expect(await scrolled((s) => (s.votes = 1))).toBe(400)
    expect(await scrolled((s) => (s.saved = true))).toBe(400)
  })
})
