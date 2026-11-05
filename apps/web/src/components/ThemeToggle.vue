<script setup lang="ts">
import { useTheme } from '@web/lib/theme'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'

withDefaults(defineProps<{ variant?: 'menu' | 'admin'; collapsed?: boolean }>(), {
  variant: 'menu',
  collapsed: false,
})
const { isDark, toggle } = useTheme()
const LABEL = 'Dark mode'
</script>

<template>
  <button
    type="button"
    role="switch"
    class="theme-toggle"
    :class="[`theme-toggle--${variant}`, { 'theme-toggle--collapsed': collapsed }]"
    :aria-checked="isDark"
    :aria-label="LABEL"
    :title="collapsed ? LABEL : undefined"
    data-testid="theme-toggle"
    @click="toggle"
  >
    <ShellIcon name="moon" :size="variant === 'admin' ? 18 : 22" />
    <span v-if="!collapsed" class="theme-toggle__label">{{ LABEL }}</span>
    <span v-if="!collapsed" class="theme-toggle__switch" aria-hidden="true" />
  </button>
</template>

<style scoped>
.theme-toggle {
  --toggle-track-w: 42px;
  --toggle-track-h: 24px;
  --toggle-knob: 18px;
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
  min-height: 52px;
  padding: 8px 12px;
  color: var(--ink);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 12px;
  font: 500 1rem/1.4 var(--font-sans);
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 150ms ease;
}

.theme-toggle :deep(.shell-icon) {
  color: var(--ink-muted);
}

.theme-toggle__switch {
  position: relative;
  flex: none;
  width: var(--toggle-track-w);
  height: var(--toggle-track-h);
  margin-left: auto;
  background: var(--track);
  border-radius: 99px;
}

.theme-toggle__switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: var(--toggle-knob);
  height: var(--toggle-knob);
  background: var(--switch-knob);
  border-radius: 50%;
  transition: transform var(--dur-small) var(--ease-out);
}

.theme-toggle[aria-checked='true'] .theme-toggle__switch {
  background: var(--coral-deep);
}

.theme-toggle[aria-checked='true'] .theme-toggle__switch::after {
  transform: translateX(calc(var(--toggle-track-w) - var(--toggle-knob) - 6px));
}

.theme-toggle:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .theme-toggle:hover {
    background: var(--paper-hover);
  }
}

.theme-toggle--admin {
  --toggle-track-w: 32px;
  --toggle-track-h: 18px;
  --toggle-knob: 12px;
  gap: 12px;
  min-height: 40px;
  color: var(--admin-muted);
  border-radius: 6px;
  font: inherit;
  white-space: nowrap;
}

.theme-toggle--admin :deep(.shell-icon) {
  color: currentColor;
}

@media (hover: hover) and (pointer: fine) {
  .theme-toggle--admin:hover {
    color: var(--admin-text);
    background: var(--admin-hover);
  }
}

.theme-toggle--collapsed {
  justify-content: center;
  padding-inline: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .theme-toggle__switch::after {
    transition: none;
  }
}
</style>
