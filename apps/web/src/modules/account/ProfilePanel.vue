<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import MySubmissionsPage from '@web/pages/MySubmissionsPage.vue'
import ProfilePage from '@web/pages/ProfilePage.vue'
import SavedDealsPage from '@web/pages/SavedDealsPage.vue'
import { type Component, computed, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// The visitor's account over the map, in three tabs. /saved opens on Saved; /me/profile on
// Settings. The tab lives in ?tab= so each tab has its own link and scrolls from the top.
type ProfileTab = 'saved' | 'submitted' | 'settings'

const TABS: readonly { value: ProfileTab; label: string; component: Component }[] = [
  { value: 'saved', label: 'Saved', component: SavedDealsPage },
  { value: 'submitted', label: 'Submitted', component: MySubmissionsPage },
  { value: 'settings', label: 'Settings', component: ProfilePage },
]

const route = useRoute()
const router = useRouter()
const session = authClient.useSession()
const saved = useSavedDeals()

const tab = computed<ProfileTab>(() => {
  const requested = TABS.find((item) => item.value === route.query.tab)?.value
  return requested ?? (route.name === 'saved' ? 'saved' : 'settings')
})
const active = computed(() => TABS.find((item) => item.value === tab.value) ?? TABS[0])
const title = computed(() => session.value.data?.user.name ?? 'Your account')

const pick = (next: ProfileTab) => router.replace({ query: { ...route.query, tab: next } })

// The Saved tab can remove bookmarks; refresh the menu's count on the way out.
onBeforeUnmount(() => void saved.reload())
</script>

<template>
  <PanelFrame :title="title" :back="{ name: 'browse' }" back-label="Back to the map" :scroll-key="tab">
    <div class="lb-tabs" role="tablist" aria-label="Account sections">
      <button
        v-for="item in TABS"
        :id="`profile-tab-${item.value}`"
        :key="item.value"
        type="button"
        role="tab"
        class="lb-tab"
        :aria-selected="tab === item.value"
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
