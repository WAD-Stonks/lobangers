<script setup lang="ts">
import TicketLoading from '@web/components/TicketLoading.vue'
import { formatDate, formatMoneyMinor } from '@web/lib/format'
import { useConfirm } from '@web/lib/use-confirm'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import '@web/modules/merchant/merchant.css'
import FlashDropsSection from '@web/modules/merchant/FlashDropsSection.vue'
import type { MerchantFlashDrop } from '@web/modules/merchant/flash-drop-api'
import { flashOfferText, whenText } from '@web/modules/merchant/flash-drop-rules'
import MerchantCardGrid from '@web/modules/merchant/MerchantCardGrid.vue'
import MerchantDealCard from '@web/modules/merchant/MerchantDealCard.vue'
import {
  deleteDeal,
  endDeal,
  errorMessageFor,
  getDeals,
  getOutlets,
  type MerchantDeal,
  type MerchantOutlet,
  type OfferType,
} from '@web/modules/merchant/merchant-api'
import {
  type MerchantNotice,
  type NoticeTone,
  takeMerchantNotice,
} from '@web/modules/merchant/merchant-notice'
import { useMerchantFlashDrops } from '@web/modules/merchant/use-merchant-flash-drops'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { ask } = useConfirm()

const outlets = ref<MerchantOutlet[]>([])
const deals = ref<MerchantDeal[]>([])
const loading = ref(true)
const loadError = ref('')

const notice = ref<MerchantNotice | null>(takeMerchantNotice())
const noticeEl = ref<HTMLElement | null>(null)
const notify = (tone: NoticeTone, text: string) => {
  notice.value = { tone, text }
  void nextTick(() => noticeEl.value?.scrollIntoView?.({ block: 'nearest' }))
}

const flash = useMerchantFlashDrops(notify)

type TabId = 'deals' | 'flash' | 'ended'
const TAB_IDS: readonly TabId[] = ['deals', 'flash', 'ended']
const tab = computed<TabId>(() => {
  const asked = route.query.tab
  return TAB_IDS.includes(asked as TabId) ? (asked as TabId) : 'deals'
})
const openTab = (id: TabId) =>
  router.replace({ query: { ...route.query, tab: id === 'deals' ? undefined : id } })

const tabEls = ref<HTMLElement[]>([])
const moveTab = async (from: number, by: number) => {
  const index = (from + by + TAB_IDS.length) % TAB_IDS.length
  const target = TAB_IDS[index] as TabId
  await openTab(target)
  tabEls.value[index]?.focus()
}

const today = new Date().toLocaleDateString('en-CA')

type DealStatus = 'Live' | 'Scheduled' | 'Ended'
const statusOf = (deal: MerchantDeal): DealStatus => {
  if (deal.endedAt) return 'Ended'
  if (deal.endDate && deal.endDate < today) return 'Ended'
  if (deal.startDate && deal.startDate > today) return 'Scheduled'
  return 'Live'
}

const liveDeals = computed(() => deals.value.filter((deal) => statusOf(deal) === 'Live'))
const scheduledDeals = computed(() => deals.value.filter((deal) => statusOf(deal) === 'Scheduled'))
const currentDeals = computed(() => deals.value.filter((deal) => statusOf(deal) !== 'Ended'))
const endedDeals = computed(() => deals.value.filter((deal) => statusOf(deal) === 'Ended'))

type DealFilter = 'all' | 'live' | 'scheduled'
const filter = ref<DealFilter>('all')
const filters = computed(() => [
  { id: 'all' as const, label: 'All', count: currentDeals.value.length },
  { id: 'live' as const, label: 'Live', count: liveDeals.value.length },
  { id: 'scheduled' as const, label: 'Scheduled', count: scheduledDeals.value.length },
])
const shownDeals = computed(() => {
  if (filter.value === 'live') return liveDeals.value
  if (filter.value === 'scheduled') return scheduledDeals.value
  return currentDeals.value
})
const emptyDeals = computed(() => {
  if (filter.value === 'live') return 'No live deals right now.'
  if (filter.value === 'scheduled') return 'No scheduled deals.'
  return 'No deals yet. Add one and it goes on the map straight away.'
})

const tabs = computed(() => [
  { id: 'deals' as const, label: 'Deals', count: currentDeals.value.length },
  { id: 'flash' as const, label: 'Flash deals', count: flash.drops.value.length },
  { id: 'ended' as const, label: 'Ended', count: endedDeals.value.length },
])

const offerLabels: Record<OfferType, string> = {
  BUY_ONE_GET_ONE: '1-for-1',
  PERCENT_OFF: '% off',
  FIXED_PRICE: 'Fixed price',
  OTHER: 'Other',
}

const offerText = (deal: MerchantDeal) => {
  if (deal.offerType === 'PERCENT_OFF') return `${deal.discountPercent}% off`
  if (deal.offerType === 'FIXED_PRICE') return formatMoneyMinor(deal.priceCents ?? 0)
  return offerLabels[deal.offerType]
}

const datesText = (deal: MerchantDeal) => {
  const from = deal.startDate ? formatDate(deal.startDate) : 'Now'
  const until = deal.endDate ? formatDate(deal.endDate) : 'no end date'
  return `${from} to ${until}`
}

const outletNames = (deal: MerchantDeal) =>
  outlets.value
    .filter((outlet) => deal.outletIds.includes(outlet.id))
    .map((outlet) => outlet.name)
    .join(', ')

const featuredFlash = computed<MerchantFlashDrop | null>(() => {
  const running = flash.running.value
  return (
    running.find((drop) => drop.status === 'LIVE') ??
    [...running].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ??
    null
  )
})
const featuredWhen = computed(() => {
  const drop = featuredFlash.value
  if (!drop) return ''
  const now = flash.now.value
  if (drop.status === 'LIVE') {
    const minutes = Math.max(0, Math.ceil((Date.parse(drop.endsAt) - now.getTime()) / 60_000))
    return `${minutes} min left to claim`
  }
  return `Starts ${whenText(drop.startsAt, now).toLowerCase()}`
})
const codes = computed(() =>
  flash.running.value.reduce(
    (sum, drop) => ({ claimed: sum.claimed + drop.claimedCount, limit: sum.limit + drop.codeLimit }),
    { claimed: 0, limit: 0 },
  ),
)
const codesPercent = computed(() =>
  codes.value.limit === 0 ? 0 : Math.round((codes.value.claimed / codes.value.limit) * 100),
)
const comingUpText = computed(() => {
  const drafts = flash.drafts.value.length
  return drafts === 0 ? 'scheduled deals' : `scheduled · ${drafts} flash ${drafts === 1 ? 'draft' : 'drafts'}`
})

const loadDashboard = async () => {
  loading.value = true
  loadError.value = ''
  try {
    outlets.value = await getOutlets()
    deals.value = await getDeals()
  } catch (error) {
    loadError.value = errorMessageFor(error, 'Could not load your deals. Please try again.')
  } finally {
    loading.value = false
  }
}

const newDeal = () => router.push({ name: 'merchant-deal-new' })
const newFlashDeal = () => router.push({ name: 'merchant-flash-new' })
const editDeal = (deal: MerchantDeal) =>
  router.push({ name: 'merchant-deal-edit', params: { id: deal.id } })
const runAgain = (deal: MerchantDeal) =>
  router.push({ name: 'merchant-deal-run-again', params: { id: deal.id } })
const editFlashDraft = (drop: MerchantFlashDrop) =>
  router.push({ name: 'merchant-flash-edit', params: { id: drop.id } })

const confirmEndDeal = async (deal: MerchantDeal) => {
  const confirmed = await ask({
    title: 'End this deal?',
    body: `"${deal.title}" will stop showing to customers now. It stays in Ended deals.`,
    confirmLabel: 'End deal',
  })
  if (!confirmed) return
  try {
    const ended = await endDeal(deal.id)
    deals.value = deals.value.map((item) => (item.id === ended.id ? ended : item))
    notify('success', `"${ended.title}" has ended.`)
  } catch (error) {
    notify('error', errorMessageFor(error, 'Could not end the deal. Please try again.'))
  }
}

const confirmDeleteDeal = async (deal: MerchantDeal) => {
  const confirmed = await ask({
    title: 'Delete this deal?',
    body: `"${deal.title}" will be removed from the map and from this page.`,
    confirmLabel: 'Delete deal',
  })
  if (!confirmed) return
  try {
    await deleteDeal(deal.id)
    deals.value = deals.value.filter((item) => item.id !== deal.id)
    notify('success', `"${deal.title}" was deleted.`)
  } catch (error) {
    notify('error', errorMessageFor(error, 'Could not delete the deal. Please try again.'))
  }
}

onMounted(loadDashboard)
</script>

<template>
  <section class="merchant-page merchant-dashboard">
    <header class="merchant-dashboard__head">
      <div class="merchant-dashboard__intro">
        <RouterLink to="/deals" class="merchant-back"><ShellIcon name="back" :size="16" />Back to all deals</RouterLink>
        <h1 class="merchant-title">Merchant dashboard</h1>
        <p v-if="outlets.length > 0" class="merchant-dashboard__outlets">
          Your outlets: {{ outlets.map((outlet) => outlet.name).join(', ') }} ·
          <RouterLink to="/me/merchant-access">Request another outlet</RouterLink>
        </p>
      </div>
      <div v-if="!loading && outlets.length > 0" class="merchant-dashboard__actions">
        <button type="button" class="lb-btn" @click="newFlashDeal">
          <ShellIcon name="flash" :size="18" class="merchant-dashboard__flash-icon" />New flash deal
        </button>
        <button type="button" class="lb-btn lb-btn--primary" @click="newDeal">
          <ShellIcon name="plus" :size="18" />Add a deal
        </button>
      </div>
    </header>

    <div ref="noticeEl" class="merchant-dashboard__notice" :role="notice?.tone === 'error' ? 'alert' : 'status'">
      <p v-if="notice" class="merchant-alert" :class="`merchant-alert--${notice.tone}`">
        <ShellIcon :name="notice.tone === 'error' ? 'close' : 'check'" :size="18" />
        <span class="merchant-alert__text">{{ notice.text }}</span>
        <button type="button" class="merchant-alert__close" aria-label="Dismiss message" @click="notice = null">×</button>
      </p>
    </div>

    <TicketLoading v-if="loading" label="Loading your deals…" />

    <div v-else-if="loadError" class="lb-state" role="alert">
      <p class="lb-state__title">Your deals didn't load</p>
      <p class="lb-state__body">{{ loadError }}</p>
      <button type="button" class="lb-btn lb-btn--primary merchant-dashboard__state-action" @click="loadDashboard">Try again</button>
    </div>

    <div v-else-if="outlets.length === 0" class="lb-state">
      <p class="lb-state__title">You don't manage any outlets yet</p>
      <p class="lb-state__body">Once an admin approves your stall, you can add deals and flash deals for it here.</p>
      <RouterLink to="/me/merchant-access" class="lb-btn lb-btn--primary merchant-dashboard__state-action">Request access to your stall</RouterLink>
    </div>

    <template v-else>
      <section class="merchant-stats" aria-label="At a glance">
        <div class="merchant-stat" data-testid="stat-live">
          <span class="merchant-stat__label">Live now</span>
          <span class="merchant-stat__value">{{ liveDeals.length }}</span>
          <span class="merchant-stat__note">{{ liveDeals.length === 1 ? 'deal' : 'deals' }} on the map</span>
        </div>
        <div class="merchant-stat" data-testid="stat-coming-up">
          <span class="merchant-stat__label">Coming up</span>
          <span class="merchant-stat__value">{{ scheduledDeals.length }}</span>
          <span class="merchant-stat__note">{{ comingUpText }}</span>
        </div>
        <div class="merchant-stat" :class="{ 'merchant-stat--flash': featuredFlash }" data-testid="stat-flash">
          <template v-if="featuredFlash">
            <span class="merchant-stat__label">
              <span class="merchant-stat__dot" aria-hidden="true" />Flash deal {{ featuredFlash.status === 'LIVE' ? 'live' : 'scheduled' }}
            </span>
            <span class="merchant-stat__headline">{{ featuredFlash.dealTitle }} · {{ flashOfferText(featuredFlash) || 'Flash deal' }}</span>
            <span class="merchant-stat__note merchant-stat__note--icon"><ShellIcon name="clock" :size="15" />{{ featuredWhen }}</span>
          </template>
          <template v-else>
            <span class="merchant-stat__label">Flash deal</span>
            <span class="merchant-stat__headline">None running</span>
            <button type="button" class="merchant-stat__link" @click="newFlashDeal">Start a flash deal</button>
          </template>
        </div>
        <div class="merchant-stat" data-testid="stat-codes">
          <span class="merchant-stat__label">Codes claimed</span>
          <template v-if="codes.limit > 0">
            <span class="merchant-stat__value">{{ codes.claimed }}<span class="merchant-stat__of"> / {{ codes.limit }}</span></span>
            <div
              class="merchant-stat__track"
              role="progressbar"
              aria-label="Codes claimed from running flash deals"
              :aria-valuenow="codes.claimed"
              aria-valuemin="0"
              :aria-valuemax="codes.limit"
            >
              <div class="merchant-stat__bar" :style="{ width: `${codesPercent}%` }"></div>
            </div>
          </template>
          <template v-else>
            <span class="merchant-stat__value">0</span>
            <span class="merchant-stat__note">from live or scheduled flash deals</span>
          </template>
        </div>
      </section>

      <div class="lb-tabs merchant-dashboard__tabs" role="tablist" aria-label="Your deals">
        <button
          v-for="(item, index) in tabs"
          :id="`merchant-tab-${item.id}`"
          :key="item.id"
          :ref="(el) => { if (el) tabEls[index] = el as HTMLElement }"
          type="button"
          role="tab"
          class="lb-tab merchant-dashboard__tab"
          :aria-selected="tab === item.id ? 'true' : 'false'"
          :aria-controls="`merchant-panel-${item.id}`"
          :tabindex="tab === item.id ? 0 : -1"
          :data-testid="`tab-${item.id}`"
          @click="openTab(item.id)"
          @keydown.right.prevent="moveTab(index, 1)"
          @keydown.left.prevent="moveTab(index, -1)"
        >
          {{ item.label }}<span class="merchant-dashboard__tab-count">{{ item.count }}</span>
        </button>
      </div>

      <div
        v-if="tab === 'deals'"
        id="merchant-panel-deals"
        class="merchant-dashboard__panel"
        role="tabpanel"
        aria-labelledby="merchant-tab-deals"
      >
        <fieldset class="merchant-dashboard__chips">
          <legend class="visually-hidden">Show</legend>
          <button
            v-for="item in filters"
            :key="item.id"
            type="button"
            class="lb-chip"
            :aria-pressed="filter === item.id ? 'true' : 'false'"
            :data-testid="`filter-${item.id}`"
            @click="filter = item.id"
          >
            {{ item.label }}<span class="lb-chip__count">{{ item.count }}</span>
          </button>
        </fieldset>
        <div v-if="shownDeals.length === 0" class="lb-state merchant-dashboard__empty">
          <p class="lb-state__body">{{ emptyDeals }}</p>
          <button type="button" class="lb-btn lb-btn--primary merchant-dashboard__state-action" @click="newDeal">
            <ShellIcon name="plus" :size="18" />Add a deal
          </button>
        </div>
        <MerchantCardGrid v-else>
          <li v-for="deal in shownDeals" :key="deal.id">
            <MerchantDealCard
              :title="deal.title"
              :description="deal.description"
              :offer="offerText(deal)"
              :dates="datesText(deal)"
              :location="`At: ${outletNames(deal)}`"
              :terms="deal.terms"
              :category="deal.category"
              :photo-url="deal.photo?.url ?? null"
              :badge="statusOf(deal)"
              :tone="statusOf(deal) === 'Live' ? 'live' : 'scheduled'"
            >
              <template #actions>
                <button type="button" class="lb-btn merchant-btn--sm" @click="editDeal(deal)">
                  Edit<span class="visually-hidden"> {{ deal.title }}</span>
                </button>
                <button
                  v-if="statusOf(deal) === 'Scheduled'"
                  type="button"
                  class="lb-btn merchant-btn--sm merchant-btn--danger"
                  @click="confirmDeleteDeal(deal)"
                >
                  Delete<span class="visually-hidden">: {{ deal.title }}</span>
                </button>
                <button
                  v-else
                  type="button"
                  class="lb-btn merchant-btn--sm merchant-btn--danger"
                  @click="confirmEndDeal(deal)"
                >
                  End deal<span class="visually-hidden">: {{ deal.title }}</span>
                </button>
              </template>
            </MerchantDealCard>
          </li>
        </MerchantCardGrid>
      </div>

      <div
        v-show="tab === 'flash'"
        id="merchant-panel-flash"
        class="merchant-dashboard__panel"
        role="tabpanel"
        aria-labelledby="merchant-tab-flash"
      >
        <FlashDropsSection :store="flash" @edit="editFlashDraft" />
      </div>

      <div
        v-if="tab === 'ended'"
        id="merchant-panel-ended"
        class="merchant-dashboard__panel"
        role="tabpanel"
        aria-labelledby="merchant-tab-ended"
      >
        <div v-if="endedDeals.length === 0" class="lb-state merchant-dashboard__empty">
          <p class="lb-state__body">No ended deals. Deals you end, or that pass their last day, show up here.</p>
        </div>
        <MerchantCardGrid v-else>
          <li v-for="deal in endedDeals" :key="deal.id">
            <MerchantDealCard
              :title="deal.title"
              :description="deal.description"
              :offer="offerText(deal)"
              :dates="datesText(deal)"
              :location="`At: ${outletNames(deal)}`"
              :terms="deal.terms"
              :category="deal.category"
              :photo-url="deal.photo?.url ?? null"
              badge="Ended"
              tone="ended"
            >
              <template #actions>
                <button type="button" class="lb-btn merchant-btn--sm" @click="runAgain(deal)">
                  Run it again<span class="visually-hidden">: {{ deal.title }}</span>
                </button>
                <button
                  type="button"
                  class="lb-btn merchant-btn--sm merchant-btn--danger"
                  @click="confirmDeleteDeal(deal)"
                >
                  Delete<span class="visually-hidden">: {{ deal.title }}</span>
                </button>
              </template>
            </MerchantDealCard>
          </li>
        </MerchantCardGrid>
      </div>
    </template>
  </section>
</template>

<style scoped>
.merchant-dashboard {
  display: grid;
  gap: 24px;
}

.merchant-dashboard__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 20px;
}

.merchant-dashboard__intro {
  min-width: 0;
}

.merchant-dashboard__outlets {
  margin: 8px 0 0;
  color: var(--ink-muted);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.merchant-dashboard__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.merchant-dashboard__flash-icon {
  color: var(--coral);
}

.merchant-dashboard__notice:empty {
  display: none;
}

.merchant-dashboard__state-action {
  align-self: flex-start;
}

.merchant-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.merchant-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--hairline);
  border-radius: 24px;
  background: var(--paper-white);
}

.merchant-stat--flash {
  border-color: var(--sunny-deep);
  background: var(--sunny-wash, var(--sunny-soft));
}

.merchant-stat__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.merchant-stat__value {
  font-size: 2.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.merchant-stat__of {
  color: var(--ink-muted);
  font-size: 1.25rem;
  font-weight: 700;
}

.merchant-stat__headline {
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.merchant-stat__note {
  color: var(--ink-muted);
  font-size: var(--text-sm);
}

.merchant-stat__note--icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.merchant-stat__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coral);
}

.merchant-stat__link {
  align-self: flex-start;
  min-height: var(--hit);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--coral-deep);
  font: 700 var(--text-sm) / 1.2 var(--font-sans);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.merchant-stat__link:focus-visible {
  outline: 3px solid var(--focus-ring, var(--sunny-ring));
  outline-offset: 2px;
  border-radius: 4px;
}

.merchant-stat__track {
  height: 8px;
  margin-top: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--paper-sunk);
}

.merchant-stat__bar {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--coral);
}

@media (max-width: 991.98px) {
  .merchant-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.merchant-dashboard__tabs {
  gap: 24px;
}

.merchant-dashboard__tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
}

.merchant-dashboard__tab-count {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--paper-sunk);
  color: var(--ink-muted);
  font-size: 0.75rem;
  text-align: center;
}

.merchant-dashboard__tab[aria-selected='true'] .merchant-dashboard__tab-count {
  background: var(--sunny);
  color: var(--on-accent);
}

.merchant-dashboard__panel {
  display: grid;
  gap: 18px;
}

.merchant-dashboard__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.merchant-dashboard__empty {
  align-items: flex-start;
}

@media (max-width: 575.98px) {
  .merchant-dashboard {
    gap: 20px;
  }

  .merchant-dashboard__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    gap: 8px;
  }

  .merchant-dashboard__actions .lb-btn--primary {
    order: -1;
  }

  .merchant-stats {
    gap: 10px;
  }

  .merchant-stat {
    gap: 4px;
    padding: 14px 16px;
    border-radius: 20px;
  }

  .merchant-stat[data-testid='stat-flash'],
  .merchant-stat[data-testid='stat-codes'] {
    grid-column: 1 / -1;
  }

  .merchant-stat__value {
    font-size: 1.75rem;
  }

  .merchant-stat__headline {
    font-size: 1.0625rem;
  }

  .merchant-stat__note {
    font-size: var(--text-xs);
  }

  .merchant-dashboard__tabs {
    gap: 4px;
  }

  .merchant-dashboard__tab {
    flex: 1 1 0;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .merchant-dashboard__tab-count {
    min-width: 20px;
    padding: 1px 5px;
  }
}
</style>
