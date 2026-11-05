<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import AccountMoreList from '@web/modules/account/AccountMoreList.vue'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import MySubmissionsPage from '@web/pages/MySubmissionsPage.vue'
import ProfilePage from '@web/pages/ProfilePage.vue'
import { type Component, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type ProfileTab = 'more' | 'submitted' | 'settings'
type Tab = { value: ProfileTab; label: string; component: Component }

const SUBMITTED_TAB: Tab = { value: 'submitted', label: 'Submitted', component: MySubmissionsPage }
const SETTINGS_TAB: Tab = { value: 'settings', label: 'Settings', component: ProfilePage }
const MORE_TAB: Tab = { value: 'more', label: 'More', component: AccountMoreList }
const DESKTOP_TABS: readonly Tab[] = [SUBMITTED_TAB, SETTINGS_TAB]
const BOTTOM_NAV_TABS: readonly Tab[] = [MORE_TAB, SUBMITTED_TAB, SETTINGS_TAB]

const route = useRoute()
const router = useRouter()
const session = authClient.useSession()
const breakpoint = useBreakpoint()

const bottomNav = computed(() => breakpoint.value !== 'desktop')
const tabs = computed(() => (bottomNav.value ? BOTTOM_NAV_TABS : DESKTOP_TABS))
const tab = computed<ProfileTab>(() => {
  const requested = tabs.value.find((item) => item.value === route.query.tab)?.value
  if (requested) return requested
  return bottomNav.value ? 'more' : 'settings'
})
const active = computed(() => tabs.value.find((item) => item.value === tab.value) ?? tabs.value[0])
const title = computed(() => session.value.data?.user.name ?? 'Your account')

const pick = (next: ProfileTab) => router.replace({ query: { ...route.query, tab: next } })

const STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
const onTabKeydown = async (event: KeyboardEvent) => {
  const list = tabs.value
  const current = list.findIndex((item) => item.value === tab.value)
  const step = STEP[event.key]
  const index =
    event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : step ? (current + step + list.length) % list.length : -1
  const next = list[index]
  if (!next) return
  event.preventDefault()
  await pick(next.value)
  await nextTick()
  document.getElementById(`profile-tab-${next.value}`)?.focus()
}
</script>

<template>
  <PanelFrame :title="title" :scroll-key="tab">
    <div class="lb-tabs" role="tablist" aria-label="Account sections" @keydown="onTabKeydown">
      <button
        v-for="item in tabs"
        :id="`profile-tab-${item.value}`"
        :key="item.value"
        type="button"
        role="tab"
        class="lb-tab"
        :aria-selected="tab === item.value"
        :tabindex="tab === item.value ? 0 : -1"
        aria-controls="profile-tabpanel"
        @click="pick(item.value)"
      >
        {{ item.label }}
      </button>
    </div>
    <div id="profile-tabpanel" class="profile-panel__body" role="tabpanel" :aria-labelledby="`profile-tab-${tab}`">
      <component :is="active?.component" :key="tab" />
    </div>
  </PanelFrame>
</template>

<style scoped>
.profile-panel__body :deep(.container) {
  max-width: none;
  /* biome-ignore lint/complexity/noImportantStyles: beats Bootstrap's py-4 utility, itself !important */
  padding: 0 !important;
}

.profile-panel__body :deep(section > h1) {
  display: none;
}

.profile-panel__body :deep(.card) {
  border-color: var(--hairline);
  border-radius: 18px;
}

.profile-panel__body :deep(.row > [class*='col-sm']) {
  width: 100%;
}

.profile-panel__body :deep(.my-submissions) {
  max-width: none;
  padding: 0;
}

.profile-panel__body :deep(.my-submissions__intro) {
  display: none;
}

.profile-panel__body :deep(.my-submissions__hero) {
  margin-bottom: 16px;
}

.profile-panel__body :deep(.submission-card) {
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
}

.profile-panel__body :deep(.submission-card__title) {
  font-size: 1rem;
}

.profile-panel__body :deep(.submission-card__meta),
.profile-panel__body :deep(.submission-card__line) {
  font-size: 0.8125rem;
}

.profile-panel__body :deep(.submission-card__line svg) {
  margin-top: 1px;
}
</style>
