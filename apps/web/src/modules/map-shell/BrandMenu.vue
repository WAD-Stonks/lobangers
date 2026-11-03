<script setup lang="ts">
import logoUrl from '@web/assets/lobangers-logo.svg'
import { SITE_MENU_ID } from '@web/components/site-nav-links'
import ThemeToggle from '@web/components/ThemeToggle.vue'
import { TICKET_ICON_PATHS } from '@web/components/ticket-icon'
import { useSiteMenu } from '@web/components/use-site-menu'
import { useMapPreferences } from '@web/modules/map-shell/map-preferences'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { MENU_LINK_ICONS as linkIcons, useMenuLinks } from '@web/modules/map-shell/use-menu-links'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { useShellNavigation } from '@web/modules/map-shell/use-shell-navigation'
import { useOpenRoomCode } from '@web/modules/squad/open-room-code'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const navigationTo = useShellNavigation()

// Menu button that opens the site menu as a drawer from the left edge, the same on every page
// (it replaces the floating "Log in"). Escape, the scrim, the close button and any navigation
// close it, and focus returns to the button.
defineProps<{ rail?: boolean; mapTools?: boolean; compact?: boolean }>()
const emit = defineEmits<{ menuChange: [open: boolean] }>()
const mapPreferences = useMapPreferences()
const breakpoint = useBreakpoint()
const saved = useSavedDeals()
// The Squad row starts a room, or leads back to the one the visitor is in.
const openRoomCode = useOpenRoomCode()
const squadTo = computed(() =>
  openRoomCode.value ? { name: 'squad-room', params: { code: openRoomCode.value } } : { name: 'squad-new' },
)
const { user, activeCodeCount, codesText, menuGroups, logOut: signOut } = useMenuLinks()
const route = useRoute()
const router = useRouter()

const root = ref<HTMLElement | null>(null)
const toggleButton = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const { isOpen, close, toggle } = useSiteMenu({ root, toggle: toggleButton, panel })
watch(isOpen, (open) => emit('menuChange', open))
const closeDrawer = () => { close(); toggleButton.value?.focus() }
const startTutorial = () => { closeDrawer(); mapPreferences?.startTutorial() }
const trapDrawer = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return
  const items = [...(panel.value?.querySelectorAll<HTMLElement>('a[href], button') ?? [])]
    .filter((element) => !element.hasAttribute('disabled'))
  const first = items[0]
  const last = items.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

const initials = computed(() => Array.from(user.value?.name?.trim() ?? '')[0]?.toUpperCase() || '?')
const savedText = computed(() => `${saved.countLabel.value} saved ${saved.count.value === 1 ? 'deal' : 'deals'}`)
const menuLabel = computed(() => {
  const base = isOpen.value ? 'Close menu' : 'Open menu'
  const count = activeCodeCount.value
  return count > 0 ? `${base}, ${count} Flash Drop ${count === 1 ? 'code' : 'codes'} ready` : base
})
// Signing in from the menu brings the visitor back to where they were.
const authQuery = computed(() =>
  route.name === 'login' || route.name === 'register' ? route.query : { redirect: route.fullPath },
)

// Exact match including the query: RouterLink's own check ignores it, so "/" and
// "/?view=list" would both look current.
const isCurrent = (to: string) => router.resolve(navigationTo(to)).fullPath === route.fullPath

const logOut = () => { close(); return signOut() }
</script>

<template>
  <div ref="root" class="brand-menu" :class="{ 'brand-menu--rail': rail, 'brand-menu--compact': compact }">
    <div class="brand-menu__button lb-card">
      <RouterLink class="brand-menu__home" to="/" aria-label="Lobangers home" @click="closeDrawer">
        <span class="brand-menu__mark" aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <path v-for="d in TICKET_ICON_PATHS" :key="d" :d="d" />
          </svg>
        </span>
        <img :src="logoUrl" alt="" class="brand-menu__word" width="816" height="170" />
      </RouterLink>
      <button ref="toggleButton" type="button" class="brand-menu__toggle" data-testid="nav-toggle"
        :aria-controls="SITE_MENU_ID" :aria-expanded="isOpen" :aria-label="menuLabel" @click="toggle">
        <span class="brand-menu__burger" aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round">
            <path class="l1" d="M4 7h16" />
            <path class="l2" d="M4 12h16" />
            <path class="l3" d="M4 17h16" />
          </svg>
        </span>
      </button>
      <span v-if="user && saved.count.value > 0" class="brand-menu__count" aria-hidden="true">{{ saved.countLabel.value
        }}</span>
      <span v-if="activeCodeCount > 0" class="brand-menu__codes-dot" data-testid="codes-dot" aria-hidden="true" />
    </div>

    <Transition name="shell-fade">
      <div v-if="isOpen" class="brand-menu__scrim" aria-hidden="true" @click="closeDrawer" />
    </Transition>
    <Transition name="shell-menu">
      <nav v-if="isOpen" :id="SITE_MENU_ID" ref="panel" class="brand-menu__panel lb-card" aria-label="Site"
        role="dialog" aria-modal="true" data-testid="nav-menu"
        @keydown="trapDrawer">
        <div class="brand-menu__drawer-head">
          <RouterLink to="/" aria-label="Lobangers home" @click="closeDrawer"><img :src="logoUrl" alt="Lobangers"
              width="816" height="170" /></RouterLink>
          <button class="lb-ctrl lb-ctrl--flat" type="button" aria-label="Close navigation menu" @click="closeDrawer">
            <ShellIcon name="close" :size="20" />
          </button>
        </div>
        <RouterLink v-if="user" class="brand-menu__user" :to="navigationTo('/me/profile')" data-testid="signed-in-name"
          @click="closeDrawer">
          <span class="brand-menu__avatar" aria-hidden="true">{{ initials || '?' }}</span>
          <span class="brand-menu__user-text">
            <strong class="lb-text-wrap">{{ user.name }}</strong>
            <span class="lb-meta" data-testid="saved-count">{{ savedText }}</span>
          </span>
        </RouterLink>
        <div v-else class="brand-menu__auth">
          <RouterLink class="lb-btn lb-btn--primary" :to="{ name: 'login', query: authQuery }" @click="closeDrawer">Log
            in</RouterLink>
          <RouterLink class="lb-btn" :to="{ name: 'register', query: authQuery }" @click="closeDrawer">Sign up
          </RouterLink>
        </div>

        <div v-if="mapTools && mapPreferences && breakpoint === 'desktop'" class="brand-menu__map-tools">
          <button class="brand-menu__sidebar-toggle" type="button" role="switch"
            :aria-checked="mapPreferences.sidebarVisible.value" data-testid="show-sidebar"
            @click="mapPreferences.sidebarVisible.value = !mapPreferences.sidebarVisible.value">
            <ShellIcon name="sidebar" :size="22" /><span>Show sidebar</span><span class="brand-menu__switch"
              aria-hidden="true" />
          </button>
        </div>

        <div class="brand-menu__divider" role="presentation" />
        <!-- Makan Squad: start a room or join a friend's with its code. -->
        <RouterLink class="brand-menu__codes brand-menu__squad" :to="navigationTo(squadTo)" data-testid="menu-squad-new"
          @click="closeDrawer">
          <span class="brand-menu__codes-icon brand-menu__squad-icon" aria-hidden="true">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 11h16a8 8 0 0 1-16 0Z" />
              <path d="M2 11h20" />
              <path d="M14 7l4-4" />
            </svg>
          </span>
          <span class="brand-menu__codes-text">
            <strong v-if="openRoomCode">Back to Squad room <span translate="no">{{ openRoomCode }}</span></strong>
            <strong v-else>Start a Squad room</strong>
            <span class="lb-meta">Vote on deals with friends</span>
          </span>
        </RouterLink>
        <RouterLink class="brand-menu__link" :to="navigationTo({ name: 'squad-join' })" data-testid="menu-squad-join"
          @click="closeDrawer">Join a squad room</RouterLink>
        <div class="brand-menu__divider" role="presentation" data-testid="menu-squad-divider" />

        <RouterLink v-if="user" class="brand-menu__codes" :to="navigationTo({ name: 'codes' })"
          data-testid="my-codes-link" @click="closeDrawer">
          <span class="brand-menu__codes-icon" aria-hidden="true">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <path v-for="d in TICKET_ICON_PATHS" :key="d" :d="d" />
            </svg>
          </span>
          <span class="brand-menu__codes-text">
            <strong>My codes</strong>
            <span class="lb-meta">{{ codesText }}</span>
          </span>
          <span v-if="activeCodeCount > 0" class="brand-menu__codes-count" aria-hidden="true">{{ activeCodeCount
            }}</span>
        </RouterLink>

        <ul v-for="group in menuGroups" :key="group.label" class="brand-menu__links" :aria-label="group.label">
          <li v-if="group.label === 'Contribute'">
            <RouterLink class="brand-menu__link" :to="navigationTo({ name: 'submit-deal' })" @click="closeDrawer">
              <ShellIcon name="plus" :size="22" />Add a deal
            </RouterLink>
          </li>
          <li v-for="link in group.links" :key="link.to">
            <RouterLink v-slot="{ href, navigate }" :to="navigationTo(link.to)" custom>
              <a class="brand-menu__link" :href="href" :aria-current="isCurrent(link.to) ? 'page' : undefined"
                @click="navigate($event); closeDrawer()">
                <ShellIcon :name="linkIcons[link.to] || 'list'" :size="22" />
                {{ link.label }}
              </a>
            </RouterLink>
          </li>
        </ul>

        <ThemeToggle class="brand-menu__theme" />

        <button v-if="mapTools && mapPreferences" class="brand-menu__link brand-menu__help" type="button"
          data-testid="start-map-tutorial" @click="startTutorial">
          <ShellIcon name="help" :size="22" />Help
        </button>

        <button v-if="user" type="button" class="brand-menu__link brand-menu__logout" data-testid="log-out"
          @click="logOut">
          <ShellIcon name="logout" :size="22" />Log out
        </button>
      </nav>
    </Transition>
  </div>
</template>

<style scoped>
.brand-menu__home {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  text-decoration: none;
}

.brand-menu__toggle {
  display: grid;
  place-items: center;
  align-self: stretch;
  min-width: var(--hit);
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
}

.brand-menu--rail .brand-menu__home,
.brand-menu--compact .brand-menu__home {
  display: none;
}

.brand-menu--rail .brand-menu__toggle,
.brand-menu--compact .brand-menu__toggle {
  width: 100%;
}

.brand-menu--compact .brand-menu__button {
  width: 44px;
  height: 44px;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--paper-sunk);
  box-shadow: none;
}

.brand-menu--compact .brand-menu__mark,
.brand-menu--compact .brand-menu__word,
.brand-menu--compact .brand-menu__count {
  display: none;
}

.brand-menu {
  position: relative;
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.brand-menu__button {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: var(--control-h);
  padding: 0 12px 0 8px;
  color: var(--ink);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition:
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease;
}

.brand-menu__button:hover {
  background: var(--paper-hover);
}

.brand-menu__button:active {
  transform: scale(0.97);
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.brand-menu__mark {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--on-ink);
  background: var(--coral);
  border-radius: 50%;
}

.brand-menu__mark svg {
  width: 18px;
  height: 18px;
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.brand-menu__word {
  display: block;
  height: 26px;
  width: auto;
}

.brand-menu__burger {
  display: inline-flex;
  color: var(--ink-muted);
}

.brand-menu__burger svg {
  width: 18px;
  height: 18px;
}

/* Three lines fold into an X. */
.brand-menu__burger path {
  transform-box: fill-box;
  transform-origin: center;
  transition:
    transform var(--dur-small) var(--ease-out),
    opacity 150ms ease;
}

.brand-menu__button[aria-expanded='true'] .brand-menu__burger {
  color: var(--ink);
}

.brand-menu__button[aria-expanded='true'] .l1 {
  transform: translateY(5px) rotate(45deg);
}

.brand-menu__button[aria-expanded='true'] .l2 {
  opacity: 0;
  transform: scaleX(0.3);
}

.brand-menu__button[aria-expanded='true'] .l3 {
  transform: translateY(-5px) rotate(-45deg);
}

/* A claimed Flash Drop code is waiting: a coral dot on the ticket mark. */
.brand-menu__codes-dot {
  position: absolute;
  top: 6px;
  left: 34px;
  width: 12px;
  height: 12px;
  background: var(--coral);
  border: 2px solid var(--paper-white);
  border-radius: 50%;
}

.brand-menu__codes {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--hit);
  padding: 8px 12px;
  color: var(--ink);
  text-decoration: none;
  background: var(--paper);
  border-radius: var(--radius-control);
  transition: background-color 150ms ease;
}

.brand-menu__codes:hover {
  background: var(--paper-hover);
}

.brand-menu__codes-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  color: var(--on-ink);
  background: var(--ink-strong);
  border-radius: 50%;
}

.brand-menu__codes-icon svg {
  width: 18px;
  height: 18px;
}

.brand-menu__codes-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* The Squad row wears the same sunny as the header's Room button. */
.brand-menu__squad {
  background: var(--sunny-wash);
}

.brand-menu__squad:hover {
  background: var(--sunny-soft);
}

.brand-menu__squad-icon {
  color: var(--on-accent);
  background: var(--sunny);
}

.brand-menu__codes-count {
  margin-left: auto;
  min-width: 24px;
  padding: 3px 8px;
  font-size: var(--text-xs);
  font-weight: 700;
  text-align: center;
  color: var(--on-ink);
  background: var(--coral);
  border-radius: var(--radius-pill);
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.brand-menu__count {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  font: 700 0.6875rem/1 var(--font-sans);
  color: var(--on-accent);
  background: var(--sunny);
  border: 2px solid var(--paper-white);
  border-radius: var(--radius-pill);
}

.brand-menu__panel {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-sizing: border-box;
  width: 290px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100dvh - 90px);
  padding: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  transform-origin: top left;
}

/* The panel scrolls when its rows don't fit; they keep their height instead of being squeezed
   until two-line rows (My codes, the Squad room) spill out of their backgrounds. */
.brand-menu__panel>* {
  flex-shrink: 0;
}

.brand-menu__scrim {
  position: fixed;
  inset: 0;
  z-index: 1;
  background: var(--scrim);
}

.brand-menu__drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--hairline);
}

.brand-menu__drawer-head img {
  width: 170px;
  height: auto;
}

.brand-menu__map-tools {
  display: grid;
  gap: 6px;
}

.brand-menu__sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 52px;
  padding: 8px 12px;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 12px;
  font: 500 1rem/1.4 var(--font-sans);
  cursor: pointer;
}

.brand-menu__switch {
  position: relative;
  margin-left: auto;
  width: 42px;
  height: 24px;
  flex: none;
  background: var(--track);
  border-radius: 99px;
}

.brand-menu__switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: var(--switch-knob);
  border-radius: 50%;
}

.brand-menu__sidebar-toggle[aria-checked='true'] .brand-menu__switch {
  background: var(--coral-deep);
}

.brand-menu__sidebar-toggle[aria-checked='true'] .brand-menu__switch::after {
  transform: translateX(18px);
}

.brand-menu__sidebar-toggle:focus-visible {
  outline: 3px solid var(--sunny-ring);
}

.brand-menu--rail .brand-menu__button {
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 50%;
  box-shadow: none;
}

.brand-menu--rail .brand-menu__mark,
.brand-menu--rail .brand-menu__word,
.brand-menu--rail .brand-menu__count {
  display: none;
}

.brand-menu--rail .brand-menu__burger svg {
  width: 24px;
  height: 24px;
}

.brand-menu .brand-menu__panel {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 2;
  width: 340px;
  max-width: calc(100vw - 16px);
  max-height: none;
  /* Full-height drawer: keep its content clear of the notch and the home indicator. */
  padding:
    calc(20px + env(safe-area-inset-top, 0px)) 20px calc(20px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px));
  border: 0;
  border-radius: 0;
}

.brand-menu__user {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: 10px;
  color: var(--ink);
  text-decoration: none;
  background: var(--paper-hover);
  border-radius: 16px;
}

.brand-menu__user:hover {
  color: var(--ink);
  background: var(--paper-sunk);
}

.brand-menu__avatar {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  font: 600 0.9375rem/1 var(--font-display);
  background: var(--tint-dessert);
  border-radius: 50%;
}

.brand-menu__user-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.brand-menu__auth {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.brand-menu__links {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.brand-menu__link {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 20px;
  min-height: 50px;
  padding: 10px 12px;
  font: 500 1rem/1.4 var(--font-sans);
  color: var(--ink);
  text-align: left;
  text-decoration: none;
  background: transparent;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}

/* Sets the Squad rows apart from the account above and the visitor's codes and deals below. */
.brand-menu__divider {
  flex-shrink: 0;
  height: 1px;
  background: var(--hairline);
}

.brand-menu__links+.brand-menu__links {
  padding-top: 12px;
  border-top: 1px solid var(--hairline);
}

.brand-menu__link :deep(.shell-icon),
.brand-menu__sidebar-toggle :deep(.shell-icon) {
  color: var(--ink-muted);
}

.brand-menu__sidebar-toggle:hover {
  background: var(--paper-hover);
}

.brand-menu__link:hover {
  color: var(--ink);
  background: var(--paper-hover);
}

.brand-menu__link[aria-current='page'] {
  background: var(--sunny-wash);
}



.brand-menu__theme {
  flex-shrink: 0;
  padding-block: 8px;
  border-top: 1px solid var(--hairline);
  border-radius: 0;
}

.brand-menu__logout {
  margin-top: auto;
  color: var(--ink-muted);
  border-top: 1px solid var(--hairline);
  border-radius: 0 0 12px 12px;
}

.brand-menu__button:focus-visible,
.brand-menu__link:focus-visible,
.brand-menu__codes:focus-visible,
.brand-menu__user:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

@media (max-width: 599.98px) {
  .brand-menu__word {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-menu__burger path {
    transition: opacity 150ms ease;
  }

  .brand-menu__button:active {
    transform: none;
  }
}
</style>
