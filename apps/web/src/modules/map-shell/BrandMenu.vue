<script setup lang="ts">
import logoUrl from '@web/assets/logo.png'
import { ACCOUNT_NAV_LINKS, SITE_MENU_ID, SITE_NAV_LINKS } from '@web/components/site-nav-links'
import { TICKET_ICON_PATHS } from '@web/components/ticket-icon'
import { useSiteMenu } from '@web/components/use-site-menu'
import { authClient } from '@web/lib/auth-client'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

// Logo button that drops down the site menu (it replaces the floating "Log in"). Escape, a
// click outside and any navigation close it, and focus returns to the button.
const session = authClient.useSession()
const saved = useSavedDeals()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const root = ref<HTMLElement | null>(null)
const toggleButton = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const { isOpen, close, toggle } = useSiteMenu({ root, toggle: toggleButton, panel })

const user = computed(() => session.value.data?.user ?? null)
const initials = computed(() =>
  (user.value?.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(''),
)
const savedText = computed(() => `${saved.countLabel.value} saved ${saved.count.value === 1 ? 'deal' : 'deals'}`)
// Signing in from the menu brings the visitor back to where they were.
const authQuery = computed(() =>
  route.name === 'login' || route.name === 'register' ? route.query : { redirect: route.fullPath },
)

const menuLinks = computed(() => (user.value ? [...SITE_NAV_LINKS, ...ACCOUNT_NAV_LINKS] : SITE_NAV_LINKS))
// Exact match including the query: RouterLink's own check ignores it, so "/" and
// "/?view=list" would both look current.
const isCurrent = (to: string) => router.resolve(to).fullPath === route.fullPath

const logOut = async () => {
  close()
  try {
    await authClient.signOut()
    toast.show('Logged out. Your saved deals are safe.')
    await router.push({ name: 'browse' })
  } catch (error) {
    console.error('Sign out failed', error)
    toast.show('Could not log out. Please try again.', { tone: 'error' })
  }
}
</script>

<template>
  <div ref="root" class="brand-menu">
    <button
      ref="toggleButton"
      type="button"
      class="brand-menu__button lb-card"
      data-testid="nav-toggle"
      :aria-controls="SITE_MENU_ID"
      :aria-expanded="isOpen"
      :aria-label="isOpen ? 'Close menu' : 'Open menu'"
      @click="toggle"
    >
      <span class="brand-menu__mark" aria-hidden="true">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path v-for="d in TICKET_ICON_PATHS" :key="d" :d="d" />
        </svg>
      </span>
      <img :src="logoUrl" alt="" class="brand-menu__word" />
      <span class="brand-menu__burger" aria-hidden="true">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path class="l1" d="M4 7h16" /><path class="l2" d="M4 12h16" /><path class="l3" d="M4 17h16" />
        </svg>
      </span>
      <span v-if="user && saved.count.value > 0" class="brand-menu__count" aria-hidden="true">{{ saved.countLabel.value }}</span>
    </button>

    <Transition name="shell-menu">
      <nav
        v-if="isOpen"
        :id="SITE_MENU_ID"
        ref="panel"
        class="brand-menu__panel lb-card"
        aria-label="Site"
        data-testid="nav-menu"
      >
        <RouterLink v-if="user" class="brand-menu__user" to="/me/profile" data-testid="signed-in-name">
          <span class="brand-menu__avatar" aria-hidden="true">{{ initials || '?' }}</span>
          <span class="brand-menu__user-text">
            <strong class="lb-text-wrap">{{ user.name }}</strong>
            <span class="lb-meta" data-testid="saved-count">{{ savedText }}</span>
          </span>
        </RouterLink>
        <div v-else class="brand-menu__auth">
          <RouterLink class="lb-btn lb-btn--ink" :to="{ name: 'login', query: authQuery }">Log in</RouterLink>
          <RouterLink class="lb-btn" :to="{ name: 'register', query: authQuery }">Sign up</RouterLink>
        </div>

        <RouterLink class="lb-btn lb-btn--primary lb-btn--block" :to="{ name: 'add-deal' }">
          <ShellIcon name="plus" :size="18" />Add a deal
        </RouterLink>

        <ul class="brand-menu__links">
          <li v-for="link in menuLinks" :key="link.to">
            <RouterLink v-slot="{ href, navigate }" :to="link.to" custom>
              <a
                class="brand-menu__link"
                :href="href"
                :aria-current="isCurrent(link.to) ? 'page' : undefined"
                @click="navigate"
              >
                {{ link.label }}
              </a>
            </RouterLink>
          </li>
        </ul>

        <button v-if="user" type="button" class="brand-menu__link brand-menu__logout" data-testid="log-out" @click="logOut">
          Log out
        </button>
      </nav>
    </Transition>
  </div>
</template>

<style scoped>
.brand-menu {
  position: relative;
}

.brand-menu__button {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
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

.brand-menu__mark {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--paper-white);
  background: var(--coral);
  border-radius: 50%;
}

.brand-menu__mark svg {
  width: 18px;
  height: 18px;
}

.brand-menu__word {
  display: block;
  height: 26px;
  aspect-ratio: 4.6;
  object-fit: cover;
  object-position: center 48%;
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
  color: var(--ink);
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
  transform-origin: top left;
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
  border-radius: 14px;
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
  min-height: var(--hit);
  padding: 0 12px;
  font: 600 0.875rem/1.2 var(--font-sans);
  color: var(--ink);
  text-align: left;
  text-decoration: none;
  background: transparent;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}

.brand-menu__link:hover {
  color: var(--ink);
  background: var(--paper-hover);
}

.brand-menu__link[aria-current='page'] {
  background: var(--sunny-wash);
}

.brand-menu__logout {
  color: var(--ink-muted);
  border-top: 1px solid var(--hairline);
  border-radius: 0 0 12px 12px;
}

.brand-menu__button:focus-visible,
.brand-menu__link:focus-visible,
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
