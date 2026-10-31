<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
</script>

<template>
  <section class="community-voting-preview" aria-label="Read-only preview of member voting">
    <span class="members-can-vote">Members can vote</span>
    <div class="voting-preview-options">
      <button type="button" disabled><ShellIcon name="check" :size="20" /><span>Still on</span></button>
      <button type="button" disabled><ShellIcon name="close" :size="20" /><span>Gone</span></button>
    </div>
    <p>Community voting is available to registered members.</p>
  </section>
</template>
