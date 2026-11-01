<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import BrandMenu from '@web/modules/map-shell/BrandMenu.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { shellQuery } from '@web/modules/map-shell/shell-routes'
import { useShellNavigation } from '@web/modules/map-shell/use-shell-navigation'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { isNavigationFailure, NavigationFailureType, RouterLink, useRoute } from 'vue-router'

const session = authClient.useSession()
const initial = computed(() => Array.from(session.value.data?.user.name?.trim() ?? '')[0]?.toUpperCase() || '?')
const navigationTo = useShellNavigation()

const props = defineProps<{ panelOpen: boolean; bottom?: boolean }>()
const emit = defineEmits<{ menuChange: [open: boolean]; openPanel: [] }>()
const route = useRoute()
const drawerOpen = ref(false)
const onMenuChange = (open: boolean) => { drawerOpen.value = open; emit('menuChange', open) }
const isActive = (names: string[]) => props.panelOpen && (
  route.name === 'auth-required' ? names.includes(String(route.query.tab)) :
  route.query.collection === 'saved' && ['deal', 'venue'].includes(String(route.name))
    ? names.includes('saved')
    : route.name === 'browse' && route.query.view === 'list'
      ? names.includes('home') : names.includes(String(route.name))
)
const openPanel = async (event: MouseEvent, navigate: (event?: MouseEvent) => Promise<unknown>) => {
  const normalClick = event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
  const failure = await navigate(event)
  if (!normalClick || (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated))) return
  // Reopen only after the new route has committed and its panel has rendered.
  await nextTick()
  emit('openPanel')
}
const mapTo = computed(() => ({ name: 'browse', query: { ...shellQuery(route.query), view: 'map', split: '1', results: 'list', collection: undefined } }))
const savedTo = computed(() => ({ name: 'saved', query: { ...shellQuery(route.query), view: 'map', split: '1', collection: undefined } }))
onBeforeUnmount(() => emit('menuChange', false))
</script>

<template>
  <aside class="map-navigation" :class="{ 'map-navigation--bottom': bottom }" aria-label="Map navigation" data-testid="map-navigation">
    <BrandMenu v-if="!bottom" rail map-tools @menu-change="onMenuChange" />
    <nav class="map-navigation__links" aria-label="Explore" :inert="drawerOpen ? true : undefined">
      <RouterLink v-if="bottom" v-slot="{ href, navigate }" :to="navigationTo('/deals')" custom><a :href="href" data-testid="nav-home" :aria-current="isActive(['home']) ? 'page' : undefined" @click="openPanel($event, navigate)"><ShellIcon name="ticket" :size="23" /><span>All deals</span></a></RouterLink>
      <RouterLink v-slot="{ href, navigate }" :to="mapTo" custom><a :href="href" :aria-current="isActive(['browse', 'deal', 'venue']) ? 'page' : undefined" @click="openPanel($event, navigate)"><ShellIcon :name="bottom ? 'map' : 'ticket'" :size="23" /><span>{{ bottom ? 'Map' : 'Deals' }}</span></a></RouterLink>
      <RouterLink v-slot="{ href, navigate }" :to="savedTo" custom><a :href="href" :aria-current="isActive(['saved']) ? 'page' : undefined" @click="openPanel($event, navigate)"><ShellIcon name="bookmark" :size="23" /><span>Saved</span></a></RouterLink>
      <RouterLink v-slot="{ href, navigate }" :to="navigationTo('/add')" custom><a :href="href" data-testid="map-share" :aria-current="isActive(['submit-deal']) ? 'page' : undefined" @click="openPanel($event, navigate)"><ShellIcon name="plus" :size="23" /><span>Share</span></a></RouterLink>
    </nav>
    <RouterLink v-slot="{ href, navigate }" :to="navigationTo('/me/profile')" custom><a :href="href" class="map-navigation__account" :inert="drawerOpen ? true : undefined" :aria-current="isActive(['profile']) ? 'page' : undefined" @click="openPanel($event, navigate)"><span v-if="session.data" class="map-navigation__avatar" aria-hidden="true">{{ initial }}</span><ShellIcon v-else name="user" :size="23" /><span>Account</span></a></RouterLink>
  </aside>
</template>

<style scoped>
.map-navigation {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: var(--map-rail-w);
  padding: 12px 6px;
  background: var(--paper-white);
  border-right: 1px solid var(--hairline);
}

.map-navigation__links {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.map-navigation a {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 60px;
  padding: 6px 2px;
  color: var(--ink-muted);
  text-decoration: none;
  font-size: 0.7rem;
  font-weight: 650;
  border-radius: 14px;
}

.map-navigation a:hover,
.map-navigation a:focus-visible {
  background: var(--paper-sunk);
}

.map-navigation a[aria-current='page'] {
  color: var(--coral-deep);
  background: var(--paper-sunk);
}

.map-navigation__avatar { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--hairline); border-radius: 50%; background: var(--sunny-wash, #fff7dc); color: var(--ink); font-size: .8125rem; font-weight: 700; }

.map-navigation__account {
  width: 100%;
  margin-top: auto;
}
.map-navigation--bottom {
  position: fixed;
  inset: auto 0 0;
  width: 100%;
  height: calc(68px + env(safe-area-inset-bottom, 0px));
  padding: 4px 8px calc(4px + env(safe-area-inset-bottom, 0px));
  flex-direction: row;
  align-items: stretch;
  gap: 4px;
  border-right: 0;
  border-top: 1px solid var(--hairline);
  box-shadow: 0 -2px 12px rgb(0 0 0 / 0.04);
}

.map-navigation--bottom .map-navigation__links {
  flex: 4;
  flex-direction: row;
  gap: 4px;
  width: auto;
}

.map-navigation--bottom .map-navigation__links a,
.map-navigation--bottom .map-navigation__account {
  flex: 1;
  min-width: 0;
  min-height: 56px;
  padding: 4px 2px;
}

.map-navigation--bottom .map-navigation__account {
  width: auto;
  margin-top: 0;
}
</style>
