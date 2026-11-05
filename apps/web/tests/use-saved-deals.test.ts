import { flushPromises, mount } from '@vue/test-utils'
import { createSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

const rest = vi.hoisted(() => ({ bookmarks: vi.fn(), save: vi.fn(), unsave: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  api: { account: { bookmarks: rest.bookmarks, saveDeal: rest.save, unsaveDeal: rest.unsave } },
}))

type Session = { data: { user: { id?: string } } | null }
const page = (ids: string[]) => ({ items: ids.map((dealId) => ({ dealId })), nextCursor: null })

const setup = (initial: Session) => {
  const session = ref<Session>(initial)
  let saved: ReturnType<typeof createSavedDeals> | undefined
  mount(
    defineComponent({
      setup() {
        saved = createSavedDeals(session)
        return () => h('div')
      },
    }),
  )
  if (!saved) throw new Error('not created')
  return { session, saved }
}

beforeEach(() => {
  rest.bookmarks.mockReset()
  rest.save.mockReset()
  rest.unsave.mockReset()
})

describe('saved deals', () => {
  it('loads all bookmark pages so Saved does not omit older deals', async () => {
    rest.bookmarks
      .mockResolvedValueOnce({ ...page(['d1']), nextCursor: 'older' })
      .mockResolvedValueOnce(page(['d2']))
    const { saved } = setup({ data: { user: { id: 'u1' } } })
    await flushPromises()
    expect(rest.bookmarks).toHaveBeenLastCalledWith({ limit: 50, cursor: 'older' })
    expect(saved.isSaved('d1')).toBe(true)
    expect(saved.isSaved('d2')).toBe(true)
    expect(saved.status.value).toBe('ready')
  })

  it('drops a bookmark page that arrives after sign-out', async () => {
    let resolve: (value: unknown) => void = () => undefined
    rest.bookmarks.mockReturnValue(new Promise((done) => (resolve = done)))
    const { session, saved } = setup({ data: { user: { id: 'u1' } } })
    session.value = { data: null }
    await nextTick()
    resolve(page(['d1', 'd2']))
    await Promise.resolve()
    await nextTick()
    expect(saved.count.value).toBe(0)
  })

  it('rolls back only the failed deal, keeping a concurrent save', async () => {
    rest.bookmarks.mockResolvedValue(page([]))
    let fail: (error: Error) => void = () => undefined
    rest.save
      .mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
      .mockResolvedValueOnce({ saved: true })
    const { saved } = setup({ data: { user: { id: 'u1' } } })
    await nextTick()
    const first = saved.toggle('d1')
    const second = saved.toggle('d2')
    fail(new Error('network'))
    await expect(first).rejects.toThrow('network')
    await second
    expect(saved.isSaved('d1')).toBe(false)
    expect(saved.isSaved('d2')).toBe(true)
  })

  it('waits for one deal to finish saving before sending the next', async () => {
    rest.bookmarks.mockResolvedValue(page([]))
    let finishFirst: () => void = () => undefined
    rest.save
      .mockReturnValueOnce(new Promise((done) => (finishFirst = () => done({ saved: true }))))
      .mockResolvedValueOnce({ saved: true })
    const { saved } = setup({ data: { user: { id: 'u1' } } })
    await nextTick()
    const first = saved.toggle('d1')
    const second = saved.toggle('d2')
    await flushPromises()
    expect(rest.save).toHaveBeenCalledTimes(1)
    finishFirst()
    await Promise.all([first, second])
    expect(rest.save).toHaveBeenNthCalledWith(2, 'd2')
  })

  it('lets a second tap unsave while the save is still in flight, sending both in order', async () => {
    rest.bookmarks.mockResolvedValue(page([]))
    const calls: string[] = []
    let finishSave: () => void = () => undefined
    rest.save.mockImplementation(() => {
      calls.push('save')
      return new Promise((done) => (finishSave = () => done({ saved: true })))
    })
    rest.unsave.mockImplementation(() => {
      calls.push('unsave')
      return Promise.resolve({ saved: false })
    })
    const { saved } = setup({ data: { user: { id: 'u1' } } })
    await nextTick()
    const first = saved.toggle('d1')
    expect(saved.isSaved('d1')).toBe(true)
    const second = saved.toggle('d1')
    expect(saved.isSaved('d1')).toBe(false)
    await flushPromises()
    expect(calls).toEqual(['save'])
    finishSave()
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    expect(calls).toEqual(['save', 'unsave'])
    expect(saved.isSaved('d1')).toBe(false)
  })

  it('still sends a queued tap after the earlier request for that deal fails', async () => {
    rest.bookmarks.mockResolvedValue(page([]))
    rest.save.mockRejectedValueOnce(new Error('network'))
    rest.unsave.mockResolvedValueOnce({ saved: false })
    const { saved } = setup({ data: { user: { id: 'u1' } } })
    await nextTick()
    const first = saved.toggle('d1')
    const second = saved.toggle('d1')
    await expect(first).rejects.toThrow('network')
    await expect(second).resolves.toBe(false)
    expect(saved.isSaved('d1')).toBe(false)
  })
})
