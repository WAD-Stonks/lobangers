<script setup lang="ts">
import type { Submission } from '@broke-oclock/contracts/account'
import { DEAL_CUISINE_LABELS, isDealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import { BModal } from '@broke-oclock/ui'
import DealImage from '@web/components/DealImage.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { api } from '@web/lib/api-client'
import { formatDate } from '@web/lib/format'
import { useCanAddDeal } from '@web/lib/use-can-add-deal'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { offerLabel } from '@web/modules/venues-feed/deal-format'
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const submissions = ref<Submission[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const loadMoreError = ref('')
const notLoggedIn = ref(false)
const errorMessage = ref('')
const notice = ref('')
const route = useRoute()
const router = useRouter()
const justSubmitted = route.query.submitted === '1'
const canAddDeal = useCanAddDeal()

const selected = ref<Submission | null>(null)
const detailsOpen = ref(false)
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

// Which Bootstrap colour to use for each review status
const badgeClass: Record<string, string> = {
  PENDING: 'text-bg-warning',
  APPROVED: 'text-bg-success',
  REJECTED: 'text-bg-danger',
  HIDDEN: 'text-bg-secondary',
}
const statusLabel: Record<string, string> = {
  PENDING: 'Awaiting review',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  HIDDEN: 'Hidden by admin',
}
const statusHint: Record<string, string> = {
  PENDING: 'An admin will check this deal before it appears on the map. You can still delete it.',
  APPROVED: 'An admin approved this deal, so it shows on the map while it runs.',
  REJECTED: 'An admin did not approve this deal, so it is not on the map.',
  HIDDEN: 'An admin took this deal off the map.',
}
const statusMessage = (item: Submission) =>
  item.reviewStatus === 'PENDING' && !item.deletable
    ? 'An admin approved this deal before and is checking it again, so it can no longer be deleted.'
    : statusHint[item.reviewStatus]
const categoryLabel: Record<string, string> = {
  FOOD: 'Food',
  DRINKS: 'Drinks',
  DESSERT: 'Dessert',
  SNACKS: 'Snacks',
  BAKERY: 'Bakery',
}

const dayFormat = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const formatDay = (day: string | null) => (day ? dayFormat.format(new Date(`${day}T00:00:00Z`)) : '')
const runsLabel = (item: Submission) => [formatDay(item.startDate), formatDay(item.endDate)].filter(Boolean).join(' to ')
const offerSummary = (item: Submission) =>
  offerLabel({ offerType: item.offerType, priceMinor: item.priceCents, currency: 'SGD', discountPercent: item.discountPercent }) ??
  'Other offer'
const cuisineName = (item: Submission) => (item.cuisine && isDealCuisine(item.cuisine) ? DEAL_CUISINE_LABELS[item.cuisine] : '')
const stallsSummary = (item: Submission) => {
  const names = item.stalls.map((stall) => stall.name)
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}
const detailRows = (item: Submission) => [
  ['Description', item.description],
  ['Offer', offerSummary(item)],
  ['Category', categoryLabel[item.category] ?? item.category],
  ['Cuisine', cuisineName(item)],
  ['Runs', runsLabel(item)],
  ['Terms', item.terms ?? ''],
  ['Submitted', formatDate(item.createdAt)],
]

const loadSubmissions = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.account.submissions()
    submissions.value = result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    if (errorCode(error) === 'UNAUTHORIZED') {
      notLoggedIn.value = true
    } else {
      errorMessage.value = 'Could not load your submissions. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  // A second click while the first request is still running would fetch the same page again.
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  loadMoreError.value = ''
  try {
    const result = await api.account.submissions({ cursor: nextCursor.value })
    submissions.value = [...submissions.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch {
    // Shown under the list, so the pages already loaded stay visible and the user can click again.
    loadMoreError.value = 'Could not load more submissions. Please try again.'
  } finally {
    loadingMore.value = false
  }
}

const openDetails = (item: Submission) => {
  selected.value = item
  confirmingDelete.value = false
  deleteError.value = ''
  detailsOpen.value = true
}

const deleteSelected = async () => {
  const item = selected.value
  if (!item || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await api.account.deleteSubmission(item.id)
    submissions.value = submissions.value.filter((submission) => submission.id !== item.id)
    detailsOpen.value = false
    notice.value = `“${item.title}” was deleted.`
  } catch (error) {
    const code = errorCode(error)
    deleteError.value =
      code === 'PRECONDITION_FAILED' || code === 'NOT_FOUND'
        ? 'This deal can no longer be deleted. It may have been reviewed already.'
        : 'Could not delete the deal. Please try again.'
  } finally {
    deleting.value = false
  }
}

const goBack = () => {
  if (router.options.history.state.back) router.back()
  else void router.push('/deals')
}

onMounted(() => {
  if (justSubmitted) void router.replace({ query: {} })
  void loadSubmissions()
})
</script>

<template>
  <section class="my-submissions">
    <header class="my-submissions__hero">
      <div class="my-submissions__intro">
        <button type="button" class="my-submissions__back" @click="goBack"><ShellIcon name="back" :size="16" />Back</button>
        <h1 class="my-submissions__title">My deal submissions</h1>
      </div>
      <RouterLink v-if="canAddDeal" class="lb-btn lb-btn--primary my-submissions__add" :to="{ name: 'submit-deal' }">
        <ShellIcon name="plus" :size="18" />Add a deal
      </RouterLink>
    </header>

    <p v-if="justSubmitted" class="alert alert-success" role="status">
      Thanks! Your deal is submitted and will appear once an admin reviews it.
    </p>
    <p v-if="notice" class="alert alert-success" role="status">{{ notice }}</p>

    <TicketLoading v-if="loading" label="Loading your submissions…" />

    <p v-else-if="notLoggedIn">
      Please <RouterLink to="/login">log in</RouterLink> to see your submissions.
    </p>

    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadSubmissions">
        Retry
      </button>
    </div>

    <p v-else-if="submissions.length === 0" class="text-secondary">
      You haven't submitted any deals yet.
    </p>

    <div v-else>
      <ul class="list-unstyled d-grid gap-3">
        <li v-for="item in submissions" :key="item.id" class="submission-card">
          <div class="submission-card__top">
            <h2 class="submission-card__title">
              <button type="button" class="submission-card__open" @click="openDetails(item)">{{ item.title }}</button>
            </h2>
            <span class="badge flex-shrink-0" :class="badgeClass[item.reviewStatus]">{{ statusLabel[item.reviewStatus] }}</span>
          </div>
          <p class="submission-card__meta">
            {{ offerSummary(item) }} · {{ categoryLabel[item.category] ?? item.category }} · submitted
            <time :datetime="item.createdAt">{{ formatDate(item.createdAt) }}</time>
          </p>
          <p v-if="item.stalls.length > 0" class="submission-card__line">
            <ShellIcon name="pin" :size="16" />
            <span>{{ stallsSummary(item) }}</span>
          </p>
          <p v-if="runsLabel(item)" class="submission-card__line">
            <ShellIcon name="calendar" :size="16" />
            <span>{{ runsLabel(item) }}</span>
          </p>
          <p v-if="item.reviewNote" class="submission-card__note">Reviewer note: {{ item.reviewNote }}</p>
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

    <BModal v-model="detailsOpen" :title="selected?.title ?? ''" modal-class="submission-modal" centered scrollable size="lg" no-footer>
      <div v-if="selected" class="submission-details">
        <div class="submission-details__status">
          <span class="badge" :class="badgeClass[selected.reviewStatus]">{{ statusLabel[selected.reviewStatus] }}</span>
          <p class="mb-0">{{ statusMessage(selected) }}</p>
        </div>
        <DealImage v-if="selected.photoUrl" :url="selected.photoUrl" :alt="selected.title" class="submission-details__photo" />
        <dl class="submission-details__rows">
          <div v-for="[term, value] in detailRows(selected)" :key="term">
            <dt>{{ term }}</dt>
            <dd>{{ value || '—' }}</dd>
          </div>
          <div v-if="selected.reviewNote">
            <dt>Reviewer note</dt>
            <dd>{{ selected.reviewNote }}</dd>
          </div>
        </dl>

        <h3 class="submission-details__heading">{{ selected.stalls.length === 1 ? 'Stall' : `Stalls (${selected.stalls.length})` }}</h3>
        <ul class="submission-details__stalls">
          <li v-for="stall in selected.stalls" :key="stall.id">
            <ShellIcon name="pin" :size="18" />
            <span><strong>{{ stall.name }}</strong><span>{{ stall.address }}</span></span>
          </li>
        </ul>

        <div v-if="selected.deletable" class="submission-details__delete">
          <button v-if="!confirmingDelete" type="button" class="lb-btn submission-details__danger" @click="confirmingDelete = true">
            Delete deal
          </button>
          <template v-else>
            <p class="mb-0">Delete this deal? It will not be reviewed, and this cannot be undone.</p>
            <div class="submission-details__confirm">
              <button type="button" class="lb-btn" :disabled="deleting" @click="confirmingDelete = false">Keep it</button>
              <button type="button" class="lb-btn submission-details__danger" :disabled="deleting" @click="deleteSelected">
                {{ deleting ? 'Deleting…' : 'Yes, delete' }}
              </button>
            </div>
          </template>
          <p v-if="deleteError" class="text-danger mb-0" role="alert">{{ deleteError }}</p>
        </div>
      </div>
    </BModal>
  </section>
</template>

<style scoped>
.my-submissions {
  box-sizing: border-box;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: clamp(16px, 4vw, 32px) clamp(16px, 4vw, 24px) 48px;
}

.my-submissions__hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 24px;
}
.my-submissions__intro {
  min-width: 0;
}
.my-submissions__add {
  flex: none;
  gap: 6px;
}
.my-submissions__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--hit, 44px);
  margin-bottom: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  font: 700 0.875rem / 1 var(--font-sans);
  color: var(--ink-muted);
  cursor: pointer;
}
.my-submissions__back:hover {
  color: var(--ink);
}
.my-submissions__back:focus-visible {
  outline: 3px solid var(--focus-ring, var(--sunny-ring));
  outline-offset: 3px;
  border-radius: 4px;
}
.my-submissions__title {
  margin: 0;
  font-size: clamp(2rem, 6vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.submission-card {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 16px 20px;
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 20px;
  transition: background-color 150ms ease, border-color 150ms ease;
}
.submission-card:hover {
  background: var(--paper-hover);
  border-color: var(--hairline-strong, var(--hairline));
}
.submission-card:has(.submission-card__open:focus-visible) {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}
.submission-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.submission-card__title {
  min-width: 0;
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.submission-card__open {
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;
}
.submission-card__open::after {
  position: absolute;
  inset: 0;
  content: "";
  border-radius: inherit;
}
.submission-card__open:focus-visible {
  outline: none;
}
.submission-card__meta,
.submission-card__line,
.submission-card__note {
  margin: 0;
  overflow-wrap: anywhere;
}
.submission-card__meta {
  color: var(--ink-muted);
  font-size: 0.875rem;
}
.submission-card__line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.9375rem;
}
.submission-card__line :deep(svg) {
  flex: none;
  margin-top: 3px;
  color: var(--ink-muted);
}

.submission-details {
  display: grid;
  gap: 16px;
}
.submission-details__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  color: var(--ink-muted);
  font-size: 0.9375rem;
}
.submission-details__status .badge {
  flex: none;
}
.submission-details .submission-details__photo {
  aspect-ratio: auto;
  overflow: visible;
  background: transparent;
}
.submission-details__photo :deep(img) {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: 280px;
  border-radius: 16px;
}
.submission-details__photo :deep([role="img"]) {
  width: 100%;
  aspect-ratio: 16 / 10;
  display: grid;
  place-items: center;
  background: var(--paper-sunk);
  border-radius: 16px;
}
.submission-details__rows {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 14px 16px;
  background: var(--paper-sunk);
  border-radius: 16px;
}
.submission-details__rows > div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 12px;
}
.submission-details__rows dt {
  color: var(--ink-muted);
  font-weight: 600;
}
.submission-details__rows dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.submission-details__heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.submission-details__stalls {
  display: grid;
  gap: 8px;
  margin: -8px 0 0;
  padding: 0;
  list-style: none;
}
.submission-details__stalls li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 14px;
  overflow-wrap: anywhere;
}
.submission-details__stalls li > span {
  display: grid;
  min-width: 0;
}
.submission-details__stalls li > span > span {
  color: var(--ink-muted);
  font-size: 0.875rem;
}
.submission-details__delete {
  display: grid;
  gap: 10px;
  justify-items: end;
  padding-top: 16px;
  text-align: right;
  border-top: 1px solid var(--hairline);
}
.submission-details__confirm {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.submission-details__danger {
  color: var(--on-ink);
  background: var(--coral);
  border-color: var(--coral);
}
.submission-details__danger:hover {
  color: var(--on-ink);
  background: var(--coral-deep);
}

@media (max-width: 640px) {
  .submission-details__rows > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}
</style>

<style>
.submission-modal {
  --bs-modal-zindex: 1110;
}
</style>
