<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import AccountMoreList from '@web/modules/account/AccountMoreList.vue'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import MySubmissionsPage from '@web/pages/MySubmissionsPage.vue'
import ProfilePage from '@web/pages/ProfilePage.vue'
import SavedDealsPage from '@web/pages/SavedDealsPage.vue'
import { type Component, computed, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'


// The visitor's account over the map, in tabs. /saved opens on Saved; /me/profile on Settings.
// The tab lives in ?tab= so each tab has its own link and scrolls from the top. With a bottom nav
// (below desktop) Saved has its own tab there, so /saved shows only the saved deals and the
// account opens on More: the site menu's rows, since that layout has no menu button.
type ProfileTab = 'more' | 'saved' | 'submitted' | 'settings'
type Tab = { value: ProfileTab; label: string; component: Component }

const SAVED_TAB: Tab = { value: 'saved', label: 'Saved', component: SavedDealsPage }
const SUBMITTED_TAB: Tab = { value: 'submitted', label: 'Submitted', component: MySubmissionsPage }
const SETTINGS_TAB: Tab = { value: 'settings', label: 'Settings', component: ProfilePage }
const MORE_TAB: Tab = { value: 'more', label: 'More', component: AccountMoreList }
const DESKTOP_TABS: readonly Tab[] = [SAVED_TAB, SUBMITTED_TAB, SETTINGS_TAB]
const BOTTOM_NAV_TABS: readonly Tab[] = [MORE_TAB, SUBMITTED_TAB, SETTINGS_TAB]

const route = useRoute()
const router = useRouter()
const session = authClient.useSession()
const saved = useSavedDeals()
const breakpoint = useBreakpoint()

const bottomNav = computed(() => breakpoint.value !== 'desktop')
const savedOnly = computed(() => bottomNav.value && route.name === 'saved')
const tabs = computed(() => (savedOnly.value ? [SAVED_TAB] : bottomNav.value ? BOTTOM_NAV_TABS : DESKTOP_TABS))
const tab = computed<ProfileTab>(() => {
  const requested = tabs.value.find((item) => item.value === route.query.tab)?.value
  if (requested) return requested
  if (route.name === 'saved') return 'saved'
  return bottomNav.value ? 'more' : 'settings'
})
const active = computed(() => tabs.value.find((item) => item.value === tab.value) ?? tabs.value[0])
const title = computed(() => (savedOnly.value ? 'Saved deals' : (session.value.data?.user.name ?? 'Your account')))

const pick = (next: ProfileTab) => router.replace({ query: { ...route.query, tab: next } })

// Arrow keys, Home and End move between tabs (roving tabindex), selecting as they go.
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

// The Saved tab can remove bookmarks; refresh the menu's count on the way out.
onBeforeUnmount(() => void saved.reload())
</script>

<template>
  <PanelFrame :title="title" :scroll-key="tab">
    <div v-if="!savedOnly" class="lb-tabs" role="tablist" aria-label="Account sections" @keydown="onTabKeydown">
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
    <div id="profile-tabpanel" class="profile-panel__body" :role="savedOnly ? undefined : 'tabpanel'" :aria-labelledby="savedOnly ? undefined : `profile-tab-${tab}`">
      <component :is="active?.component" :key="tab" />
    </div>
  </PanelFrame>
</template>

<style scoped>
/* The embedded pages were built as full pages; inside the panel the tab names them. */
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
</style>
