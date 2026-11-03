import { mount } from '@vue/test-utils'
import AdminWorkspace from '@web/components/admin/AdminWorkspace.vue'
import AdminWorkspaceTabs from '@web/components/admin/AdminWorkspaceTabs.vue'
import { expect, it } from 'vitest'

it('supports keyboard tab navigation and prevents changing tasks while disabled', async () => {
  const tabs = [
    { id: 'queue', label: 'Queue' },
    { id: 'history', label: 'History' },
  ]
  const wrapper = mount(AdminWorkspaceTabs, {
    attachTo: document.body,
    props: { modelValue: 'queue', tabs, idPrefix: 'review', label: 'Review workspace' },
  })
  await wrapper.get('#review-tab-queue').trigger('keydown', { key: 'End' })
  expect(wrapper.emitted('update:modelValue')).toEqual([['history']])
  expect(document.activeElement).toBe(wrapper.get('#review-tab-history').element)
  await wrapper.setProps({ disabled: true })
  await wrapper.get('#review-tab-history').trigger('keydown', { key: 'Home' })
  await wrapper.get('#review-tab-queue').trigger('click')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  wrapper.unmount()
})

it('keeps both workspace slots mounted and blocks Back during a pending decision', async () => {
  const wrapper = mount(AdminWorkspace, {
    props: { selected: true, disabled: true, label: 'Records' },
    slots: { list: '<p>Queue state</p>', detail: '<p>Decision state</p>' },
  })
  expect(wrapper.text()).toContain('Queue state')
  expect(wrapper.text()).toContain('Decision state')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('close')).toBeUndefined()
  await wrapper.setProps({ disabled: false })
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('close')).toHaveLength(1)
  wrapper.unmount()
})
