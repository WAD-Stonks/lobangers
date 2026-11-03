import { flushPromises, mount } from '@vue/test-utils'
import AppSelect from '@web/components/AppSelect.vue'
import type { SelectOption } from '@web/components/select-options'
import { chooseOption } from '@web-tests/support/select'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'

const OPTIONS: readonly SelectOption[] = [
  { value: '', label: 'All roles' },
  { value: 'USER', label: 'User' },
  { value: 'MERCHANT', label: 'Merchant', disabled: true },
  { value: 'MODERATOR', label: 'Moderator' },
  { value: 'ADMIN', label: 'Admin' },
]

const Host = defineComponent({
  components: { AppSelect },
  props: { disabled: { type: Boolean, default: false } },
  setup() {
    const role = ref('USER')
    const changes = ref<string[]>([])
    return { role, changes, options: OPTIONS }
  },
  template: `
    <div>
      <label for="role">Role</label>
      <AppSelect id="role" v-model="role" class="form-select" data-testid="role" :options="options"
        :disabled="disabled" @change="changes.push($event)" />
    </div>`,
})

const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]')
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]
const key = (wrapper: ReturnType<typeof mount>, name: string) =>
  wrapper.get('#role').trigger('keydown', { key: name })

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AppSelect', () => {
  it('renders a themed combobox button carrying the caller attributes', () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const trigger = wrapper.get('#role')
    expect(trigger.element.tagName).toBe('BUTTON')
    expect(trigger.attributes('type')).toBe('button')
    expect(trigger.attributes('role')).toBe('combobox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.classes()).toContain('form-select')
    expect(trigger.classes()).toContain('app-select')
    expect(trigger.attributes('data-testid')).toBe('role')
    expect(trigger.attributes('data-value')).toBe('USER')
    expect(trigger.text()).toBe('User')
    expect(document.querySelector('select')).toBeNull()
    expect(listbox()).toBeNull()
  })

  it('opens on click, marks the selected option and picks one', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.get('#role').trigger('click')
    expect(wrapper.get('#role').attributes('aria-expanded')).toBe('true')
    expect(options().map((option) => option.textContent?.trim())).toEqual([
      'All roles',
      'User',
      'Merchant',
      'Moderator',
      'Admin',
    ])
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true')
    expect(options()[2]?.getAttribute('aria-disabled')).toBe('true')

    await chooseOption(wrapper, '#role', 'ADMIN')
    expect(wrapper.vm.role).toBe('ADMIN')
    expect(wrapper.vm.changes).toEqual(['ADMIN'])
    expect(listbox()).toBeNull()
    expect(wrapper.get('#role').text()).toBe('Admin')
  })

  it('ignores disabled options and re-picking the current value', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.get('#role').trigger('click')
    options()[2]?.click()
    await flushPromises()
    expect(wrapper.vm.role).toBe('USER')
    expect(listbox()).not.toBeNull()

    await chooseOption(wrapper, '#role', 'USER')
    expect(wrapper.vm.changes).toEqual([])
  })

  it('supports the keyboard: arrows skip disabled options, Enter picks, Escape closes', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await key(wrapper, 'ArrowDown')
    expect(listbox()).not.toBeNull()
    const active = () => wrapper.get('#role').attributes('aria-activedescendant')
    expect(active()).toBe(options()[1]?.id)

    await key(wrapper, 'ArrowDown')
    expect(active()).toBe(options()[3]?.id)
    await key(wrapper, 'End')
    expect(active()).toBe(options()[4]?.id)
    await key(wrapper, 'Home')
    expect(active()).toBe(options()[0]?.id)
    await key(wrapper, 'Enter')
    expect(wrapper.vm.role).toBe('')
    expect(listbox()).toBeNull()

    await key(wrapper, ' ')
    expect(listbox()).not.toBeNull()
    await key(wrapper, 'Escape')
    expect(listbox()).toBeNull()
    expect(wrapper.vm.role).toBe('')
  })

  it('jumps to an option by typing its first letters', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await key(wrapper, 'ArrowDown')
    await key(wrapper, 'm')
    await key(wrapper, 'o')
    await key(wrapper, 'Enter')
    expect(wrapper.vm.role).toBe('MODERATOR')
  })

  it('closes when someone clicks outside', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.get('#role').trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(listbox()).toBeNull()
  })

  it('stays shut while disabled', async () => {
    const wrapper = mount(Host, { attachTo: document.body, props: { disabled: true } })
    expect(wrapper.get('#role').attributes('disabled')).toBeDefined()
    await key(wrapper, 'ArrowDown')
    expect(listbox()).toBeNull()
  })

  it('renders its list inside an enclosing <dialog> so modal dialogs can use it', async () => {
    const InDialog = defineComponent({
      components: { AppSelect },
      setup: () => ({ role: ref('USER'), options: OPTIONS }),
      template: '<dialog open><AppSelect id="role" v-model="role" :options="options" /></dialog>',
    })
    const wrapper = mount(InDialog, { attachTo: document.body })
    await wrapper.get('#role').trigger('click')
    expect(listbox()?.parentElement?.tagName).toBe('DIALOG')
    await chooseOption(wrapper, '#role', 'ADMIN')
    expect(wrapper.vm.role).toBe('ADMIN')
  })

  it('shows the placeholder when the value matches no option', () => {
    const wrapper = mount(AppSelect, {
      attachTo: document.body,
      props: { modelValue: 'missing', options: OPTIONS, placeholder: 'Pick one' },
    })
    expect(wrapper.text()).toBe('Pick one')
  })
})
