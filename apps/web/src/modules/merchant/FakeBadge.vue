<script setup lang="ts">
// A small label that marks made-up demo data, so nobody mistakes it for a real deal.
</script>

<template>
  <span class="fake-badge">Fake deal</span>
</template>

<style scoped>
.fake-badge {
  --fake-border: #b98a12;
  --fake-ink: #7a5a00;
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px dashed var(--fake-border);
  background: var(--sunny-wash);
  color: var(--fake-ink);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.app-palette[data-theme='dark'] .fake-badge {
  --fake-border: #a88a2e;
  --fake-ink: var(--tag-build-ink);
}
</style>
