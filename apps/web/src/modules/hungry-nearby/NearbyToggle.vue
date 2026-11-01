<script setup lang="ts">
import type { PresenceAvatar } from '@broke-oclock/contracts/presence'
import { AVATAR_NAMES, AVATARS, avatarSrc } from '@web/modules/hungry-nearby/avatars'
import { useHungryNearby } from '@web/modules/hungry-nearby/use-hungry-nearby'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// "Lobangers nearby" in the map's control stack. Turning it on shows other people and opens a
// small choice: show yourself too (signed in only) or just look. Turning it off hides you.
const store = useHungryNearby()
store?.bindToast(useToast())
const route = useRoute()

const root = ref<HTMLElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const picked = ref<PresenceAvatar | null>(store?.avatar.value ?? null)
const loginTo = computed(() => ({ name: 'login', query: { redirect: route.fullPath } }))
const label = computed(() =>
  store?.sharing.value ? 'Lobangers nearby (you are shown)' : 'Lobangers nearby',
)
const iconAvatar = computed<PresenceAvatar>(() => store?.me.value?.avatar ?? picked.value ?? 'bao')

const close = () => {
  if (store) store.popoverOpen.value = false
}

const onDocumentPointer = (event: PointerEvent) => {
  if (root.value && event.target instanceof Node && !root.value.contains(event.target)) close()
}
// Escape hands focus back to the toggle so keyboard users are not dropped on the page body.
const onKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  const hadFocus = !!popover.value?.contains(document.activeElement)
  close()
  if (hadFocus) button.value?.focus({ preventScroll: true })
}

watch(
  () => store?.popoverOpen.value ?? false,
  async (open) => {
    document.removeEventListener('pointerdown', onDocumentPointer)
    document.removeEventListener('keydown', onKey)
    if (!open) return
    document.addEventListener('pointerdown', onDocumentPointer)
    document.addEventListener('keydown', onKey)
    await nextTick()
    popover.value?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true })
  },
)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="store" ref="root" class="nearby-toggle">
    <button
      ref="button"
      type="button"
      class="lb-ctrl nearby-toggle__button"
      :class="{ 'is-on': store.looking.value }"
      data-testid="nearby-toggle"
      :aria-pressed="store.looking.value"
      :aria-label="label"
      :title="label"
      aria-controls="nearby-popover"
      @click="store.toggle()"
    >
      <img :src="avatarSrc(iconAvatar)" alt="" width="28" height="28" class="nearby-toggle__face" />
      <span v-if="store.sharing.value" class="nearby-toggle__dot" aria-hidden="true" />
    </button>

    <Transition name="nearby-pop">
      <div
        v-if="store.popoverOpen.value && store.looking.value"
        id="nearby-popover"
        ref="popover"
        class="nearby-popover"
        role="dialog"
        aria-labelledby="nearby-popover-title"
        data-testid="nearby-popover"
      >
        <p id="nearby-popover-title" class="nearby-popover__title">Lobangers nearby</p>
        <template v-if="store.sharing.value">
          <p class="nearby-popover__text">
            Others see you as {{ AVATAR_NAMES[store.me.value?.avatar ?? iconAvatar] }}, about 150&nbsp;m from where you are.
          </p>
          <div class="nearby-popover__actions">
            <button type="button" class="lb-btn nearby-popover__btn" data-testid="nearby-hide-me" :disabled="store.pending.value !== null" @click="store.hideMe()">
              Hide me
            </button>
            <button type="button" class="lb-btn lb-btn--primary nearby-popover__btn" @click="close">Done</button>
          </div>
        </template>
        <template v-else>
          <p class="nearby-popover__text">Others only ever see a cute lobanger near you. Never your name or exact spot.</p>
          <fieldset v-if="store.signedIn.value" class="nearby-popover__avatars">
            <legend class="visually-hidden">Pick your lobanger</legend>
            <button
              v-for="avatar in AVATARS"
              :key="avatar"
              type="button"
              class="nearby-popover__avatar"
              :class="{ 'is-picked': picked === avatar }"
              :aria-pressed="picked === avatar"
              :aria-label="AVATAR_NAMES[avatar]"
              :title="AVATAR_NAMES[avatar]"
              @click="picked = avatar"
            >
              <img :src="avatarSrc(avatar)" alt="" width="32" height="32" />
            </button>
          </fieldset>
          <div class="nearby-popover__actions">
            <button
              v-if="store.signedIn.value"
              type="button"
              class="lb-btn lb-btn--primary nearby-popover__btn"
              data-testid="nearby-show-me"
              :disabled="store.pending.value !== null"
              :aria-busy="store.pending.value === 'share'"
              @click="store.showMe(picked)"
            >
              Show me too
            </button>
            <RouterLink v-else class="lb-btn lb-btn--primary nearby-popover__btn" :to="loginTo" data-testid="nearby-login">
              Log in to show yourself
            </RouterLink>
            <button type="button" class="lb-btn nearby-popover__btn" data-testid="nearby-just-look" @click="store.justLook()">Just look</button>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.nearby-toggle {
  position: relative;
}

.nearby-toggle__button {
  position: relative;
}

.nearby-toggle__button.is-on {
  background: var(--sky-soft);
  border-color: var(--sky);
}

.nearby-toggle__face {
  width: 28px;
  height: 28px;
  object-fit: contain;
  pointer-events: none;
}

.nearby-toggle__button:not(.is-on) .nearby-toggle__face {
  filter: grayscale(0.55);
  opacity: 0.85;
}

.nearby-toggle__dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 9px;
  height: 9px;
  background: var(--sky);
  border: 2px solid var(--paper-white);
  border-radius: 50%;
}

.nearby-popover {
  position: absolute;
  right: calc(100% + var(--space-2));
  bottom: 0;
  z-index: 30;
  width: min(272px, calc(100vw - 96px));
  padding: var(--space-3);
  color: var(--ink);
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 16px;
  box-shadow: var(--shadow-pill);
  transform-origin: 100% 100%;
}

.nearby-popover__title {
  margin: 0 0 var(--space-1);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
}

.nearby-popover__text {
  margin: 0 0 var(--space-3);
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--ink-muted);
}

.nearby-popover__avatars {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 2px;
  min-width: 0;
  margin: 0 0 var(--space-3);
  padding: 0;
  border: 0;
}

.nearby-popover__avatar {
  display: grid;
  place-items: center;
  min-height: var(--hit);
  padding: 0;
  background: none;
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.nearby-popover__avatar img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.nearby-popover__avatar.is-picked {
  background: var(--sky-soft);
  border-color: var(--sky);
}

.nearby-popover__avatar:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 1px;
}

.nearby-popover__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.nearby-popover__btn {
  flex: 1 1 auto;
  min-height: var(--hit);
  justify-content: center;
  text-align: center;
}

.nearby-pop-enter-active {
  transition:
    opacity 160ms ease,
    transform 180ms var(--ease-out);
}

.nearby-pop-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.nearby-pop-enter-from,
.nearby-pop-leave-to {
  opacity: 0;
  transform: scale(0.96) translateX(4px);
}

@media (prefers-reduced-motion: reduce) {
  .nearby-pop-enter-active,
  .nearby-pop-leave-active {
    transition: opacity 120ms ease;
  }

  .nearby-pop-enter-from,
  .nearby-pop-leave-to {
    transform: none;
  }
}
</style>
