import {
  CONTENT_DRAG_SLOP,
  contentDragIntent,
  scrollState,
} from '@web/modules/map-shell/sheet-content-drag'
import { describe, expect, it } from 'vitest'

describe('dragging the sheet from its content', () => {
  const settled = { atTop: true, scrollable: true }

  it('waits until the finger has moved past the slop', () => {
    expect(contentDragIntent({ dx: 0, dy: CONTENT_DRAG_SLOP - 1, ...settled })).toBe('pending')
  })

  it('pulls the sheet down only when the content is scrolled to the top', () => {
    expect(contentDragIntent({ dx: 0, dy: 20, ...settled })).toBe('sheet')
    expect(contentDragIntent({ dx: 0, dy: 20, atTop: false, scrollable: true })).toBe('scroll')
  })

  it('leaves an upward drag to scrollable content and moves the sheet otherwise', () => {
    expect(contentDragIntent({ dx: 0, dy: -20, ...settled })).toBe('scroll')
    expect(contentDragIntent({ dx: 0, dy: -20, atTop: true, scrollable: false })).toBe('sheet')
  })

  it('leaves sideways swipes (tab strips, carousels) alone', () => {
    expect(contentDragIntent({ dx: 30, dy: 20, ...settled })).toBe('scroll')
  })
})

describe('scrollState', () => {
  const scroller = (scrollTop: number, parent: HTMLElement) => {
    const element = document.createElement('div')
    element.style.overflowY = 'auto'
    Object.defineProperty(element, 'scrollHeight', { value: 900 })
    Object.defineProperty(element, 'clientHeight', { value: 300 })
    element.scrollTop = scrollTop
    parent.append(element)
    return element
  }

  it('reports whether every scroller between the target and the root is at the top', () => {
    const root = document.createElement('div')
    const outer = scroller(0, root)
    const inner = scroller(40, outer)
    const leaf = document.createElement('span')
    inner.append(leaf)
    expect(scrollState(leaf, root)).toEqual({ atTop: false, scrollable: true })
    inner.scrollTop = 0
    expect(scrollState(leaf, root)).toEqual({ atTop: true, scrollable: true })
  })

  it('ignores overflow containers whose content fits', () => {
    const root = document.createElement('div')
    const box = document.createElement('div')
    box.style.overflowY = 'auto'
    root.append(box)
    expect(scrollState(box, root)).toEqual({ atTop: true, scrollable: false })
  })
})
