<script setup lang="ts">
import '@web/assets/admin.css'
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'
import AdminSidebar from '@web/components/admin/AdminSidebar.vue'
import { adminNavigation, sidebarCollapsed } from '@web/components/admin/admin-navigation'
import { useAdminDrawer } from '@web/components/admin/use-admin-drawer'
import { computed, inject, watch } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

withDefaults(defineProps<{ title?: string; refreshKey?: number }>(), { title: 'Administration', refreshKey: 0 })
const emit = defineEmits<{ closing: []; signedOut: []; accessReload: [] }>()
const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const { mobile, dialog, toggleButton, drawerOpen, closeDrawer, openDrawer, drawerKeydown } = useAdminDrawer()
watch(() => route?.fullPath, () => closeDrawer())
const context = computed(() => adminNavigation.find((item) => item.href === route?.path)?.label ?? 'Overview')
const navigate = (event: MouseEvent, href: string) => {
  if (!router || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  closeDrawer()
  void router.push(href)
}
</script>

<template>
  <div class="admin-shell" :class="{ 'admin-shell--collapsed': sidebarCollapsed }">
    <a class="admin-skip-link" href="#admin-main">Skip to content</a>
    <dialog v-if="mobile" id="admin-sidebar" :ref="(element) => dialog = element as HTMLDialogElement" class="admin-drawer" aria-label="Administration navigation" @cancel.prevent="closeDrawer()" @click.self="closeDrawer()" @keydown="drawerKeydown" @close="!dialog?.open && closeDrawer()">
      <button class="admin-icon-button admin-drawer-close" type="button" aria-label="Close navigation" @click="closeDrawer()"><AdminIcon name="close" /></button>
      <AdminSidebar :path="route?.path" @navigate="navigate" />
    </dialog>
    <aside v-else id="admin-sidebar" class="admin-sidebar"><AdminSidebar :path="route?.path" :collapsed="sidebarCollapsed" @navigate="navigate" /></aside>
    <div class="admin-workspace">
      <header class="admin-topbar">
        <button :ref="(element) => toggleButton = element as HTMLButtonElement" class="admin-icon-button" type="button" :aria-label="mobile ? 'Open navigation' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'" aria-controls="admin-sidebar" :aria-expanded="mobile ? drawerOpen : !sidebarCollapsed" @click="mobile ? openDrawer() : sidebarCollapsed = !sidebarCollapsed"><AdminIcon name="sidebar" /></button>
        <div class="admin-breadcrumb"><span>Administration</span><span aria-hidden="true">/</span><strong>{{ context }}</strong></div>
        <AdminSessionControls :refresh-key="refreshKey" @closing="emit('closing')" @signed-out="emit('signedOut')" @access-reload="emit('accessReload')" />
      </header>
      <main id="admin-main" class="admin-main" tabindex="-1">
        <header class="admin-heading"><h1>{{ title }}</h1></header>
        <div class="admin-content"><slot /></div>
      </main>
    </div>
  </div>
</template>
