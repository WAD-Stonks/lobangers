<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{ paused: boolean }>()
const spinning = ref(false)
const splashing = ref(false)
const stopped = computed(() => props.paused)
const streamArc = 'M1137 731Q1096 695 1082 821'
const spray = Array.from({ length: 14 }, (_, index) => {
  const angle = Math.PI * (index / 13)
  return {
    x: Math.cos(angle) * (24 + (index % 3) * 10),
    y: -22 - Math.sin(angle) * 38,
    radius: 1.7 + (index % 3) * 0.65,
    delay: `${(index % 4) * 0.055}s`,
  }
})
let splashFrame = 0
let spinTimer: ReturnType<typeof setTimeout> | undefined
let splashTimer: ReturnType<typeof setTimeout> | undefined
function spin() {
  spinning.value = true
  clearTimeout(spinTimer)
  spinTimer = setTimeout(() => {
    spinning.value = false
  }, 3200)
}
function splash() {
  splashing.value = false
  clearTimeout(splashTimer)
  cancelAnimationFrame(splashFrame)
  splashFrame = requestAnimationFrame(() => {
    splashing.value = true
    splashTimer = setTimeout(() => {
      splashing.value = false
    }, 1800)
  })
}
onBeforeUnmount(() => {
  cancelAnimationFrame(splashFrame)
  clearTimeout(spinTimer)
  clearTimeout(splashTimer)
})
</script>

<template>
  <div class="hero-waterfront" :class="{ 'waterfront-paused': stopped, 'flyer-spinning': spinning, 'merlion-splashing': splashing }">
    <svg class="waterfront-art" viewBox="0 0 1536 1024" aria-hidden="true" focusable="false">
      <g class="waterfront-waves" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" opacity="0.8">
        <path d="M799 942q19 17 38 0q19 17 38 0 M1351 752q18 15 36 0q18 15 36 0 M303 844q12 12 24 0q12 12 24 0" />
      </g>
      <g class="hero-cableway" fill="none" stroke="#284955" stroke-linecap="round">
        <path d="M467 811Q520 835 572 795" stroke-width="2.5" />
        <path d="M467 808V814M572 792V798" stroke-width="3" />
      </g>
      <g class="hero-cable-car-travel">
        <path d="M-6 0H6" stroke="#284955" stroke-width="4" stroke-linecap="round" />
        <g class="hero-cable-car-sway">
          <path d="M0 0V16" fill="none" stroke="#183e58" stroke-width="3" />
          <path d="M-15 16H15L20 21H-20Z" fill="#164c70" />
          <path d="M-20 21Q-27 33-20 45Q-15 53 0 53Q15 53 20 45Q27 33 20 21Z" fill="#0877bb" stroke="#103f65" stroke-width="3" />
          <path d="M-17 25H-6V39H-19Q-22 32-17 25Z M-2 25H8V39H-2Z M12 25H17Q22 32 19 39H12Z" fill="#8bdef3" />
          <path d="M-15 45Q0 49 15 45" fill="none" stroke="#4bb8de" stroke-width="2" stroke-linecap="round" />
        </g>
      </g>
      <g class="hero-ferry-route">
        <g class="hero-ferry-bob">
          <g class="hero-ferry-wake-direction">
            <g class="hero-ferry-wake" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.7">
              <path d="M-75 17q-16 4-29 0 M-83 25q-18 4-32 0 M-73 32q-16 3-28 0" />
            </g>
          </g>
          <path d="M-77 12H79L65 33H-59Z" fill="#f45d40" stroke="#fffaf0" stroke-width="4" />
          <path d="M-64 11L-47-16H47L62 11Z" fill="#fffdf6" />
          <path d="M-34-16L-27-34H25L33-16Z" fill="#fffdf6" />
          <path d="M-3-34V-44H7V-34Z" fill="#164c70" />
          <g fill="#154d78">
            <rect v-for="i in 7" :key="i" :x="-51 + i * 12" y="-9" width="8" height="12" rx="2" />
            <rect v-for="i in 4" :key="`upper-${i}`" :x="-31 + i * 11" y="-29" width="8" height="10" rx="1" />
          </g>
        </g>
      </g>
      <g class="merlion-jets" fill="none" stroke-linecap="round">
        <path class="merlion-stream-core" d="M1137 729Q1093 691 1078 821L1086 822Q1101 703 1137 733Z" fill="#d9f6ff" />
        <path class="merlion-stream-edge" :d="streamArc" stroke="#8ad7ec" stroke-width="4.5" />
        <path class="merlion-stream-flow" :d="streamArc" stroke="white" stroke-width="2.5" />
        <path class="merlion-stream-sheen" d="M1136 731Q1098 700 1083 815" stroke="#f7feff" stroke-width="1.5" />
        <g class="merlion-droplets" fill="#f4fdff">
          <ellipse cx="1080" cy="817" rx="1.6" ry="3" /><circle cx="1075" cy="827" r="2.5" /><circle cx="1092" cy="825" r="2" />
        </g>
        <ellipse class="merlion-water-ripple" cx="1082" cy="827" rx="18" ry="4.5" stroke="#e8fbff" stroke-width="2" />
      </g>
      <g v-if="splashing" class="merlion-burst" fill="none" stroke-linecap="round">
        <path class="merlion-surge" :d="streamArc" stroke="#f4fdff" stroke-width="6" />
        <g transform="translate(1082 825)">
          <ellipse class="merlion-burst-ring" rx="18" ry="5" stroke="white" stroke-width="3" />
          <ellipse class="merlion-burst-ring burst-ring-second" rx="18" ry="5" stroke="#d3faff" stroke-width="2" />
          <circle v-for="(drop, index) in spray" :key="index" class="merlion-spray-drop" :r="drop.radius" fill="#fff" :style="{ '--spray-x': `${drop.x}px`, '--spray-y': `${drop.y}px`, animationDelay: drop.delay }" />
          <path class="merlion-splash-crown" d="M-22 0L-27-17L-11-8L-6-25L3-8L15-22L17-7L30-13L24 0" stroke="#f4fdff" stroke-width="3" />
        </g>
      </g>
    </svg>
    <button type="button" class="hero-landmark hero-flyer" aria-label="Spin the Singapore Flyer" @click="spin">
      <svg viewBox="0 0 124 150" aria-hidden="true" focusable="false">
        <!-- An opaque backing covers every spoke of the raster wheel. -->
        <circle cx="62" cy="62" r="64" fill="#fff1d2" />
        <path d="M39 144L62 73L86 144" fill="none" stroke="#314d5a" stroke-width="7" stroke-linejoin="round" />
        <g class="hero-flyer-wheel">
          <circle cx="62" cy="62" r="55" fill="#fff1d2" stroke="#1e3037" stroke-width="3" />
          <circle cx="62" cy="62" r="49" fill="none" stroke="#1e3037" stroke-width="2" />
          <g v-for="i in 12" :key="i" :transform="`rotate(${i * 30} 62 62)`">
            <path d="M62 62V9" stroke="#1e3037" stroke-width="2" />
            <rect x="58" y="2" width="8" height="8" rx="3" fill="#fff8e6" stroke="#1e3037" stroke-width="2" />
          </g>
          <circle cx="62" cy="62" r="5" fill="#1e3037" />
        </g>
      </svg>
      <span class="landmark-hint">Give it a spin ↻</span>
    </button>
    <button type="button" class="hero-landmark hero-merlion" aria-label="Make a splash at the Merlion" @click="splash">
      <span class="landmark-hint">A little splash! ✦</span>
    </button>
  </div>
</template>
