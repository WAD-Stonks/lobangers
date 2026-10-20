import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

export const clamp = (n: number) => Math.max(0, Math.min(1, n))
export const segment = (n: number, start: number, end: number) => {
  const t = clamp((n - start) / (end - start))
  return t * t * (3 - 2 * t)
}

// One scroll reader per story, coalesced to a frame. No scroll interception.
export function useStoryProgress(element: Ref<HTMLElement | null>) {
  const progress = ref(0)
  const reduced = ref(false)
  const viewport = ref({ width: 1440, height: 900 })
  let frame = 0
  let query: MediaQueryList | undefined
  const update = () => {
    frame = 0
    viewport.value = { width: window.innerWidth, height: window.innerHeight }
    if (!element.value) return
    const rect = element.value.getBoundingClientRect()
    progress.value = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight))
  }
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  const motion = () => {
    reduced.value = query?.matches ?? false
    queue()
  }
  onMounted(() => {
    query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    motion()
    query?.addEventListener('change', motion)
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue, { passive: true })
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    query?.removeEventListener('change', motion)
    window.removeEventListener('scroll', queue)
    window.removeEventListener('resize', queue)
  })
  return { progress, reduced, viewport }
}
