import { api } from '@web/lib/api-client'
import { computed, type InjectionKey, inject, provide, type Ref, shallowRef, watch } from 'vue'

// The visitor's saved deal ids, shared by the brand menu's count and every Save button. Loads
// the first page of bookmarks when someone signs in; toggles are optimistic and roll back if
// the API refuses, re-throwing so the caller can show an error toast.
const BOOKMARK_PAGE_LIMIT = 50

type Session = Readonly<Ref<{ data: { user: { id?: string } } | null }>>

export const createSavedDeals = (session: Session) => {
  const ids = shallowRef<ReadonlySet<string>>(new Set())
  const hasMore = shallowRef(false)
  // Bumped on every load and sign-out, so a slow response for an old session is dropped.
  let latestRequest = 0

  const replace = (next: Iterable<string>) => {
    ids.value = new Set(next)
  }

  const load = async () => {
    const request = ++latestRequest
    try {
      const page = await api.account.bookmarks({ limit: BOOKMARK_PAGE_LIMIT })
      if (request !== latestRequest) return
      replace(page.items.map((item) => item.dealId))
      hasMore.value = page.nextCursor !== null
    } catch (error) {
      // The count is a nicety; the saved page itself reports failures.
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
    },
    { immediate: true },
  )

  const isSaved = (dealId: string) => ids.value.has(dealId)

  const toggle = async (dealId: string): Promise<boolean> => {
    const wasSaved = isSaved(dealId)
    const withSaved = (saved: boolean) =>
      saved ? [...ids.value, dealId] : [...ids.value].filter((id) => id !== dealId)
    replace(withSaved(!wasSaved))
    try {
      const result = wasSaved
        ? await api.account.unsaveDeal(dealId)
        : await api.account.saveDeal(dealId)
      return result.saved
    } catch (error) {
      // Undo only this deal, so a toggle on another deal meanwhile survives.
      replace(withSaved(wasSaved))
      throw error
    }
  }

  return {
    ids,
    count: computed(() => ids.value.size),
    // "50+" when the visitor has more bookmarks than the first page holds.
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
