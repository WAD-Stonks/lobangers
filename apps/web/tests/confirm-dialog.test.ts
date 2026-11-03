import { flushPromises, mount } from '@vue/test-utils'
import ConfirmDialog from '@web/components/ConfirmDialog.vue'
import { useConfirm } from '@web/lib/use-confirm'
import { afterEach, describe, expect, it } from 'vitest'

// The app's own confirm dialog, which replaces window.confirm on the merchant dashboard.
const open = () => {
  const wrapper = mount(ConfirmDialog, { attachTo: document.body })
  const { ask } = useConfirm()
  return { wrapper, ask }
}
const dialog = () => document.querySelector<HTMLElement>('[data-testid="confirm-dialog"]')
const button = (selector: string) => document.querySelector<HTMLButtonElement>(selector)

afterEach(() => {
  useConfirm().cancel()
  document.body.innerHTML = ''
})

describe('ConfirmDialog', () => {
  it('asks with a title, a message and themed buttons, starting on Cancel', async () => {
    const { ask } = open()
    const answer = ask({
      title: 'Delete this deal?',
      body: '"Synthetic chicken rice" will be removed.',
      confirmLabel: 'Delete deal',
    })
    await flushPromises()
    expect(dialog()?.getAttribute('role')).toBe('alertdialog')
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Delete this deal?')
    expect(dialog()?.textContent).toContain('"Synthetic chicken rice" will be removed.')
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel')
    expect(button('[data-testid="confirm-dialog-confirm"]')?.className).toContain('--danger')

    button('[data-testid="confirm-dialog-confirm"]')?.click()
    expect(await answer).toBe(true)
    await flushPromises()
    expect(dialog()).toBeNull()
  })

  it('cancels with Cancel, Escape or a tap outside', async () => {
    const { ask } = open()
    const request = { title: 'End this deal?', body: 'Synthetic.', confirmLabel: 'End deal' }

    const viaButton = ask(request)
    await flushPromises()
    button('.confirm-dialog__button--cancel')?.click()
    expect(await viaButton).toBe(false)

    const viaEscape = ask(request)
    await flushPromises()
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(await viaEscape).toBe(false)

    const viaScrim = ask(request)
    await flushPromises()
    button('.confirm-overlay__scrim')?.click()
    expect(await viaScrim).toBe(false)
  })

  it('uses the primary style for actions that are not destructive', async () => {
    const { ask } = open()
    void ask({ title: 'Go live?', body: 'Synthetic.', confirmLabel: 'Go live', tone: 'primary' })
    await flushPromises()
    expect(button('[data-testid="confirm-dialog-confirm"]')?.className).toContain('--primary')
  })
})
