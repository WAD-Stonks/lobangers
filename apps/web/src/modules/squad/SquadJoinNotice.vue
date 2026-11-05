<script setup lang="ts">
defineProps<{ title: string; body: string }>()
</script>

<template>
  <div class="squad-room__notice" role="status">
    <h2 class="squad-room__title squad-room__title--small">{{ title }}</h2>
    <p>{{ body }}</p>
    <div class="squad-sheet__actions">
      <slot />
    </div>
  </div>
</template>
