<script setup lang="ts">
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import { adminNavigation } from '@web/components/admin/admin-navigation'

defineProps<{ path?: string; collapsed?: boolean }>()
const emit = defineEmits<{ navigate: [event: MouseEvent, href: string] }>()
</script>

<template>
  <div class="admin-sidebar-content">
    <a class="admin-brand" href="/admin" :title="collapsed ? 'Lobangers administration' : undefined" aria-label="Lobangers administration" @click="emit('navigate', $event, '/admin')">
      <span class="admin-brand-mark" aria-hidden="true">L<span>.</span></span>
      <span class="admin-brand-copy"><span class="admin-wordmark" aria-hidden="true" /><small>Administration</small></span>
    </a>
    <nav aria-label="Administration" class="admin-navigation">
      <ul>
        <li v-for="(item, index) in adminNavigation" :key="item.href">
          <span v-if="index === 0 || item.group !== adminNavigation[index - 1]?.group" class="admin-navigation-group">{{ item.group }}</span>
          <a :href="item.href" :aria-label="collapsed ? item.label : undefined" :title="collapsed ? item.label : undefined" :aria-current="path === item.href ? 'page' : undefined" @click="emit('navigate', $event, item.href)">
            <AdminIcon :name="item.icon" /><span class="admin-navigation-label">{{ item.label }}</span>
          </a>
        </li>
      </ul>
    </nav>
    <footer class="admin-sidebar-footer">
      <a class="admin-map-link" href="/browse" aria-label="Back to map" :title="collapsed ? 'Back to map' : undefined" @click="emit('navigate', $event, '/browse')"><AdminIcon name="back" /><span class="admin-navigation-label">Back to map</span></a>
    </footer>
  </div>
</template>
