import { focusFirstInvalid, trapTabKey } from '@web/lib/form-focus'
import { afterEach, describe, expect, it } from 'vitest'

// jsdom has no layout, so give every element a client rect for the visibility check.
const visible = (element: HTMLElement) => {
  element.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList
  return element
}

const mount = (html: string) => {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  for (const element of root.querySelectorAll<HTMLElement>('*')) visible(element)
  return root
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusFirstInvalid', () => {
  it('focuses the first field marked invalid', () => {
    const root = mount(
      '<input id="a"><input id="b" aria-invalid="true"><input id="c" class="is-invalid">',
    )
    expect(focusFirstInvalid(root)).toBe(true)
    expect(document.activeElement?.id).toBe('b')
  })

  it('reports when nothing is invalid', () => {
    expect(focusFirstInvalid(mount('<input>'))).toBe(false)
    expect(focusFirstInvalid(null)).toBe(false)
  })
})

describe('trapTabKey', () => {
  const tab = (shiftKey = false) =>
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })

  it('wraps Tab from the last control to the first', () => {
    const root = mount('<button id="first">A</button><button id="last">B</button>')
    root.querySelector<HTMLElement>('#last')?.focus()
    const event = tab()
    trapTabKey(event, root)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('first')
  })

  it('wraps Shift+Tab from the first control to the last', () => {
    const root = mount('<button id="first">A</button><button id="last">B</button>')
    root.querySelector<HTMLElement>('#first')?.focus()
    trapTabKey(tab(true), root)
    expect(document.activeElement?.id).toBe('last')
  })

  it('leaves Tab alone between controls', () => {
    const root = mount('<button id="first">A</button><button id="mid">M</button><button>B</button>')
    root.querySelector<HTMLElement>('#first')?.focus()
    const event = tab()
    trapTabKey(event, root)
    expect(event.defaultPrevented).toBe(false)
  })
})
