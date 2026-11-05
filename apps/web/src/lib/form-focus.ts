const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const INVALID = '[aria-invalid="true"], .is-invalid'

export const focusFirstInvalid = (root: ParentNode | null | undefined): boolean => {
  const field = root?.querySelector<HTMLElement>(INVALID)
  if (!field) return false
  field.focus()
  return true
}

export const focusableWithin = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('inert') && element.getClientRects().length > 0,
  )

export const trapTabKey = (event: KeyboardEvent, root: HTMLElement | null): void => {
  if (event.key !== 'Tab' || !root) return
  const items = focusableWithin(root)
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    event.preventDefault()
    return
  }
  const active = document.activeElement
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
