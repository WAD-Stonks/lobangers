<script setup lang="ts">
import logo from '@web/assets/lobangers-logo.svg'
import AccountMenu from '@web/components/AccountMenu.vue'
import ProfileMenu from '@web/components/ProfileMenu.vue'
import { useSiteMenu } from '@web/components/use-site-menu'
import { authClient } from '@web/lib/auth-client'
import { useTheme } from '@web/lib/theme'
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'

const session = authClient.useSession()
// Merchants get their dashboard in the top links, not only in the avatar menu.
const isMerchant = computed(() => session.value.data?.user.role === 'MERCHANT')
const root = ref<HTMLElement | null>(null)
const toggleButton = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const { isOpen, toggle, close } = useSiteMenu({ root, toggle: toggleButton, panel })
const { isDark, toggle: toggleTheme } = useTheme()

// The new theme spreads out in a circle from the switch. The browser snapshots the page, the
// theme changes underneath, and the new snapshot is revealed through a growing clip-path. Without
// View Transitions, or with reduced motion, the theme simply switches.
const switchTheme = async (event: MouseEvent) => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce) {
    toggleTheme()
    return
  }
  const button = event.currentTarget as HTMLElement
  const box = button.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const root = document.documentElement
  root.classList.add('theme-reveal')
  const transition = document.startViewTransition(async () => {
    toggleTheme()
    await nextTick()
    // The map swaps to its other painting; give it a moment to decode so the circle reveals it.
    const art = [...document.querySelectorAll<HTMLImageElement>('.lobangers-landing .island-art')]
    await Promise.race([
      Promise.allSettled(art.map((image) => image.decode())),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ])
  })
  try {
    await transition.ready
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards', pseudoElement: '::view-transition-new(root)' },
    )
    // Wait for the whole transition, not just the circle: dropping the class while the snapshots
    // are still up brings back the browser's default cross-fade, which replays the switch.
    await transition.finished
  } catch {
    /* A skipped transition still switched the theme. */
  } finally {
    root.classList.remove('theme-reveal')
  }
}
</script>

<template>
  <header ref="root" class="landing-header">
    <nav class="landing-nav" aria-label="Primary navigation">
      <RouterLink to="/" class="landing-brand" aria-label="Lobangers home">
        <img :src="logo" alt="LOBANGERS" width="816" height="170" />
      </RouterLink>
      <div class="landing-nav-links">
        <RouterLink to="/deals">All deals</RouterLink>
        <RouterLink to="/browse">Map</RouterLink>
        <RouterLink v-if="session.data" to="/saved">Saved deals</RouterLink>
        <a v-else href="#story">How it works</a>
        <RouterLink v-if="isMerchant" to="/merchant" data-testid="landing-merchant-dashboard">Merchant dashboard</RouterLink>
      </div>
      <!-- Shows what a press switches to: the moon in light mode, the sun in dark. -->
      <button
        class="landing-theme"
        type="button"
        role="switch"
        :aria-checked="isDark"
        aria-label="Dark mode"
        data-testid="landing-theme-toggle"
        @click="switchTheme"
      >
        <svg v-if="isDark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
      </button>
      <div class="landing-account">
        <ProfileMenu v-if="session.data" />
        <AccountMenu v-else />
      </div>
      <button ref="toggleButton" class="landing-menu-toggle" type="button" :aria-expanded="isOpen" aria-controls="landing-mobile-menu" @click="toggle">{{ isOpen ? 'Close' : 'Menu' }} <span aria-hidden="true">{{ isOpen ? '✕' : '☰' }}</span></button>
      <div v-if="isOpen" id="landing-mobile-menu" ref="panel" class="landing-mobile-menu">
        <RouterLink to="/deals" @click="close">All deals</RouterLink>
        <RouterLink to="/browse" @click="close">Map</RouterLink>
        <a v-if="!session.data" href="#story" @click="close">How it works</a>
        <AccountMenu />
      </div>
    </nav>
  </header>
</template>
