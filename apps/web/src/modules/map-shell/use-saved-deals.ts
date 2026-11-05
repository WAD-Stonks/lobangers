import { api } from '@web/lib/api-client'
import { computed, type InjectionKey, inject, provide, type Ref, shallowRef, watch } from 'vue'

const BOOKMARK_PAGE_LIMIT = 50

type Session = Readonly<Ref<{ data: { user: { id?: string } } | null }>>

export const createSavedDeals = (session: Session) => {
  const ids = shallowRef<ReadonlySet<string>>(new Set())
  const hasMore = shallowRef(false)
  const status = shallowRef<'loading' | 'ready' | 'error'>('ready')
  let latestRequest = 0

  const replace = (next: Iterable<string>) => {
    ids.value = new Set(next)
  }

  const load = async () => {
    const request = ++latestRequest
    status.value = 'loading'
    try {
      const collected: string[] = []
      let cursor: string | undefined
      do {
        const page = await api.account.bookmarks({
          limit: BOOKMARK_PAGE_LIMIT,
          ...(cursor ? { cursor } : {}),
        })
        if (request !== latestRequest) return
        collected.push(...page.items.map((item) => item.dealId))
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      replace(collected)
      hasMore.value = false
      status.value = 'ready'
    } catch (error) {
      if (request !== latestRequest) return
      status.value = 'error'
      console.error('Could not load saved deals', error)
    }
  }

  watch(
    () => session.value.data?.user.id ?? (session.value.data ? 'signed-in' : null),
    (user) => {
      if (user) {
        void load()
        return
      }
      latestRequest += 1
      replace([])
      hasMore.value = false
      status.value = 'ready'
    },
    { immediate: true },
  )

  const isSaved = (dealId: string) => ids.value.has(dealId)

  let queue: Promise<unknown> = Promise.resolve()
  const latestTap = new Map<string, Promise<unknown>>()

  const toggle = async (dealId: string): Promise<boolean> => {
    const wasSaved = isSaved(dealId)
    const withSaved = (saved: boolean) =>
      saved ? [...ids.value, dealId] : [...ids.value].filter((id) => id !== dealId)
    replace(withSaved(!wasSaved))
    const send = () => (wasSaved ? api.account.unsaveDeal(dealId) : api.account.saveDeal(dealId))
    const request = queue.then(send, send)
    queue = request
    latestTap.set(dealId, request)
    try {
      const result = await request
      return result.saved
    } catch (error) {
      if (latestTap.get(dealId) === request) replace(withSaved(wasSaved))
      throw error
    } finally {
      if (latestTap.get(dealId) === request) latestTap.delete(dealId)
    }
  }

  return {
    ids,
    status,
    count: computed(() => ids.value.size),
    countLabel: computed(() => `${ids.value.size}${hasMore.value ? '+' : ''}`),
    isSaved,
    toggle,
    reload: load,
  }
}

export type SavedDeals = ReturnType<typeof createSavedDeals>

const SAVED_KEY: InjectionKey<SavedDeals> = Symbol('saved-deals')

export const provideSavedDeals = (session: Session): SavedDeals => {
  const saved = createSavedDeals(session)
  provide(SAVED_KEY, saved)
  return saved
}

export const useSavedDeals = (): SavedDeals => {
  const saved = inject(SAVED_KEY, null)
  if (!saved) throw new Error('useSavedDeals() must be called inside MapShell')
  return saved
}
