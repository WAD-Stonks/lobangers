import { usePanelMorph } from '@web/modules/map-shell/use-panel-morph'
import { panelWidthFor } from '@web/modules/map-shell/use-shell-layout'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

// A stand-in for Element.animate whose `finished` the test resolves by hand.
const fakeAnimations = () => {
  const finishers: Array<() => void> = []
  const animate = vi.fn(() => {
    let finish = () => {}
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    finishers.push(finish)
    return { finished, cancel: vi.fn() } as unknown as Animation
  })
  return {
    animate,
    finishAll: () => {
      for (const finish of finishers) finish()
    },
  }
}

const setup = (enabled: boolean) => {
  const wide = ref(false)
  const panelWide = ref(false)
  const card = document.createElement('aside')
  const content = document.createElement('div')
  content.className = 'shell-panel__content'
  card.append(content)
  const { animate, finishAll } = fakeAnimations()
  card.animate = animate
  content.animate = animate
  effectScope().run(() =>
    usePanelMorph({
      wide,
      panelWide,
      enabled: () => enabled,
      widthFor: (isWide) => (isWide ? 760 : 380),
      panel: () => card,
      rails: () => [],
    }),
  )
  return { wide, panelWide, animate, finishAll }
}

const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('usePanelMorph', () => {
  it('swaps the width at once when motion is off', async () => {
    const { wide, panelWide, animate } = setup(false)
    wide.value = true
    await nextTick()
    expect(panelWide.value).toBe(true)
    expect(animate).not.toHaveBeenCalled()
  })

  it('widens the layout first, then sweeps the edge open', async () => {
    const { wide, panelWide, animate } = setup(true)
    wide.value = true
    await flush()
    expect(panelWide.value).toBe(true)
    expect(animate).toHaveBeenCalled()
  })

  it('keeps the wide layout until the shrink sweep has finished', async () => {
    const { wide, panelWide, finishAll } = setup(true)
    wide.value = true
    await flush()
    finishAll()
    await flush()

    wide.value = false
    await flush()
    expect(panelWide.value).toBe(true)

    finishAll()
    await flush()
    expect(panelWide.value).toBe(false)
  })
})

describe('panelWidthFor', () => {
  it('uses the column width unless wide, and caps the wide card', () => {
    expect(panelWidthFor(1440, false)).toBe(380)
    expect(panelWidthFor(1100, false)).toBe(340)
    expect(panelWidthFor(1440, true)).toBe(760)
    expect(panelWidthFor(1100, true)).toBe(638)
  })
})
