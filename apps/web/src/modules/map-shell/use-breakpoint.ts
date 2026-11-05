import { computed, onBeforeUnmount, type Ref, readonly, ref } from 'vue'

export const TABLET_MIN_PX = 768
export const DESKTOP_MIN_PX = 992

export type Breakpoint = 'phone' | 'tablet' | 'desktop'

export const breakpointFor = (width: number): Breakpoint => {
  if (width >= DESKTOP_MIN_PX) return 'desktop'
  return width >= TABLET_MIN_PX ? 'tablet' : 'phone'
}

const readMatchMedia = (): typeof window.matchMedia | null =>
  typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : null

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

export const useFinePointer = (): Readonly<Ref<boolean>> =>
  useMediaQuery('(hover: hover) and (pointer: fine)', true)
