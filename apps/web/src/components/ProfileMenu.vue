<script setup lang="ts">
import { useSiteMenu } from '@web/components/use-site-menu'
import { authClient } from '@web/lib/auth-client'
import { useShellNavigation } from '@web/modules/map-shell/use-shell-navigation'
import { computed, ref, useId } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

const session = authClient.useSession()
const router = useRouter()
const navigationTo = useShellNavigation()
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const id = useId()
const { isOpen, toggle, close } = useSiteMenu({ root, toggle: button, panel })
const initials = computed(() => Array.from(session.value.data?.user.name?.trim() ?? '')[0]?.toUpperCase() || '?')
const logOut = async () => {
  close()
  await authClient.signOut()
  await router.push('/')
}
</script>

<template>
  <div v-if="session.data" ref="root" class="profile-menu">
    <button ref="button" class="profile-menu__avatar" type="button" :aria-label="`Account menu for ${session.data.user.name}`" :aria-expanded="isOpen" :aria-controls="id" @click="toggle">{{ initials }}</button>
    <nav v-if="isOpen" :id="id" ref="panel" class="profile-menu__panel" aria-label="Account">
      <RouterLink :to="navigationTo('/me/profile')" @click="close">Account settings</RouterLink>
      <RouterLink :to="navigationTo('/me/submissions')" @click="close">My submissions</RouterLink>
      <RouterLink :to="navigationTo('/me/merchant-access')" @click="close">Merchant access</RouterLink>
      <RouterLink to="/about" @click="close">About Lobangers</RouterLink>
      <button type="button" @click="logOut">Log out</button>
    </nav>
  </div>
</template>

<style scoped>
.profile-menu { position: relative; flex: none; }
.profile-menu__avatar { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--hairline); border-radius: 50%; background: var(--sunny-wash); color: var(--ink); font: 700 0.875rem var(--font-sans); cursor: pointer; }
.profile-menu__avatar:focus-visible { outline: 3px solid var(--sunny-ring); outline-offset: 3px; }
.profile-menu__panel { position: absolute; top: calc(100% + 12px); right: 0; z-index: 60; display: grid; min-width: 220px; padding: 8px; border: 1px solid var(--hairline); border-radius: 16px; background: var(--paper-white); box-shadow: var(--shadow-card); }
.profile-menu__panel a, .profile-menu__panel button { display: block; padding: 12px; min-height: 44px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: 600 0.875rem var(--font-sans); text-align: left; text-decoration: none; white-space: nowrap; cursor: pointer; }
.profile-menu__panel a:hover, .profile-menu__panel button:hover { background: var(--paper-hover); }
</style>
