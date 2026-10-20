import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

// Progressive enhancement: content is visible if observation is unavailable.
export function useLandingMotion(root: Ref<HTMLElement | null>) {
  const pageProgress = ref(0)
  let frame = 0
  let observer: IntersectionObserver | undefined
  let preference: MediaQueryList | undefined
  const paint = () => {
    frame = 0
    if (!preference?.matches) {
      for (const element of root.value?.querySelectorAll('[data-scroll-reveal]') ?? []) {
        const bounds = element.getBoundingClientRect()
        element.classList.toggle(
          'is-revealed',
          window.scrollY > 24 && bounds.top < window.innerHeight * 0.9 && bounds.bottom > 0,
        )
      }
    }
    pageProgress.value = Math.max(
      0,
      Math.min(
        1,
        window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight),
      ),
    )
  }
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(paint)
  }
  const observe = () => {
    observer?.disconnect()
    paint()
    root.value?.classList.remove('landing-motion-ready')
    if (!root.value || preference?.matches || !globalThis.IntersectionObserver) return
    root.value.classList.add('landing-motion-ready')
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (!entry.target.hasAttribute('data-scroll-reveal'))
            entry.target.classList.toggle('is-revealed', entry.isIntersecting)
      },
      { threshold: 0.12 },
    )
    for (const element of root.value.querySelectorAll('[data-reveal]')) observer.observe(element)
  }
  onMounted(() => {
    preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    observe()
    preference?.addEventListener('change', observe)
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue, { passive: true })
    paint()
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    cancelAnimationFrame(frame)
    preference?.removeEventListener('change', observe)
    window.removeEventListener('scroll', queue)
    window.removeEventListener('resize', queue)
  })
  return { pageProgress }
}
