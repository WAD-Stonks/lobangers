<script setup lang="ts">
import type { FlashCode } from '@broke-oclock/contracts/flash-drops'
import TicketLoading from '@web/components/TicketLoading.vue'
import { authClient } from '@web/lib/auth-client'
import { countdown, formatCents } from '@web/modules/flash-drop/flash-format'
import { useFlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { dealLocation } from '@web/modules/map-shell/shell-routes'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// Every Flash Drop code the visitor has claimed: the ones still good first, ready to show at
// the counter, then the ones whose drop has ended.
const flash = useFlashDrops()
const session = authClient.useSession()
const route = useRoute()

const signedIn = computed(() => !!session.value.data)
const now = computed(() => flash?.now.value ?? Date.now())
const isActive = (code: FlashCode) => code.active && new Date(code.endsAt).getTime() > now.value
const active = computed(() => (flash?.codes.value ?? []).filter(isActive))
const past = computed(() => (flash?.codes.value ?? []).filter((code) => !isActive(code)))
const loginTo = computed(() => ({ name: 'login', query: { redirect: route.fullPath } }))

// Until the first load answers, say so instead of flashing the empty state. A failed load says
// so too, with a retry, rather than showing "No codes yet".
const loading = ref(false)
const loadFailed = ref(false)
const load = async () => {
  if (!signedIn.value || !flash || loading.value) return
  loading.value = true
  loadFailed.value = false
  try {
    loadFailed.value = !(await flash.loadCodes())
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <PanelFrame title="My codes" :back="{ name: 'browse' }" back-label="Back to the map">
    <div class="my-codes">
      <template v-if="!signedIn">
        <p class="lb-text-wrap">Log in to see the Flash Drop codes you've claimed.</p>
        <RouterLink class="lb-btn lb-btn--primary" :to="loginTo">Log in</RouterLink>
      </template>
      <template v-else>
        <TicketLoading v-if="loading && !active.length && !past.length" class="my-codes__empty" label="Loading your codes…" />
        <div v-else-if="loadFailed && !active.length && !past.length" class="my-codes__error" role="alert" data-testid="my-codes-error">
          <p class="my-codes__empty lb-text-wrap">We couldn't load your codes. Check your connection and try again.</p>
          <button type="button" class="lb-btn" @click="load">Try again</button>
        </div>
        <p v-else-if="!active.length && !past.length" class="my-codes__empty lb-text-wrap">
          No codes yet. When a Flash Drop pops up on the map, open it and claim a code. It will wait for you here.
        </p>
        <section v-if="active.length" aria-labelledby="codes-ready">
          <h2 id="codes-ready" class="my-codes__heading">Ready to use</h2>
          <ul class="my-codes__list">
            <li v-for="code in active" :key="code.dropId" class="my-codes__card" data-testid="my-code">
              <div class="my-codes__top">
                <span class="my-codes__value" translate="no">{{ code.code }}</span>
                <span class="my-codes__timer"><span class="visually-hidden">Ends in </span>{{ countdown(code.endsAt, now) }}</span>
              </div>
              <RouterLink class="my-codes__deal lb-text-wrap" :to="dealLocation(route.query, code.dealId)">
                {{ formatCents(code.flashPriceCents) }} {{ code.dealTitle }}
              </RouterLink>
              <span class="lb-meta">
                {{ code.venueName }}<span v-if="code.demo" class="flash-fake my-codes__fake">Fake deal</span>
              </span>
            </li>
          </ul>
        </section>
        <section v-if="past.length" aria-labelledby="codes-past">
          <h2 id="codes-past" class="my-codes__heading">Ended</h2>
          <ul class="my-codes__list">
            <li v-for="code in past" :key="code.dropId" class="my-codes__card my-codes__card--past">
              <span class="my-codes__value" translate="no"><s>{{ code.code }}</s></span>
              <span class="lb-text-wrap">{{ formatCents(code.flashPriceCents) }} {{ code.dealTitle }}</span>
              <span class="lb-meta">
                {{ code.venueName }}<span v-if="code.demo" class="flash-fake my-codes__fake">Fake deal</span>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </PanelFrame>
</template>

<style scoped>
.my-codes {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.my-codes__empty {
  margin: 0;
  color: var(--ink-muted);
}

.my-codes__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.my-codes__heading {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.my-codes__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-codes__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 14px 16px;
  background: var(--paper-white);
  border: 2px dashed var(--coral);
  border-radius: 16px;
}

.my-codes__card--past {
  border: 1px solid var(--hairline);
  opacity: 0.7;
}

.my-codes__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.my-codes__value {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  font-variant-numeric: tabular-nums;
}

.my-codes__timer {
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--on-ink);
  background: var(--coral);
  border-radius: 8px;
}

.my-codes__deal {
  font-weight: 700;
  color: var(--ink);
}

.my-codes__fake {
  margin-left: 6px;
}
</style>
