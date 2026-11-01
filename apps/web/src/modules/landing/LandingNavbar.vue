<script setup lang="ts">
import logo from '@web/assets/lobangers-logo.png'
import AccountMenu from '@web/components/AccountMenu.vue'
import ProfileMenu from '@web/components/ProfileMenu.vue'
import { useSiteMenu } from '@web/components/use-site-menu'
import { authClient } from '@web/lib/auth-client'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const session = authClient.useSession()
const root = ref<HTMLElement | null>(null)
const toggleButton = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const { isOpen, toggle, close } = useSiteMenu({ root, toggle: toggleButton, panel })
</script>

<template>
  <header ref="root" class="landing-header">
    <nav class="landing-nav" aria-label="Primary navigation">
      <RouterLink to="/" class="landing-brand" aria-label="Lobangers home">
        <img :src="logo" alt="LOBANGERS" />
      </RouterLink>
      <div class="landing-nav-links">
        <RouterLink to="/deals">All deals</RouterLink>
        <RouterLink to="/browse">Map</RouterLink>
        <RouterLink v-if="session.data" to="/saved">Saved deals</RouterLink>
        <a v-else href="#story">How it works</a>
      </div>
      <div class="landing-account">
        <ProfileMenu v-if="session.data" />
        <AccountMenu v-else />
      </div>
      <button ref="toggleButton" class="landing-menu-toggle" type="button" :aria-expanded="isOpen" aria-controls="landing-mobile-menu" @click="toggle">{{ isOpen ? 'Close ✕' : 'Menu ☰' }}</button>
      <div v-if="isOpen" id="landing-mobile-menu" ref="panel" class="landing-mobile-menu">
        <RouterLink to="/deals" @click="close">All deals</RouterLink>
        <RouterLink to="/browse" @click="close">Map</RouterLink>
        <a v-if="!session.data" href="#story" @click="close">How it works</a>
        <AccountMenu />
      </div>
    </nav>
  </header>
</template>
