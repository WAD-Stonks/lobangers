<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import BookmarkButton from '@web/components/BookmarkButton.vue'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { cuisines, money, regions, samples } from '@web/modules/landing/deals'
import type { LandingDealsStatus } from '@web/modules/landing/use-landing-deals'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const cuisine = ref('All Cuisines')
const area = ref('all')
const budget = ref('all')
defineProps<{ live: DealPin[]; liveState: LandingDealsStatus }>()
const saved = ref<Set<string>>(new Set())
const bookmarksReady = ref(false)
const session = authClient.useSession()
let alive = true
const filtered = computed(() =>
  samples.filter(
    (deal) =>
      (cuisine.value === 'All Cuisines' || deal.cuisine === cuisine.value) &&
      (area.value === 'all' || deal.region === Number(area.value)) &&
      (budget.value === 'all' || deal.price <= Number(budget.value)),
  ),
)
const updateSaved = (id: string, value: boolean) => {
  const next = new Set(saved.value)
  if (value) next.add(id)
  else next.delete(id)
  saved.value = next
}
watch(
  () => session.value.data?.user.id,
  async (userId) => {
    saved.value = new Set()
    bookmarksReady.value = false
    if (!userId) return
    try {
      const ids = new Set<string>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      do {
        const result = await api.account.bookmarks({ limit: 50, ...(cursor ? { cursor } : {}) })
        if (!alive || session.value.data?.user.id !== userId) return
        for (const bookmark of result.items) ids.add(bookmark.dealId)
        cursor = result.nextCursor ?? undefined
        if (cursor && cursors.has(cursor)) return
        if (cursor) cursors.add(cursor)
      } while (cursor)
      saved.value = ids
      bookmarksReady.value = true
    } catch {
      // Offer the existing Saved Deals page if initial bookmark state cannot be read.
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  alive = false
})
</script>

<template>
  <section id="cuisines" class="cuisine-discovery" aria-labelledby="cuisine-heading">
    <header class="cuisine-intro" data-reveal>
      <span class="landing-eyebrow">✳ FOLLOW YOUR APPETITE</span>
      <h2 id="cuisine-heading">Craving something?<br />We've got the <span>lobang.</span>
      </h2>
      <p>From local hawker favourites to international cuisines, discover delicious deals that match your cravings.</p>
    </header>
    <p class="sample-disclosure"><strong>Explore a sample of Lobangers.</strong> These are illustrative offers and food photographs, not current promotions. Cuisine filters preview sample content; live deals currently use food categories.</p>
    <fieldset class="cuisine-filters" data-reveal>
      <legend class="visually-hidden">Filter sample deals by cuisine</legend>
      <button v-for="item in cuisines" :key="item" type="button" :class="{ selected: cuisine === item }" :aria-pressed="cuisine === item" @click="cuisine = item">{{ item }}</button>
    </fieldset>
    <div class="deal-grid-toolbar">
      <p role="status">
        <strong>{{ filtered.length }}</strong> illustrative {{ filtered.length === 1 ? 'deal' : 'deals' }} <span>· A taste of what's possible</span>
      </p>
      <div>
        <label for="sample-area" class="visually-hidden">Filter samples by neighbourhood</label>
        <select id="sample-area" v-model="area">
          <option value="all">All neighbourhoods</option>
          <option v-for="(item, index) in regions" :key="item.name" :value="String(index)">{{ item.area }}</option>
        </select>
        <label for="sample-budget" class="visually-hidden">Maximum sample price</label>
        <select id="sample-budget" v-model="budget">
          <option value="all">Any price</option>
          <option value="5">S$5 & under</option>
          <option value="3">S$3 & under</option>
        </select>
      </div>
    </div>
    <TransitionGroup name="cuisine-grid" tag="div" class="landing-deal-grid">
      <article v-for="deal in filtered" :key="deal.id" class="landing-food-card">
        <div class="landing-food-photo">
          <img :src="deal.image" :alt="`${deal.icon} Illustrative food photograph for ${deal.restaurant}`" loading="lazy" width="640" height="480" />
          <span class="food-offer">{{ deal.badge }}</span>
          <span class="food-sample">SAMPLE</span>
        </div>
        <div class="landing-food-content">
          <small>{{ deal.cuisine }} <span>· {{ regions[deal.region]?.area }}</span>
          </small>
          <h3>{{ deal.restaurant }}</h3>
          <p>{{ deal.title }}</p>
          <div>
            <b>{{ money(deal.price) }}</b>
            <del>{{ money(deal.original) }}</del>
            <RouterLink to="/browse" :aria-label="`Explore live deals after viewing the ${deal.restaurant} sample`">Explore live deals <span aria-hidden="true">↗</span></RouterLink>
          </div>
        </div>
      </article>
    </TransitionGroup>
    <div v-if="!filtered.length" class="cuisine-empty" role="status">
      <span aria-hidden="true">🍽️</span>
      <h3>No sample deals for this craving yet.</h3>
      <p>Try another cuisine or explore the live food map.</p>
      <button type="button" class="landing-button secondary" @click="cuisine = 'All Cuisines'; area = 'all'; budget = 'all'">Reset sample filters</button>
    </div>
    <div class="live-deal-preview">
      <div class="live-deal-heading">
        <div>
          <span class="landing-eyebrow">FROM THE LIVE FOOD MAP</span>
          <h3>Ready for a real lobang?</h3>
        </div>
        <RouterLink class="landing-button secondary" to="/browse">Explore live deals ↗</RouterLink>
      </div>
      <p v-if="liveState === 'loading'" role="status">Loading current food deals…</p>
      <p v-else-if="liveState === 'error'" role="status">Live deals couldn't load right now. You can retry in the deal map.</p>
      <p v-else-if="!live.length">No current food deals to show here yet. Check the deal map for new promotions.</p>
      <div v-else class="live-deal-list">
        <article v-for="item in live.slice(0, 4)" :key="item.id">
          <small>{{ item.category }}</small>
          <h4>{{ item.title }}</h4>
          <p>{{ item.label }}</p>
          <RouterLink v-if="item.venues[0]" :to="`/venues/${item.venues[0].id}`">{{ item.venues[0].name }} ↗</RouterLink>
          <BookmarkButton v-if="session.data && bookmarksReady" :deal-id="item.id" :saved="saved.has(item.id)" @change="updateSaved(item.id, $event)" />
          <RouterLink v-else-if="session.data" to="/saved">Manage saved deals</RouterLink>
          <RouterLink v-else to="/login">Log in to save</RouterLink>
        </article>
      </div>
    </div>
  </section>
</template>
