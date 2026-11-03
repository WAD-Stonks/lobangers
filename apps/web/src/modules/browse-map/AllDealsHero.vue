<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import { useHeroEntrance } from '@web/modules/browse-map/use-hero-entrance'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useShell } from '@web/modules/map-shell/shell-state'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const session = authClient.useSession()
const shell = useShell()
const name = computed(() => session.value.data?.user.name?.trim())
const headlineWords = 'ready for a'.split(' ')
const finalWords = 'good lobang?'.split(' ')
const greeting = computed(() => session.value.data ? `Hey ${name.value || 'there'},` : 'Hey food lover,')
const hero = ref<HTMLElement | null>(null)
const greetingWords = computed(() => greeting.value.split(' '))
const sessionReady = computed(() => !session.value.isPending)
useHeroEntrance(hero, greeting, sessionReady)
const stacked = ref(false)
const heroStyle = computed(() => ({
  '--hero-art-width': '760px',
  '--hero-min-height': '230px',
}))
const heading = ref<HTMLElement | null>(null)
const headingSize = ref(36)
let resizeObserver: ResizeObserver | undefined
let lastWidth = 0
let fitRequest = 0
const fitHeading = async () => {
  const request = ++fitRequest
  const heroWidth = hero.value?.clientWidth ?? 0
  if (heroWidth > 0) {
    // Preserve a large illustration and crop its far-right scenery before adding a row.
    // At narrower widths, keep all three pins clear by moving the artwork below the copy.
    stacked.value = heroWidth < 900
  }
  headingSize.value = 36
  await nextTick()
  const element = heading.value
  if (!element || request !== fitRequest) return
  const width = element.clientWidth
  if (width <= 0) return
  const lines = [...element.querySelectorAll<HTMLElement>('.all-deals-hero__greeting, .all-deals-hero__headline')]
  const widest = Math.max(width, ...lines.map(line => line.scrollWidth))
  headingSize.value = widest <= width ? 36 : 36 * (width - 2) / widest
}
watch(greeting, () => { void fitHeading() })
onMounted(() => {
  void fitHeading()
  void document.fonts?.ready.then(() => { if (heading.value) void fitHeading() })
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === lastWidth) return
      lastWidth = entry.contentRect.width
      void fitHeading()
    })
    if (hero.value) resizeObserver.observe(hero.value)
  }
})
onBeforeUnmount(() => { fitRequest++; resizeObserver?.disconnect() })
</script>

<template>
  <section ref="hero" :style="heroStyle" class="all-deals-hero" :class="{ 'all-deals-hero--stacked': stacked }" aria-labelledby="all-deals-hero-title" data-testid="all-deals-hero">
    <div class="all-deals-hero__copy">
      <h2 ref="heading" :style="{ fontSize: `${headingSize}px` }" id="all-deals-hero-title">
        <span class="visually-hidden">{{ greeting }} ready for a good lobang?</span>
        <svg class="all-deals-hero__accent all-deals-hero__accent--coral" viewBox="0 0 80 90" aria-hidden="true"><path d="M12 65L35 68" pathLength="1" style="--ray-index: 0" /><path d="M23 29L45 46" pathLength="1" style="--ray-index: 1" /><path d="M57 9L66 31" pathLength="1" style="--ray-index: 2" /></svg>
        <span class="all-deals-hero__greeting" aria-hidden="true"><template v-for="(word, index) in greetingWords" :key="index"><span class="all-deals-hero__word" data-hero-word>{{ word + (index < greetingWords.length - 1 ? ' ' : '') }}</span></template></span>
        <span class="all-deals-hero__headline" aria-hidden="true"><template v-for="(word, index) in headlineWords" :key="word"><span class="all-deals-hero__word" data-hero-word>{{ `${word} ` }}</span></template><span class="all-deals-hero__underlined"><template v-for="(word, index) in finalWords" :key="word"><span class="all-deals-hero__word" data-hero-word>{{ word + (index === 0 ? ' ' : '') }}</span></template><svg class="all-deals-hero__underline" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path data-hero-underline pathLength="1" d="M4 7Q65 2 112 6T196 5" /></svg><svg class="all-deals-hero__accent all-deals-hero__accent--yellow" viewBox="0 0 70 70" aria-hidden="true"><path d="M30 9L21 30" /><path d="M60 37L40 47" /></svg></span></span>
      </h2>
      <p data-hero-subtitle>Explore nearby food deals, promos, and hidden gems around Singapore.</p>
      <div class="all-deals-hero__actions">
        <button type="button" class="lb-btn lb-btn--primary" data-testid="show-map" @click="shell.setView('map')"><ShellIcon name="map" :size="21" />Show map<ShellIcon name="back" class="all-deals-hero__arrow" :size="21" /></button>
      </div>
    </div>
    <img class="all-deals-hero__art" src="/landing/all-deals-hero-1520.webp" srcset="/landing/all-deals-hero-800.webp 800w, /landing/all-deals-hero-1520.webp 1520w" sizes="(max-width: 699.98px) calc(100vw + 40px), 760px" alt="" aria-hidden="true" width="1520" height="508" />
  </section>
</template>

<style scoped>
@font-face {
  font-family: "Lobang Pop";
  src: url('/fonts/lobang-pop-v6/LobangPop-Heavy.woff2') format('woff2');
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}
/* Banner colours as local roles: cream with black type by day, a warm dark-gold card with light
   type at night. The yellow and coral strokes are brand artwork and stay put. */
.all-deals-hero { --hero-radius: 26px; --hero-edge: #f5e9bd; --hero-glow: #fffbed; --hero-title: #000; --hero-body: #454a44; position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; min-height: var(--hero-min-height, 230px); border: 1px solid var(--hero-edge); border-radius: var(--hero-radius); background: var(--hero-background, #fff9e6); }
.app-palette[data-theme='dark'] .all-deals-hero { --hero-edge: #3d3620; --hero-glow: var(--hero-background); --hero-title: var(--ink); --hero-body: #cfc9b8; }
.all-deals-hero__copy { position: relative; z-index: 1; text-shadow: 0 1px 8px var(--hero-glow), 0 0 16px var(--hero-glow); width: 50%; max-width: 760px; padding: 18px 36px 18px 44px; }
h2 { position: relative; margin: 0 0 10px; font-family: "Lobang Pop", "Arial Black", sans-serif; font-weight: 900; font-size: 2.25rem; line-height: 1.08; letter-spacing: 0; color: var(--hero-title); text-shadow: none; }
.all-deals-hero__greeting { display: block; white-space: nowrap; }
.all-deals-hero__headline { position: relative; display: block; width: 100%; padding-right: 36px; white-space: nowrap; }
.all-deals-hero__word { position: relative; display: inline-block; white-space: pre; }
.all-deals-hero__underlined { position: relative; display: inline-block; }
.all-deals-hero__underline { position: absolute; left: 0; bottom: -.12em; width: 100%; height: .22em; overflow: visible; pointer-events: none; }
.all-deals-hero__underline path { fill: none; stroke: #ffda58; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 0; }
.all-deals-hero__accent { position: absolute; width: 42px; height: 45px; fill: none; stroke-width: 9px; stroke-linecap: round; pointer-events: none; }
.all-deals-hero__accent--coral { width: 30px; height: 36px; top: -10px; left: -32px; stroke: #f77559; }
.all-deals-hero__accent--yellow { width: 33px; height: 33px; right: -36px; top: -16px; stroke: #ffda58; }
p { margin: 0 0 12px; font-size: 1rem; line-height: 1.45; color: var(--hero-body); font-weight: 550; }
/* Keep the pin cluster inside the banner: fixed artwork size, enough vertical clearance,
   and a stacked layout before the image would collide with the heading. */
.all-deals-hero__art { position: absolute; right: clamp(-280px, calc(50% - 730px), -20px); bottom: -24px; width: var(--hero-art-width, 760px); max-width: none; height: auto; min-height: 0; object-position: right bottom; pointer-events: none; }
.all-deals-hero__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 26px; }
.all-deals-hero__actions .lb-btn { gap: 12px; min-width: 200px; min-height: 44px; justify-content: center; padding: 9px 22px; color: var(--on-accent); background: var(--sunny); border-color: var(--sunny); border-radius: var(--hero-radius); font-size: 1rem; font-weight: 750; }
.all-deals-hero__actions .lb-btn {
  transition: transform 200ms ease, box-shadow 200ms ease, background-color 200ms ease;
}
.all-deals-hero__arrow { transform: rotate(180deg); margin-left: 6px; transition: transform 200ms ease; }
@media (hover: hover) and (pointer: fine) {
  .all-deals-hero__actions .lb-btn:hover { transform: translateY(-2px); background: var(--sunny-deep); box-shadow: 0 6px 16px rgb(159 119 15 / .18); }
  .all-deals-hero__actions .lb-btn:hover .all-deals-hero__arrow { transform: translateX(4px) rotate(180deg); }
}
.all-deals-hero__actions .lb-btn:active { transform: translateY(0); box-shadow: none; }
/* Expand downwards whenever the side-by-side artwork would enter the copy's space. */
.all-deals-hero--stacked { flex-direction: column; align-items: stretch; min-height: 0; }
.all-deals-hero--stacked .all-deals-hero__copy { width: 100%; max-width: none; }
.all-deals-hero--stacked .all-deals-hero__art { position: relative; inset: auto; left: auto; right: -20px; bottom: -24px; width: calc(100% + 40px); height: auto; object-fit: contain; align-self: flex-end; flex-shrink: 0; margin-top: -36px; }

@media (max-width: 699.98px) {
  .all-deals-hero { flex-direction: column; align-items: stretch; min-height: 0; --hero-radius: 20px; }
  .all-deals-hero .all-deals-hero__copy { width: 100%; padding: 18px 28px 8px 36px; }
  .all-deals-hero .all-deals-hero__art { position: relative; inset: auto; left: auto; right: -20px; bottom: -24px; align-self: flex-end; width: calc(100% + 40px); height: auto; flex-shrink: 0; margin-top: -24px; object-fit: contain; object-position: right bottom; }
  .all-deals-hero__accent--coral { width: 20px; height: 28px; left: -22px; top: -10px; }
  .all-deals-hero__accent--yellow { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .all-deals-hero__actions .lb-btn, .all-deals-hero__arrow { transition: none; }
  .all-deals-hero__actions .lb-btn:hover { transform: none; }
  .all-deals-hero__actions .lb-btn:hover .all-deals-hero__arrow { transform: rotate(180deg); }
}
</style>
