<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'

defineProps<{ sprite: string; title: string; points: readonly string[] }>()
</script>

<template>
  <aside class="add-deal-tip" :aria-label="title">
    <img class="add-deal-tip__lobbie" :src="`/chatbot-sprites/${sprite}.svg`" alt="" width="132" height="120" />
    <div>
      <p class="add-deal-tip__title">{{ title }}</p>
      <ul class="add-deal-tip__points">
        <li v-for="point in points" :key="point">
          <span class="add-deal-tip__check" aria-hidden="true"><ShellIcon name="check" :size="14" :stroke-width="2.6" /></span>{{ point }}
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.add-deal-tip {
  display: flex;
  align-items: center;
  gap: clamp(14px, 4vw, 32px);
  padding: 20px clamp(16px, 4vw, 32px);
  background: var(--sunny-wash);
  border-radius: 24px;
}

.add-deal-tip__lobbie {
  flex: none;
  width: clamp(88px, 20vw, 132px);
  height: auto;
}

.add-deal-tip__title {
  margin: 0 0 10px;
  font-size: 1.125rem;
  font-weight: 750;
}

.add-deal-tip__points {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.add-deal-tip__points li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.9375rem;
  line-height: 1.45;
}

.add-deal-tip__check {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  color: var(--on-accent);
  background: var(--sunny);
  border-radius: 50%;
}
</style>
