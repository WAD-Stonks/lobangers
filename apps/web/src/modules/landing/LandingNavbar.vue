<script setup lang="ts">
import logo from '@web/assets/lobangers-logo.png'
import AccountMenu from '@web/components/AccountMenu.vue'
import { useSiteMenu } from '@web/components/use-site-menu'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

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
        <RouterLink to="/browse">Map</RouterLink>
        <a href="#cuisines">Explore Cuisines</a>
        <a href="#story">How it works</a>
        <RouterLink to="/saved">Saved Deals</RouterLink>
      </div>
      <div class="landing-account">
        <AccountMenu />
      </div>
      <button ref="toggleButton" class="landing-menu-toggle" type="button" :aria-expanded="isOpen" aria-controls="landing-mobile-menu" @click="toggle">{{ isOpen ? 'Close ✕' : 'Menu ☰' }}</button>
      <div v-if="isOpen" id="landing-mobile-menu" ref="panel" class="landing-mobile-menu">
        <RouterLink to="/browse" @click="close">Map</RouterLink>
        <a href="#cuisines" @click="close">Explore Cuisines</a>
        <a href="#story" @click="close">How it works</a>
        <RouterLink to="/saved" @click="close">Saved Deals</RouterLink>
        <AccountMenu />
      </div>
    </nav>
  </header>
</template>
