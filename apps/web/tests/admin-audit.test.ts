import { flushPromises, mount } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import { expect, it, vi } from 'vitest'

// Synthetic list boundary only: real component rendering and request races.
const id = '0123456789abcdef01234567'
const row = {
  id,
  actorId: id,
  actorName: 'Synthetic operator',
  action: 'DEAL_UPDATED',
  targetUserId: null,
  venueId: null,
  subjectType: 'DEAL' as const,
  subjectId: id,
  detailsJson: { changedFields: ['title' as const] },
  note: '<script>synthetic untrusted note</script>',
  roleBefore: null,
  roleAfter: null,
  createdAt: '2026-01-01T00:00:00Z',
}
const panel = async () => {
  const module = await import('@web/modules/platform-admin/AuditPanel.vue').catch(() => null)
  expect(module, 'Reusable audit panel must exist').not.toBeNull()
  if (!module) throw new Error('Missing reusable audit panel')
  return module.default
}
it('renders loading, resource rows, timezone labels, safe text and bounded cursor pagination', async () => {
  const component = await panel()
  let release!: (value: { items: (typeof row)[]; nextCursor: string | null }) => void
  const list = vi.fn().mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const wrapper = mount(component, { props: { list } })
  expect(wrapper.text()).toContain('Loading audit history')
  release({ items: [row], nextCursor: id })
  await flushPromises()
  expect(wrapper.text()).toContain('Synthetic operator')
  expect(wrapper.text()).toContain('Asia/Singapore')
  expect(wrapper.text()).toContain('UTC')
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.text()).toContain('<script>synthetic untrusted note</script>')
  list.mockResolvedValueOnce({ items: [row], nextCursor: null })
  await wrapper.get('[data-testid="audit-more"]').trigger('click')
  await flushPromises()
  expect(list).toHaveBeenLastCalledWith({ limit: 25, cursor: id })
  expect(wrapper.findAll('[data-testid="audit-entry"]')).toHaveLength(1)
  wrapper.unmount()
})
it('validates combined filters, resets cursors and keeps safe error and empty states distinct', async () => {
  const component = await panel()
  const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
  const wrapper = mount(component, { props: { list } })
  await flushPromises()
  expect(wrapper.text()).toContain('No audit entries match')
  await wrapper.get('[name="actorId"]').setValue(id)
  await wrapper.get('[name="action"]').setValue('DEAL_UPDATED')
  await wrapper.get('[name="from"]').setValue('2026-01-01T00:00:00Z')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(list).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('both UTC dates')
  await wrapper.get('[name="until"]').setValue('2026-01-02T00:00:00Z')
  list.mockRejectedValueOnce(new Error('Synthetic private server error'))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(list).toHaveBeenLastCalledWith({
    limit: 25,
    actorId: id,
    action: 'DEAL_UPDATED',
    from: '2026-01-01T00:00:00Z',
    until: '2026-01-02T00:00:00Z',
  })
  expect(wrapper.text()).toContain('Unable to load audit history')
  expect(wrapper.text()).not.toContain('Synthetic private server error')
  await wrapper.get('[data-testid="audit-retry"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('No audit entries match')
  wrapper.unmount()
})
it('clears protected rows and filters on denial or access loss and ignores late responses', async () => {
  const component = await panel()
  const list = vi.fn().mockResolvedValue({ items: [row], nextCursor: id })
  const wrapper = mount(component, { props: { list } })
  await flushPromises()
  await wrapper.get('[name="actorId"]').setValue(id)
  list.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await wrapper.get('[data-testid="audit-more"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('You do not have permission')
  expect(wrapper.text()).not.toContain('Synthetic operator')
  expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
  expect(wrapper.find('input').exists()).toBe(false)
  await wrapper.setProps({ accessKey: 1 })
  await flushPromises()
  expect(wrapper.get<HTMLInputElement>('[name="actorId"]').element.value).toBe('')
  let release!: (value: { items: (typeof row)[]; nextCursor: null }) => void
  list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  await wrapper.get('form').trigger('submit')
  await wrapper.setProps({ enabled: false })
  release({ items: [row], nextCursor: null })
  await flushPromises()
  expect(wrapper.text()).not.toContain('Synthetic operator')
  expect(wrapper.text()).toContain('Audit access is closed')
  wrapper.unmount()
})
