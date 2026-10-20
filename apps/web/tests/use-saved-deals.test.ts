import { mount } from '@vue/test-utils'
import { createSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

const rest = vi.hoisted(() => ({ bookmarks: vi.fn(), save: vi.fn(), unsave: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  api: { account: { bookmarks: rest.bookmarks, saveDeal: rest.save, unsaveDeal: rest.unsave } },
}))

// Synthetic session and bookmark ids.
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
    await saved.toggle('d2')
    fail(new Error('network'))
    await expect(first).rejects.toThrow('network')
    expect(saved.isSaved('d1')).toBe(false)
    expect(saved.isSaved('d2')).toBe(true)
  })
})
