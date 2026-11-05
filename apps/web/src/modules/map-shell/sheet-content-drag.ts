export const CONTENT_DRAG_SLOP = 6

export type ContentDragIntent = 'pending' | 'sheet' | 'scroll'

type Gesture = {
  readonly dx: number
  readonly dy: number
  readonly atTop: boolean
  readonly scrollable: boolean
}

export const contentDragIntent = ({ dx, dy, atTop, scrollable }: Gesture): ContentDragIntent => {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < CONTENT_DRAG_SLOP) return 'pending'
  if (Math.abs(dx) > Math.abs(dy)) return 'scroll'
  if (dy > 0) return atTop ? 'sheet' : 'scroll'
  return scrollable ? 'scroll' : 'sheet'
}

const SCROLLING_OVERFLOW = new Set(['auto', 'scroll', 'overlay'])

const scrollsVertically = (element: HTMLElement) =>
  SCROLLING_OVERFLOW.has(getComputedStyle(element).overflowY) &&
  element.scrollHeight > element.clientHeight

export const scrollState = (target: Element, root: Element) => {
  const scrollers: HTMLElement[] = []
  for (let node: Element | null = target; node; node = node === root ? null : node.parentElement) {
    if (node instanceof HTMLElement && scrollsVertically(node)) scrollers.push(node)
  }
  return {
    atTop: scrollers.every((scroller) => scroller.scrollTop <= 0),
    scrollable: scrollers.length > 0,
  }
}

export const CONTENT_DRAG_IGNORE =
  'input[type="range"], textarea, [contenteditable="true"], [data-sheet-drag="off"]'
