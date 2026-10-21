<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

// Search box over the map. Typing applies after a short pause, Enter applies at once, and the
// clear button appears only when there is text.
const SEARCH_PAUSE_MS = 250
const MAX_LENGTH = 80

const props = defineProps<{ value: string }>()
const emit = defineEmits<{ search: [q: string] }>()

const text = ref(props.value)
const input = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const cancel = () => {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

const apply = () => {
  cancel()
  const next = text.value.trim()
  if (next !== props.value) emit('search', next)
}

const onInput = (event: Event) => {
  text.value = (event.target as HTMLInputElement).value
  cancel()
  timer = setTimeout(apply, SEARCH_PAUSE_MS)
}

const clear = () => {
  text.value = ''
  apply()
  input.value?.focus()
}

// Filters cleared elsewhere (Clear all, a removed token, Back) show up in the box too.
watch(
  () => props.value,
  (next) => {
    if (next !== text.value.trim()) text.value = next
  },
)

// Opening a panel while typing drops the pending search instead of yanking the visitor back.
const route = useRoute()
watch(() => route.path, cancel)

onBeforeUnmount(cancel)
</script>

<template>
  <!-- biome-ignore lint/a11y/useSemanticElements: Vue does not resolve the <search> element yet -->
  <form class="search-field lb-card" role="search" @submit.prevent="apply">
    <label class="search-field__label">
      <ShellIcon name="search" :size="18" class="search-field__icon" />
      <span class="visually-hidden">Search deals</span>
      <input
        ref="input"
        class="search-field__input"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder="Search dishes or stalls"
        :maxlength="MAX_LENGTH"
        :value="text"
        @input="onInput"
      />
    </label>
    <button v-if="text" type="button" class="search-field__clear" aria-label="Clear search" @click="clear">
      <ShellIcon name="close" :size="14" :stroke-width="2.6" />
    </button>
  </form>
</template>

<style scoped>
.search-field {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  box-sizing: border-box;
  min-width: 0;
  height: var(--control-h);
  padding: 0 4px 0 18px;
  border-radius: var(--radius-pill);
}

.search-field:focus-within {
  border-color: var(--coral);
}

.search-field__label {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 100%;
  margin: 0;
  cursor: text;
}

.search-field__icon {
  color: var(--ink-muted);
}

/* 16px so iOS Safari doesn't zoom in on focus. */
.search-field__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  font: 500 1rem/1.2 var(--font-sans);
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: 0;
}

.search-field__input::-webkit-search-cancel-button {
  display: none;
}

/* The visible circle is 32px; the button itself is a 44px target. */
.search-field__clear {
  position: relative;
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  isolation: isolate;
}

.search-field__clear::before {
  content: '';
  position: absolute;
  inset: 6px;
  z-index: -1;
  background: var(--paper-sunk);
  border-radius: 50%;
}

.search-field__clear:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -2px;
}
</style>
