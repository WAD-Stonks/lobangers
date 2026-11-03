<script setup lang="ts">
import { lobbieSpriteUrl } from '@web/modules/lobbie/sprites'
import { ref } from 'vue'

// The "Ask Lobbie" pill with Lobbie peeking over its top edge. While the chat is open it shrinks
// into a round close button, anchored at its right edge. Where it sits is up to the page.
defineProps<{ open: boolean; controls: string }>()
const emit = defineEmits<{ toggle: [] }>()
const button = ref<HTMLButtonElement | null>(null)
defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
  <button
    ref="button"
    type="button"
    class="lobbie-launcher"
    :class="{ 'is-open': open }"
    :aria-label="open ? 'Close chat with Lobbie' : 'Ask Lobbie for Lobangs'"
    :aria-expanded="open"
    :aria-controls="controls"
    data-testid="lobbie-launcher"
    @click="emit('toggle')"
  >
    <!-- Lobbie ducks out of sight while the chat is open. -->
    <img class="lobbie-launcher__peek" :src="lobbieSpriteUrl('idle-peek')" alt="" width="280" height="240" />
    <!-- Both stay rendered so the pill can cross-fade into the round close button. -->
    <span class="lobbie-launcher__label">
      <svg class="lobbie-launcher__chat" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5Z" /></svg>Ask Lobbie
    </span>
    <svg class="lobbie-launcher__close" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
  </button>
</template>

<style scoped>
.lobbie-launcher {
  position: relative;
  display: block;
  flex: none;
  width: 172px;
  height: 52px;
  padding: 0;
  font: 700 1rem / 1 var(--font-sans);
  color: var(--on-accent);
  background: var(--sunny);
  border: 0;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
  cursor: pointer;
  transition:
    width 320ms var(--ease-out),
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease;
}

.lobbie-launcher.is-open {
  width: 52px;
}

.lobbie-launcher:hover {
  background: var(--sunny-deep);
}

.lobbie-launcher:active {
  transform: scale(0.97);
}

.lobbie-launcher:focus-visible {
  outline: 3px solid var(--focus-ring, var(--sunny-ring));
  outline-offset: 3px;
}

/* Both are centred on the button itself, so the cross sits in the middle of the 52px circle. */
.lobbie-launcher__label,
.lobbie-launcher__close {
  position: absolute;
  inset: 0;
  margin: auto;
  transition:
    opacity 160ms ease,
    transform 320ms var(--ease-out);
}

.lobbie-launcher__label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}

.lobbie-launcher__chat,
.lobbie-launcher__close {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lobbie-launcher__chat {
  flex: none;
  stroke-width: 2.2;
}

.lobbie-launcher__close {
  stroke-width: 2.2;
  opacity: 0;
  transform: rotate(-90deg) scale(0.6);
}

.lobbie-launcher.is-open .lobbie-launcher__label {
  opacity: 0;
  transform: scale(0.8);
}

.lobbie-launcher.is-open .lobbie-launcher__close {
  opacity: 1;
  transform: none;
}

/* The sprite's view box ends at his claws, so a small overlap hooks them over the button's edge. */
.lobbie-launcher__peek {
  position: absolute;
  bottom: calc(100% - 13px);
  left: 50%;
  width: 108px;
  height: auto;
  pointer-events: none;
  transform: translateX(-50%);
  transition:
    transform 260ms var(--ease-out),
    opacity 180ms ease;
}

.lobbie-launcher:hover .lobbie-launcher__peek {
  transform: translate(-50%, -4px);
}

.lobbie-launcher.is-open .lobbie-launcher__peek {
  opacity: 0;
  transform: translate(-50%, 36px);
}

/* Phones get a smaller pill and a smaller Lobbie on every page. */
@media (max-width: 599.98px) {
  .lobbie-launcher {
    width: 140px;
    height: 44px;
    font-size: 0.875rem;
  }

  .lobbie-launcher.is-open {
    width: 44px;
  }

  .lobbie-launcher__label {
    gap: 6px;
  }

  .lobbie-launcher__chat {
    width: 16px;
    height: 16px;
  }

  .lobbie-launcher__peek {
    bottom: calc(100% - 10px);
    width: 84px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lobbie-launcher,
  .lobbie-launcher__peek,
  .lobbie-launcher__label,
  .lobbie-launcher__close {
    transition: none;
  }

  .lobbie-launcher:active {
    transform: none;
  }

  .lobbie-launcher:hover .lobbie-launcher__peek {
    transform: translateX(-50%);
  }
}
</style>
