import { nextTick, type Ref, watch } from 'vue'

// Desktop list/map toggle. The panel card grows to the left into the card grid, or shrinks back
// to the column. Its width changes once per toggle; the motion itself is a clip-path sweep on
// the card's left edge, the map controls riding that edge, and the content fading back in once
// the shape has led, so nothing lays out per frame. A second toggle mid-way reverses from
// wherever the edge is.
export const MORPH_GROW_MS = 440
export const MORPH_SHRINK_MS = 360
const CONTENT_IN_MS = 280
const CONTENT_DELAY_MS = 140
const CONTENT_DRIFT_PX = 16
// The drawer curve (iOS sheets, Vaul): a fast start that settles softly.
const MORPH_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const INSET_LEFT = /^inset\(\s*[\d.]+px\s+[\d.]+px\s+[\d.]+px\s+([\d.]+)px/

type Options = {
  readonly wide: Readonly<Ref<boolean>>
  /** The width the layout uses. It trails `wide` while the card shrinks. */
  readonly panelWide: Ref<boolean>
  /** False on the bottom sheet or with reduced motion: the width then just swaps. */
  readonly enabled: () => boolean
  readonly widthFor: (wide: boolean) => number
  readonly panel: () => HTMLElement | null
  /** Elements pinned to the card's left edge (the map controls, the collapse tab); they ride the sweep. */
  readonly rails: () => readonly (HTMLElement | null)[]
}

const canAnimate = (element: HTMLElement | null): element is HTMLElement =>
  element !== null && typeof element.animate === 'function'

// How far the card's left edge is clipped right now (mid-animation), or null when unclipped.
const currentInset = (card: HTMLElement): number | null => {
  const match = INSET_LEFT.exec(getComputedStyle(card).clipPath)
  return match ? Number(match[1]) : null
}

const settled = (animation: Animation) =>
  animation.finished.then(
    () => true,
    () => false,
  )

export const usePanelMorph = ({ wide, panelWide, enabled, widthFor, panel, rails }: Options) => {
  let running: readonly Animation[] = []
  let token = 0

  const stop = () => {
    for (const animation of running) animation.cancel()
    running = []
  }

  const sweep = (card: HTMLElement, from: number, to: number, duration: number) => {
    const radius = getComputedStyle(card).borderTopLeftRadius || '0px'
    const timing: KeyframeAnimationOptions = { duration, easing: MORPH_EASE, fill: 'forwards' }
    const shape = card.animate(
      [
        { clipPath: `inset(0px 0px 0px ${from}px round ${radius})` },
        { clipPath: `inset(0px 0px 0px ${to}px round ${radius})` },
      ],
      timing,
    )
    const ride = rails()
      .filter(canAnimate)
      .map((rail) =>
        rail.animate(
          [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
          timing,
        ),
      )
    return [shape, ...ride]
  }

  const fadeIn = (content: Element | null, drift: number, delay: number) =>
    content instanceof HTMLElement
      ? [
          content.animate(
            [
              { opacity: 0, transform: `translateX(${drift}px)` },
              { opacity: 1, transform: 'none' },
            ],
            { duration: CONTENT_IN_MS, delay, easing: MORPH_EASE, fill: 'backwards' },
          ),
        ]
      : []

  // The content has already switched (cards or rows); hide it until the shape has moved.
  const hide = (content: Element | null) =>
    content instanceof HTMLElement
      ? [content.animate([{ opacity: 0 }, { opacity: 0 }], { fill: 'forwards' })]
      : []

  const grow = async (card: HTMLElement, id: number) => {
    const travel = widthFor(true) - widthFor(false)
    const start = currentInset(card) ?? travel
    stop()
    panelWide.value = true
    await nextTick()
    if (id !== token) return
    const content = card.querySelector('.shell-panel__content')
    running = [
      ...sweep(card, start, 0, MORPH_GROW_MS),
      ...fadeIn(content, CONTENT_DRIFT_PX, CONTENT_DELAY_MS),
    ]
    const shape = running[0]
    if (shape && (await settled(shape)) && id === token) stop()
  }

  const shrink = async (card: HTMLElement, id: number) => {
    const travel = widthFor(true) - widthFor(false)
    const start = currentInset(card) ?? 0
    stop()
    const content = card.querySelector('.shell-panel__content')
    running = [...sweep(card, start, travel, MORPH_SHRINK_MS), ...hide(content)]
    const shape = running[0]
    if (!shape || !(await settled(shape)) || id !== token) return
    panelWide.value = false
    await nextTick()
    if (id !== token) return
    stop()
    running = fadeIn(content, -CONTENT_DRIFT_PX, 0)
  }

  watch(wide, (next) => {
    const id = ++token
    const card = panel()
    if (!enabled() || !canAnimate(card)) {
      stop()
      panelWide.value = next
      return
    }
    void (next ? grow(card, id) : shrink(card, id))
  })
}
