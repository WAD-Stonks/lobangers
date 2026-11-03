<script setup lang="ts">
import {
  copyDealLink,
  type DealShare,
  dealImageFile,
  shareNatively,
  telegramShareUrl,
  whatsAppShareUrl,
} from '@web/modules/browse-map/share-deal'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { dealLocation } from '@web/modules/map-shell/shell-routes'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'

// Lives in the deal panel's action bar: a deal is shared once it has been opened. A small menu
// offers the link and the chat apps; More… opens the device's share sheet with the picture.
const props = defineProps<{
  dealId: string
  venueId: string
  title: string
  venueName: string
  dates: string | null
  imageUrl?: string | null
}>()
const router = useRouter()
const toast = useToast()
const menuId = useId()
const button = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const place = ref({ top: 0, right: 0, up: false })
const canShareNatively = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
const label = computed(() => `Share ${props.title}`)

// The deal's own page at this outlet, without the sharer's filters.
const share = computed<DealShare>(() => ({
  title: props.title,
  venueName: props.venueName,
  dates: props.dates,
  url: new URL(router.resolve(dealLocation({}, props.dealId, props.venueId)).href, window.location.origin).href,
}))
// Ready before the tap, so the share sheet can open with the photo attached.
const image = ref<File | null>(null)
watch(
  () => props.imageUrl,
  async (url) => {
    image.value = null
    if (!url || !canShareNatively) return
    const file = await dealImageFile(url)
    if (props.imageUrl === url) image.value = file
  },
  { immediate: true },
)
const whatsApp = computed(() => whatsAppShareUrl(share.value))
const telegram = computed(() => telegramShareUrl(share.value))

const items = () => [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]

const onOutside = (event: Event) => {
  const target = event.target as Node
  if (!menu.value?.contains(target) && !button.value?.contains(target)) close(false)
}
// The menu is pinned to where the button was, so it goes rather than drift off it.
const onMove = () => close(false)
const listen = (on: boolean) => {
  const method = on ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', onOutside, true)
  window[method]('scroll', onMove, true)
  window[method]('resize', onMove)
}

const close = (refocus = true) => {
  if (!open.value) return
  open.value = false
  listen(false)
  if (refocus) button.value?.focus()
}

const openMenu = async () => {
  const box = button.value?.getBoundingClientRect()
  if (!box) return
  // Opens upward near the bottom of the screen, as in the panel's action bar.
  const up = window.innerHeight - box.bottom < 220
  place.value = { top: up ? box.top - 8 : box.bottom + 8, right: Math.max(8, window.innerWidth - box.right), up }
  open.value = true
  listen(true)
  await nextTick()
  items()[0]?.focus()
}

const toggle = () => (open.value ? close() : openMenu())

const copy = async () => {
  close()
  const copied = await copyDealLink(share.value.url)
  toast.show(copied ? 'Link copied' : 'Could not copy the link. Try again.', copied ? {} : { tone: 'error' })
}

const more = async () => {
  close()
  if ((await shareNatively(share.value, image.value)) === 'failed')
    toast.show('Could not share that deal. Try again.', { tone: 'error' })
}

const onMenuKey = (event: KeyboardEvent) => {
  const list = items()
  const at = list.indexOf(document.activeElement as HTMLElement)
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
  if (step) {
    event.preventDefault()
    list[(at + step + list.length) % list.length]?.focus()
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    list[event.key === 'Home' ? 0 : list.length - 1]?.focus()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab') {
    close(false)
  }
}

onBeforeUnmount(() => listen(false))
</script>

<template>
  <button
    ref="button"
    type="button"
    class="lb-btn share-deal-button"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    data-testid="share-deal"
    @click.stop.prevent="toggle"
  >
    <ShellIcon name="share" :size="18" />Share
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      :id="menuId"
      ref="menu"
      class="share-deal-menu"
      role="menu"
      :aria-label="label"
      :style="{ top: `${place.top}px`, right: `${place.right}px`, transform: place.up ? 'translateY(-100%)' : undefined }"
      data-testid="share-menu"
      @keydown="onMenuKey"
    >
      <button type="button" role="menuitem" class="share-deal-menu__item" data-testid="share-copy" @click="copy">
        <ShellIcon name="copy" :size="18" />Copy link
      </button>
      <a role="menuitem" class="share-deal-menu__item" :href="whatsApp" target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp" @click="close()">
        <span class="share-deal-menu__badge share-deal-menu__badge--whatsapp" aria-hidden="true"><ShellIcon name="chat" :size="14" /></span>WhatsApp
      </a>
      <a role="menuitem" class="share-deal-menu__item" :href="telegram" target="_blank" rel="noopener noreferrer" data-testid="share-telegram" @click="close()">
        <span class="share-deal-menu__badge share-deal-menu__badge--telegram" aria-hidden="true"><ShellIcon name="directions" :size="13" /></span>Telegram
      </a>
      <button v-if="canShareNatively" type="button" role="menuitem" class="share-deal-menu__item" data-testid="share-more" @click="more">
        <ShellIcon name="share" :size="18" />More…
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.share-deal-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.share-deal-menu {
  position: fixed;
  z-index: 1200;
  display: grid;
  min-width: 200px;
  padding: 6px;
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  box-shadow: var(--shadow-card, 0 8px 24px rgb(27 27 31 / 0.14));
  animation: share-menu-in 140ms var(--ease-out);
}
@keyframes share-menu-in {
  from {
    opacity: 0;
  }
}
.share-deal-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--hit);
  padding: 0 12px;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink);
  text-align: left;
  text-decoration: none;
  background: none;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.share-deal-menu__item:hover,
.share-deal-menu__item:focus-visible {
  background: var(--paper-hover);
  outline: none;
}
.share-deal-menu__badge {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  color: #fff;
  border-radius: 50%;
}
.share-deal-menu__badge--whatsapp {
  background: #1f9e55;
}
.share-deal-menu__badge--telegram {
  background: #2481cc;
}
@media (prefers-reduced-motion: reduce) {
  .share-deal-menu {
    animation: none;
  }
}
</style>
