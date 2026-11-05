import { gsap } from 'gsap'
import { nextTick, onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'

export function useHeroEntrance(
  root: Ref<HTMLElement | null>,
  greeting: Ref<string>,
  ready: Ref<boolean> = ref(true),
) {
  let context: gsap.Context | undefined
  let timeline: gsap.core.Timeline | undefined
  let observer: IntersectionObserver | undefined
  let preference: MediaQueryList | undefined
  let started = false

  const reveal = () => {
    started = true
    observer?.disconnect()
    context?.revert()
    timeline = undefined
  }
  const play = () => {
    if (started) return
    started = true
    observer?.disconnect()
    timeline?.play()
  }
  const onPreferenceChange = () => {
    if (preference?.matches) reveal()
  }
  watch(
    greeting,
    () => {
      if (context) reveal()
    },
    { flush: 'pre' },
  )

  const prepare = () => {
    const element = root.value
    if (!element || preference?.matches || started || context) return

    context = gsap.context(() => {
      const words = [...element.querySelectorAll<HTMLElement>('[data-hero-word]')]
      const firstLine = words.filter((word) => word.closest('.all-deals-hero__greeting'))
      const secondLine = words.filter((word) => word.closest('.all-deals-hero__headline'))
      const coral = [
        ...element.querySelectorAll<SVGPathElement>('.all-deals-hero__accent--coral path'),
      ]
      const yellow = [
        ...element.querySelectorAll<SVGPathElement>('.all-deals-hero__accent--yellow path'),
      ]
      const underline = element.querySelector<SVGPathElement>('[data-hero-underline]')
      const subtitle = element.querySelector<HTMLElement>('[data-hero-subtitle]')
      const button = element.querySelector<HTMLButtonElement>('[data-testid="show-map"]')
      const content = [...words, ...coral, ...yellow, subtitle, button].filter(
        (item): item is HTMLElement | SVGPathElement => item !== null,
      )

      timeline = gsap.timeline({ paused: true })
      timeline
        .fromTo(
          firstLine,
          { y: 16, opacity: 0, scale: 0.96 },
          { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.07, ease: 'back.out(1.3)' },
          0,
        )
        .fromTo(
          secondLine,
          { y: 16, opacity: 0, scale: 0.96 },
          { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.07, ease: 'back.out(1.3)' },
          0.3,
        )
        .fromTo(
          coral,
          { scale: 0, x: 6, y: 6, opacity: 0, transformOrigin: '50% 50%' },
          { scale: 1, x: 0, y: 0, opacity: 1, duration: 0.28, stagger: 0.08, ease: 'back.out(2)' },
          0.78,
        )
        .fromTo(
          yellow,
          { scale: 0, x: -6, y: 6, opacity: 0, transformOrigin: '50% 50%' },
          { scale: 1, x: 0, y: 0, opacity: 1, duration: 0.28, stagger: 0.08, ease: 'back.out(2)' },
          0.88,
        )
      if (underline)
        timeline.fromTo(
          underline,
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' },
          0.9,
        )
      if (subtitle)
        timeline.fromTo(
          subtitle,
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.45, ease: 'power2.out' },
          1.05,
        )
      if (button)
        timeline.fromTo(
          button,
          { y: 8, opacity: 0, scale: 0.97 },
          { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.2)' },
          1.2,
        )
      timeline.set(content, { clearProps: 'transform,opacity' }, 1.65)
    }, element)

    element.addEventListener('focusin', reveal)
    if (typeof IntersectionObserver === 'undefined') play()
    else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) play()
        },
        { threshold: 0.15 },
      )
      observer.observe(element)
    }
  }

  onMounted(() => {
    preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    preference?.addEventListener?.('change', onPreferenceChange)
    if (ready.value) prepare()
    watch(
      ready,
      async (resolved) => {
        if (!resolved) return
        await nextTick()
        prepare()
      },
      { flush: 'post' },
    )
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    root.value?.removeEventListener('focusin', reveal)
    preference?.removeEventListener?.('change', onPreferenceChange)
    context?.revert()
  })
}
