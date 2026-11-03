<script setup lang="ts">
import TicketLoading from '@web/components/TicketLoading.vue'
import '@web/modules/admin-flash-drops/admin-flash-drops.css'
import '@web/modules/admin-flash-drops/admin-flash-drop-detail.css'
import '@web/modules/admin-flash-drops/admin-flash-drops-responsive.css'
import type { FlashDropView } from '@broke-oclock/contracts/flash-drops'
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import { api } from '@web/lib/api-client'
import FlashDropDecision from '@web/modules/admin-flash-drops/FlashDropDecision.vue'
import FlashDropDetail from '@web/modules/admin-flash-drops/FlashDropDetail.vue'
import {
  FLASH_DROP_VIEWS,
  formatUpdated,
  listStatusLabel,
  statusTone,
  windowLine,
} from '@web/modules/admin-flash-drops/flash-drop-format'
import {
  type AdminFlashDropsClient,
  type DeniedCode,
  useAdminFlashDrops,
} from '@web/modules/admin-flash-drops/use-admin-flash-drops'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ client?: AdminFlashDropsClient; initialView?: FlashDropView }>()
const emit = defineEmits<{ denied: [code: DeniedCode]; viewChange: [view: FlashDropView] }>()
const state = useAdminFlashDrops(props.client ?? api.flashDrops.admin, (code) => emit('denied', code))
const { view, items, counts, status, updatedAt, selected, choices, activeDecision, noteRequired, note, confirmed, pending, problem, notice, canSubmit } = state
const tabRefs = ref<HTMLButtonElement[]>([])
const detailRef = ref<HTMLElement | null>(null)
const hasDemo = computed(() => items.value.some((drop) => drop.demo))
const countFor = (target: FlashDropView) => counts.value[target]
const metrics = computed(() => [
  { view: 'live' as const, label: 'Live now', icon: 'live', tone: 'live', count: counts.value.live, hint: `${counts.value.claimedToday} codes claimed today`, arrow: false },
  { view: 'scheduled' as const, label: 'Scheduled', icon: 'flash', tone: '', count: counts.value.scheduled, hint: 'Sent live, starting soon', arrow: true },
  { view: 'ended' as const, label: 'Ended or removed', icon: 'audit', tone: 'neutral', count: counts.value.ended, hint: 'Last 7 days', arrow: false },
])
const showView = (target: FlashDropView) => {
  if (pending.value) return
  void state.load(target)
}
const tabKeydown = (event: KeyboardEvent, index: number) => {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = (index + step + FLASH_DROP_VIEWS.length) % FLASH_DROP_VIEWS.length
  const target = FLASH_DROP_VIEWS[next]
  if (!target) return
  showView(target.view)
  tabRefs.value[next]?.focus()
}
const pick = async (id: string) => {
  state.select(id)
  await nextTick()
  if (typeof window.matchMedia !== 'function') return
  // Stacked layout only: bring the chosen drop's detail into view below the list.
  if (!window.matchMedia('(max-width: 1199.98px)').matches) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  detailRef.value?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
}
onMounted(() => state.load(props.initialView ?? 'live'))
// The page mirrors the open view into ?view= so it can be shared and survives a reload.
watch(view, (current) => emit('viewChange', current))
onUnmounted(state.dispose)
</script>

<template>
  <div class="fd-panel">
    <div class="fd-toolbar">
      <div>
        <p class="fd-description">Merchants send their own flash deals live. Watch them here and remove any that break the rules.</p>
        <p class="fd-updated"><template v-if="updatedAt">Last updated <time :datetime="updatedAt.toISOString()">{{ formatUpdated(updatedAt) }}</time> (SGT)</template><template v-else>Checking the latest flash deals…</template></p>
      </div>
      <button type="button" class="btn btn-outline-primary" data-testid="flash-refresh" :disabled="status === 'loading' || pending" @click="state.refresh()"><span aria-hidden="true" class="fd-refresh-symbol">↻</span>{{ status === 'loading' ? 'Refreshing…' : 'Refresh' }}</button>
    </div>
    <p v-if="hasDemo" class="fd-notice"><b>Fake deals.</b> Flash deals tagged “Fake deal” are demo data.</p>
    <p v-if="notice" class="fd-notice fd-success" role="status">{{ notice }}</p>
    <ul class="fd-metrics" aria-label="Flash deal summary">
      <li v-for="metric in metrics" :key="metric.view">
        <button type="button" class="fd-metric" :data-current="view === metric.view" :aria-controls="'flash-queue'" @click="showView(metric.view)">
          <span class="fd-metric-label"><span>{{ metric.label }}</span><span class="fd-metric-icon" :class="metric.tone && `fd-metric-icon--${metric.tone}`"><AdminIcon :name="metric.icon" /></span></span>
          <strong>{{ metric.count }}</strong>
          <span class="fd-metric-hint">{{ metric.hint }}<span v-if="metric.arrow" aria-hidden="true"> →</span></span>
        </button>
      </li>
    </ul>
    <section id="flash-queue" class="card fd-queue" aria-labelledby="flash-queue-title">
      <div class="fd-queue-head">
        <div><h2 id="flash-queue-title">Flash deals</h2><p class="fd-sub">Removing one takes it off the map at once and keeps its record. Times are in SGT.</p></div>
        <div class="fd-tabs" role="tablist" aria-label="Flash deal views">
          <button v-for="(tab, index) in FLASH_DROP_VIEWS" :id="`flash-tab-${tab.view}`" :key="tab.view" :ref="(element) => { if (element) tabRefs[index] = element as HTMLButtonElement }" type="button" role="tab" class="btn btn-outline-secondary" :aria-selected="view === tab.view" aria-controls="flash-tabpanel" :tabindex="view === tab.view ? 0 : -1" @click="showView(tab.view)" @keydown="tabKeydown($event, index)">{{ tab.label }} ({{ countFor(tab.view) }})</button>
        </div>
      </div>
      <div id="flash-tabpanel" role="tabpanel" :aria-labelledby="`flash-tab-${view}`" :aria-busy="status === 'loading'">
        <TicketLoading v-if="status === 'loading' && !items.length" class="fd-state" label="Loading flash deals…" />
        <div v-else-if="status === 'error'" class="fd-alert fd-state-alert" role="alert"><p>Unable to load flash deals. Nothing was changed.</p><button type="button" class="btn btn-outline-secondary" @click="state.refresh()">Try again</button></div>
        <p v-else-if="status === 'ready' && !items.length" class="fd-state" role="status">Nothing here right now.</p>
        <div v-else-if="items.length" class="fd-ops">
          <nav class="fd-records" aria-label="Flash deal records">
            <ul>
              <li v-for="drop in items" :key="drop.id">
                <button type="button" class="fd-record" data-testid="flash-drop-record" :aria-current="selected?.id === drop.id ? 'true' : undefined" @click="pick(drop.id)">
                  <span class="fd-record-top"><strong>{{ drop.dealTitle }}</strong><span class="fd-status" :data-tone="statusTone(drop.status)">{{ listStatusLabel(drop) }}</span></span>
                  <span class="fd-record-meta">{{ drop.merchantName }} · {{ windowLine(drop) }}</span>
                  <span v-if="drop.demo"><span class="fd-fake">Fake deal</span></span>
                </button>
              </li>
            </ul>
          </nav>
          <div ref="detailRef">
            <FlashDropDetail v-if="selected" :key="selected.id" :drop="selected">
              <FlashDropDecision v-if="activeDecision" v-model:note="note" v-model:confirmed="confirmed" :drop="selected" :choices="choices" :active="activeDecision" :note-required="noteRequired" :pending="pending" :can-submit="canSubmit" :problem="problem" @choose="state.choose" @submit="state.submit" @refresh="state.refresh" />
            </FlashDropDetail>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
