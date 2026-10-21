<script setup lang="ts">
import ComingSoonPanel from '@web/modules/map-shell/ComingSoonPanel.vue'

// Route and role guard are live; the merchant's outlets and promotions land here.
</script>

<template>
  <ComingSoonPanel
    title="Your stall"
    owner="Isaac"
    summary="Your outlets and live promotions will show here, with a way to end a promotion straight from the map."
    :link="{ label: 'Request access for another outlet', to: '/me/merchant-access' }"
  />
</template>
