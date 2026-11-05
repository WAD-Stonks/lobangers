<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps<{ hasPhoto?: boolean }>()

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
let depth = 0

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

const enter = (event: DragEvent) => {
  if (!carriesFiles(event)) return
  depth += 1
  dragging.value = true
}

const leave = () => {
  depth = Math.max(0, depth - 1)
  if (depth === 0) dragging.value = false
}

const drop = (event: DragEvent) => {
  depth = 0
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  const element = input.value
  if (!file || !element) return
  const chosen = new DataTransfer()
  chosen.items.add(file)
  element.files = chosen.files
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

defineExpose({
  clear: () => {
    if (input.value) input.value.value = ''
  },
})
</script>

<template>
  <label
    class="photo-drop"
    :class="{ 'is-dragging': dragging }"
    data-testid="photo-drop"
    @dragenter.prevent="enter"
    @dragover.prevent
    @dragleave="leave"
    @drop.prevent="drop"
  >
    <input ref="input" v-bind="$attrs" type="file" accept="image/jpeg,image/png,image/webp" class="photo-drop__input" />
    <span class="photo-drop__icon" aria-hidden="true"><ShellIcon name="plus" :size="22" /></span>
    <span class="photo-drop__text">
      <strong>{{ dragging ? 'Drop the photo here' : hasPhoto ? 'Drag a new photo here' : 'Drag a photo here' }}</strong>
      <span>or <span class="photo-drop__browse">browse your files</span></span>
    </span>
  </label>
</template>

<style scoped>
.photo-drop {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 88px;
  padding: 16px 18px;
  color: var(--ink);
  background: var(--paper-sunk);
  border: 1.5px dashed var(--hairline-strong, var(--hairline));
  border-radius: 16px;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.photo-drop__input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  opacity: 0;
}

.photo-drop:focus-within {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.photo-drop.is-dragging {
  background: var(--sunny-wash);
  border-color: var(--sunny-deep);
  border-style: solid;
}

.photo-drop:has(.is-invalid) {
  border-color: var(--coral-deep);
}

.photo-drop__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--on-accent);
  background: var(--sunny);
  border-radius: 50%;
}

.photo-drop__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.photo-drop__text > span {
  color: var(--ink-muted);
  font-size: 0.875rem;
}

.photo-drop__browse {
  color: var(--ink);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (hover: hover) and (pointer: fine) {
  .photo-drop:hover {
    background: var(--paper-hover);
  }

  .photo-drop.is-dragging:hover {
    background: var(--sunny-wash);
  }
}

@media (prefers-reduced-motion: reduce) {
  .photo-drop {
    transition: none;
  }
}
</style>
