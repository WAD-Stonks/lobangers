import type { CommunityComment, CommunitySummary } from '@broke-oclock/contracts/community'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'

export const useDealCommunity = (
  dealId: Ref<string>,
  changed: () => void,
  allComments: Ref<boolean> = ref(false),
) => {
  const session = authClient.useSession()
  const summary = ref<CommunitySummary | null>(null)
  const comments = ref<CommunityComment[]>([])
  const cursor = ref<string | null>(null)
  const loading = ref(true)
  const refreshing = ref(false)
  const loadingMore = ref(false)
  const busy = ref(false)
  const error = ref('')
  const draft = ref('')
  const receipt = ref('')
  let generation = 0
  let readVersion = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const message = (failure: unknown) => {
    switch (errorCode(failure)) {
      case 'UNAUTHORIZED':
        return 'Your session expired. Log in again to continue.'
      case 'TOO_MANY_REQUESTS':
        return 'Too many contributions. Please wait before trying again.'
      case 'CONFLICT':
        return 'Another update happened at the same time. Please try again.'
      case 'FORBIDDEN':
        return 'You do not have permission to perform this action.'
      case 'NOT_FOUND':
        return 'This deal or comment is no longer available.'
      default:
        return 'Could not update community information. Please try again.'
    }
  }
  const refresh = async () => {
    const current = generation
    const request = ++readVersion
    refreshing.value = true
    error.value = ''
    try {
      const [nextSummary, page] = await Promise.all([
        api.community.summary(dealId.value),
        api.community.comments(dealId.value, { limit: allComments.value ? 5 : 3 }),
      ])
      if (current !== generation || request !== readVersion) return
      summary.value = nextSummary
      comments.value = page.items
      cursor.value = page.nextCursor
    } catch (failure) {
      if (current === generation && request === readVersion) error.value = message(failure)
    } finally {
      if (current === generation) {
        loading.value = false
        refreshing.value = false
      }
    }
  }
  const more = async () => {
    if (!cursor.value || loadingMore.value || busy.value) return
    const current = generation
    const request = readVersion
    const after = cursor.value
    loadingMore.value = true
    error.value = ''
    try {
      const page = await api.community.comments(dealId.value, { cursor: after, limit: 5 })
      if (current !== generation) return
      if (request !== readVersion) return
      const ids = new Set(comments.value.map((comment) => comment.id))
      comments.value = [...comments.value, ...page.items.filter((comment) => !ids.has(comment.id))]
      cursor.value = page.nextCursor
    } catch (failure) {
      if (current === generation && request === readVersion) error.value = message(failure)
    } finally {
      if (current === generation) loadingMore.value = false
    }
  }
  const vote = async (value: 'ALIVE' | 'DEAD') => {
    if (busy.value || !summary.value || !session.value.data) return
    const current = generation
    readVersion++
    const previous = summary.value
    const remove = previous.myVote === value && previous.myVoteIsRecent
    const next = { ...previous }
    if (previous.myVoteIsRecent && previous.myVote)
      next[previous.myVote === 'ALIVE' ? 'alive' : 'dead']--
    if (!remove) next[value === 'ALIVE' ? 'alive' : 'dead']++
    next.myVote = remove ? null : value
    next.myVoteIsRecent = !remove
    summary.value = next
    busy.value = true
    error.value = ''
    receipt.value = ''
    try {
      const result = remove
        ? await api.community.removeVote(dealId.value)
        : await api.community.vote(dealId.value, value)
      if (current !== generation) return
      summary.value = result
      receipt.value = remove ? 'Vote removed.' : 'Vote updated. Thanks for sharing what you found.'
      changed()
    } catch (failure) {
      if (current === generation) {
        summary.value = previous
        error.value = message(failure)
      }
    } finally {
      if (current === generation) busy.value = false
    }
  }
  const mutate = async (work: () => Promise<unknown>, success: string) => {
    if (busy.value || !session.value.data) return false
    const current = generation
    readVersion++
    busy.value = true
    error.value = ''
    receipt.value = ''
    try {
      await work()
      if (current !== generation) return false
      receipt.value = success
      await refresh()
      if (current !== generation) return false
      changed()
      return true
    } catch (failure) {
      if (current === generation) error.value = message(failure)
      return false
    } finally {
      if (current === generation) busy.value = false
    }
  }
  const post = async () => {
    const text = draft.value.trim()
    if (!text || text.length > 2000) return
    if (await mutate(() => api.community.addComment(dealId.value, text), 'Comment posted.'))
      draft.value = ''
  }
  watch(
    [dealId, () => session.value.data?.user.id],
    () => {
      generation++
      summary.value = null
      comments.value = []
      cursor.value = null
      draft.value = ''
      receipt.value = ''
      error.value = ''
      busy.value = false
      loadingMore.value = false
      loading.value = true
      void refresh()
    },
    { immediate: true },
  )
  watch(allComments, (open) => {
    if (open) void refresh()
  })
  onMounted(() => {
    timer = setInterval(async () => {
      if (document.hidden || busy.value || loading.value || loadingMore.value) return
      const current = generation
      const request = ++readVersion
      try {
        const result = await api.community.summary(dealId.value)
        if (current === generation && request === readVersion) summary.value = result
      } catch {
        /* Keep the last successful read; explicit refresh exposes recoverable errors. */
      }
    }, 60000)
  })
  onBeforeUnmount(() => {
    generation++
    clearInterval(timer)
  })
  return {
    session,
    summary,
    comments,
    cursor,
    loading,
    refreshing,
    loadingMore,
    busy,
    error,
    draft,
    receipt,
    refresh,
    more,
    vote,
    mutate,
    post,
  }
}
