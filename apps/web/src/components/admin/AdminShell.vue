<script setup lang="ts">
import '@web/assets/admin.css'
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import AdminImportProgress from '@web/components/admin/AdminImportProgress.vue'
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'
import AdminSidebar from '@web/components/admin/AdminSidebar.vue'
import { adminNavigation, sidebarCollapsed } from '@web/components/admin/admin-navigation'
import { useAdminDrawer } from '@web/components/admin/use-admin-drawer'
import ThemeToggle from '@web/components/ThemeToggle.vue'
import { backgroundImport } from '@web/modules/ingestion-admin/background-import'
import { computed, inject, watch } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

const props = withDefaults(defineProps<{ title?: string; refreshKey?: number; access?: string }>(), { title: 'Administration', refreshKey: 0, access: 'allowed' })
const authorized = computed(() => props.access === 'allowed')
const showSession = computed(() => authorized.value || ['closed', 'forbidden', 'error'].includes(props.access.toLowerCase()))
const emit = defineEmits<{ closing: []; signedOut: []; accessReload: [] }>()
const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const { mobile, dialog, toggleButton, drawerOpen, closeDrawer, openDrawer, drawerKeydown } = useAdminDrawer()
const closeAccess = () => { backgroundImport.reset(); emit('closing') }
watch(() => route?.fullPath, () => closeDrawer())
watch(authorized, value => { if (!value) closeDrawer() })
const context = computed(() => adminNavigation.find((item) => item.href === route?.path)?.label ?? 'Overview')
const navigate = (event: MouseEvent, href: string) => {
  if (!router || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  closeDrawer()
  void router.push(href)
}
</script>

<template>
  <div class="admin-shell" :class="{ 'admin-shell--collapsed': authorized && sidebarCollapsed, 'admin-shell--auth': !authorized }">
    <a class="admin-skip-link" href="#admin-main">Skip to content</a>
    <dialog v-if="authorized && mobile" id="admin-sidebar" :ref="(element) => dialog = element as HTMLDialogElement" class="admin-drawer" aria-label="Administration navigation" @cancel.prevent="closeDrawer()" @click.self="closeDrawer()" @keydown="drawerKeydown" @close="!dialog?.open && closeDrawer()">
      <button class="admin-icon-button admin-drawer-close" type="button" aria-label="Close navigation" @click="closeDrawer()"><AdminIcon name="close" /></button>
      <AdminSidebar :path="route?.path" @navigate="navigate" />
    </dialog>
    <aside v-else-if="authorized" id="admin-sidebar" class="admin-sidebar"><AdminSidebar :path="route?.path" :collapsed="sidebarCollapsed" @navigate="navigate" /></aside>
    <div class="admin-workspace">
      <header v-if="!authorized" class="admin-auth-header">
        <a class="admin-wordmark" href="/" aria-label="Lobangers home" />
        <ThemeToggle variant="admin" collapsed />
      </header>
      <header v-show="showSession" class="admin-topbar">
        <button v-if="authorized" :ref="(element) => toggleButton = element as HTMLButtonElement" class="admin-icon-button" type="button" :aria-label="mobile ? 'Open navigation' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'" aria-controls="admin-sidebar" :aria-expanded="mobile ? drawerOpen : !sidebarCollapsed" @click="mobile ? openDrawer() : sidebarCollapsed = !sidebarCollapsed"><AdminIcon name="sidebar" /></button>
        <div v-if="authorized" class="admin-breadcrumb"><span>Administration</span><span aria-hidden="true">/</span><strong>{{ context }}</strong></div>
        <AdminSessionControls :refresh-key="refreshKey" @closing="closeAccess" @signed-out="emit('signedOut')" @access-reload="emit('accessReload')" />
      </header>
      <main id="admin-main" class="admin-main" tabindex="-1">
        <AdminImportProgress v-if="authorized" />
        <header v-if="authorized" class="admin-heading"><h1>{{ title }}</h1></header>
        <div class="admin-content"><slot /></div>
        <a v-if="!authorized" class="admin-auth-back" href="/">Back to map</a>
      </main>
    </div>
  </div>
</template>
