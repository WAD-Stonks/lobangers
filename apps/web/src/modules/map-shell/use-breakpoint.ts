import { computed, onBeforeUnmount, type Ref, readonly, ref } from 'vue'

// Bootstrap's md and lg edges, so d-md-* and d-lg-* utilities line up with the shell's layout.
export const TABLET_MIN_PX = 768
export const DESKTOP_MIN_PX = 992

export type Breakpoint = 'phone' | 'tablet' | 'desktop'

export const breakpointFor = (width: number): Breakpoint => {
  if (width >= DESKTOP_MIN_PX) return 'desktop'
  return width >= TABLET_MIN_PX ? 'tablet' : 'phone'
}

const readMatchMedia = (): typeof window.matchMedia | null =>
  typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : null

// Live answer to one media query. Without matchMedia (jsdom, old browsers) it stays at `fallback`.
export const useMediaQuery = (query: string, fallback = false): Readonly<Ref<boolean>> => {
  const matchMedia = readMatchMedia()
  const matches = ref(fallback)
  if (!matchMedia) return readonly(matches)

  const list = matchMedia(query)
  const update = () => {
    matches.value = list.matches
  }
  update()
  list.addEventListener('change', update)
  onBeforeUnmount(() => list.removeEventListener('change', update))
  return readonly(matches)
}

// Without matchMedia the layout assumes desktop, the widest and least surprising default.
export const useBreakpoint = (): Readonly<Ref<Breakpoint>> => {
  const tablet = useMediaQuery(`(min-width: ${TABLET_MIN_PX}px)`, true)
  const desktop = useMediaQuery(`(min-width: ${DESKTOP_MIN_PX}px)`, true)
  return computed(() => {
    if (desktop.value) return 'desktop'
    return tablet.value ? 'tablet' : 'phone'
  })
}

export const usePrefersReducedMotion = (): Readonly<Ref<boolean>> =>
  useMediaQuery('(prefers-reduced-motion: reduce)')

// Real pointer that can hover; touch screens skip hover linking between rows and pins.
export const useFinePointer = (): Readonly<Ref<boolean>> =>
  useMediaQuery('(hover: hover) and (pointer: fine)', true)
