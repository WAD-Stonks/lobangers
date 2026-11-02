<script setup lang="ts">
import type { Bookmark } from '@broke-oclock/contracts/account'
import TicketLoading from '@web/components/TicketLoading.vue'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

// State: things the page needs to remember
const bookmarks = ref<Bookmark[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const loadMoreError = ref('')
const notLoggedIn = ref(false)
const errorMessage = ref('')
const removeError = ref('')
const removingId = ref<string | null>(null) // the deal whose Remove request is running
// The last removed deal and where it sat, so Undo can save it again in the same place.
const lastRemoved = ref<{ item: Bookmark; index: number } | null>(null)
const undoing = ref(false)
const listEl = ref<HTMLElement | null>(null)
const headingEl = ref<HTMLElement | null>(null)

const titleOf = (item: Bookmark) => item.deal?.title ?? 'This deal'

// After a removal the button that had focus is gone; move focus to the item that took its
// place (or the one before it), and to the page heading when the list is empty.
const focusAfterRemoval = async (index: number) => {
  await nextTick()
  const buttons = listEl.value?.querySelectorAll<HTMLElement>('[data-remove]') ?? []
  const next = buttons[Math.min(index, buttons.length - 1)]
  if (next) next.focus()
  else headingEl.value?.focus()
}

// Load the first page of saved deals
const loadBookmarks = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.account.bookmarks()
    bookmarks.value = result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    if (errorCode(error) === 'UNAUTHORIZED') {
      notLoggedIn.value = true
    } else {
      errorMessage.value = 'Could not load your saved deals. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

// Load the next page and add it to the end of the list
const loadMore = async () => {
  // A second click while the first request is still running would fetch the same page again.
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  loadMoreError.value = ''
  try {
    const result = await api.account.bookmarks({ cursor: nextCursor.value })
    bookmarks.value = [...bookmarks.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch {
    // Shown under the list, so the pages already loaded stay visible and the user can click again.
    loadMoreError.value = 'Could not load more deals. Please try again.'
  } finally {
    loadingMore.value = false
  }
}

// Remove one saved deal, then take it out of the list on screen. Undo can bring it back.
const removeBookmark = async (dealId: string) => {
  if (removingId.value) return
  removeError.value = ''
  removingId.value = dealId
  try {
    await api.account.unsaveDeal(dealId)
    const index = bookmarks.value.findIndex((item) => item.dealId === dealId)
    const removed = bookmarks.value[index]
    lastRemoved.value = removed ? { item: removed, index } : null
    bookmarks.value = bookmarks.value.filter((item) => item.dealId !== dealId)
    removingId.value = null
    // If that was the last deal on screen but older ones exist, fetch the next page right away,
    // so the page never says nothing is saved while more bookmarks remain.
    if (bookmarks.value.length === 0 && nextCursor.value) await loadMore()
    await focusAfterRemoval(Math.max(index, 0))
  } catch {
    removeError.value = 'Could not remove that deal. Please try again.'
  } finally {
    removingId.value = null
  }
}

// Saves the removed deal again and puts it back where it was.
const undoRemove = async () => {
  const removed = lastRemoved.value
  if (!removed || undoing.value) return
  undoing.value = true
  removeError.value = ''
  try {
    await api.account.saveDeal(removed.item.dealId)
    const without = bookmarks.value.filter((item) => item.dealId !== removed.item.dealId)
    bookmarks.value = [
      ...without.slice(0, removed.index),
      removed.item,
      ...without.slice(removed.index),
    ]
    lastRemoved.value = null
    await nextTick()
    listEl.value?.querySelector<HTMLElement>(`[data-remove="${removed.item.dealId}"]`)?.focus()
  } catch {
    removeError.value = 'Could not put that deal back. Please try again.'
  } finally {
    undoing.value = false
  }
}

onMounted(loadBookmarks)
</script>

<template>
  <section class="container py-4 saved-deals">
    <h1 ref="headingEl" class="h2 mb-4" tabindex="-1">Saved deals</h1>

    <!-- Always mounted so the removal and its Undo are announced. -->
    <div role="status" class="saved-deals__notice">
      <p v-if="lastRemoved" class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span class="text-break">Removed “{{ titleOf(lastRemoved.item) }}”.</span>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          :disabled="undoing"
          @click="undoRemove"
        >
          {{ undoing ? 'Restoring…' : 'Undo' }}
        </button>
      </p>
    </div>

    <TicketLoading v-if="loading" label="Loading your saved deals…" />

    <p v-else-if="notLoggedIn">
      Please <RouterLink to="/login">log in</RouterLink> to see your saved deals.
    </p>

    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadBookmarks">
        Retry
      </button>
    </div>

    <p v-else-if="bookmarks.length === 0 && !nextCursor" class="text-secondary">
      You haven't saved any deals yet.
    </p>

    <div v-else>
      <p v-if="removeError" class="text-danger" role="alert">{{ removeError }}</p>
      <ul ref="listEl" class="list-unstyled d-grid gap-3">
        <li v-for="item in bookmarks" :key="item.id" class="card card-body">
          <div v-if="item.deal" class="saved-deals__text">
            <h2 class="h5">{{ item.deal.title }}</h2>
            <span class="badge text-bg-secondary mb-2">{{ item.deal.category }}</span>
            <p class="mb-2">{{ item.deal.description }}</p>
          </div>
          <p v-else class="text-secondary mb-2">This deal is no longer available.</p>
          <button
            type="button"
            class="btn btn-sm btn-outline-danger align-self-start"
            :data-remove="item.dealId"
            :disabled="removingId !== null"
            :aria-busy="removingId === item.dealId"
            @click="removeBookmark(item.dealId)"
          >
            <template v-if="removingId === item.dealId">Removing…</template>
            <template v-else>
              Remove<span class="visually-hidden"> {{ titleOf(item) }}</span>
            </template>
          </button>
        </li>
      </ul>
      <p v-if="loadMoreError" class="text-danger" role="alert">{{ loadMoreError }}</p>
      <button
        v-if="nextCursor"
        type="button"
        class="btn btn-outline-secondary"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
/* A readable width on wide screens. */
.saved-deals {
  max-width: 52rem;
}

/* The heading takes focus after the last removal; it is not a control, so no ring. */
.saved-deals h1:focus {
  outline: none;
}

/* Long deal titles and descriptions wrap on a 320px phone. */
.saved-deals__text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.btn {
  touch-action: manipulation;
}

/* Comfortable touch targets on phones. */
@media (pointer: coarse) {
  .btn-sm {
    min-height: 44px;
  }
}
</style>
