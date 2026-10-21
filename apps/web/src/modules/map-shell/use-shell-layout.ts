import type { MapOffset } from '@web/modules/browse-map/DealMap.vue'
import type { Breakpoint } from '@web/modules/map-shell/use-breakpoint'
import { computed, onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

// Geometry shared by the panel, controls, hot card and map: header height, the bottom sheet's
// three snap heights and where the visible map centre is. Exposed as CSS custom properties so
// the static layout stays in stylesheets and only these numbers are inline.
// Panel and sheet sizes from the Prototype board: a right-hand card on desktop (narrower on
// tablet landscape) and a bottom sheet that opens at 46% (tablet) or 58% (phone) of the screen.
// Sized for the 90% desktop type scale in main.css (420 / 360 at full size).
export const PANEL_WIDTH_PX = 380
export const PANEL_WIDTH_COMPACT_PX = 340
export const WIDE_PANEL_MAX_PX = 760
export const WIDE_PANEL_RATIO = 0.62
export const WIDE_PANEL_COMPACT_MAX_PX = 640
export const WIDE_PANEL_COMPACT_RATIO = 0.58
const COMPACT_DESKTOP_MAX_PX = 1279
const SHEET_HALF_RATIO = { phone: 0.58, tablet: 0.46 } as const
export const SHEET_PEEK_PX = 120
const SHEET_GAP_PX = 8
const SHEET_MIN_STEP_PX = 60
const DESKTOP_GUTTER_PX = 16
const FALLBACK_HEADER_BOTTOM_PX = 128
const FALLBACK_VIEWPORT = { width: 1280, height: 800 }

type Options = {
  readonly breakpoint: Readonly<Ref<Breakpoint>>
  /** The panel's settled shape: the map frames itself for this. */
  readonly wide: Readonly<Ref<boolean>>
  /** The width the panel is drawn at, which trails `wide` while it animates. Defaults to `wide`. */
  readonly panelWide?: Readonly<Ref<boolean>>
  readonly header: Readonly<Ref<HTMLElement | null>>
  /** Desktop only: the panel is tucked off the right edge, so the whole map is visible. */
  readonly collapsed?: Readonly<Ref<boolean>>
}

const viewportSize = () =>
  typeof window === 'undefined' || !window.innerHeight
    ? FALLBACK_VIEWPORT
    : { width: window.innerWidth, height: window.innerHeight }

export const sheetHeights = (
  viewportHeight: number,
  headerBottom: number,
  halfRatio: number = SHEET_HALF_RATIO.tablet,
): readonly number[] => {
  const full = Math.max(
    SHEET_PEEK_PX + 2 * SHEET_MIN_STEP_PX,
    viewportHeight - headerBottom - SHEET_GAP_PX,
  )
  const half = Math.min(
    full - SHEET_MIN_STEP_PX,
    Math.max(SHEET_PEEK_PX + SHEET_MIN_STEP_PX, Math.round(viewportHeight * halfRatio)),
  )
  return [SHEET_PEEK_PX, half, full]
}

export const panelWidthFor = (viewportWidth: number, wide: boolean): number => {
  const compact = viewportWidth <= COMPACT_DESKTOP_MAX_PX
  if (!wide) return compact ? PANEL_WIDTH_COMPACT_PX : PANEL_WIDTH_PX
  const [max, ratio] = compact
    ? [WIDE_PANEL_COMPACT_MAX_PX, WIDE_PANEL_COMPACT_RATIO]
    : [WIDE_PANEL_MAX_PX, WIDE_PANEL_RATIO]
  return Math.min(max, Math.round(viewportWidth * ratio))
}

export const useShellLayout = ({
  breakpoint,
  wide,
  panelWide = wide,
  header,
  collapsed = ref(false),
}: Options) => {
  const viewport = ref(viewportSize())
  const headerBottom = ref(FALLBACK_HEADER_BOTTOM_PX)
  const snap = ref(1)
  let observer: ResizeObserver | null = null

  const measure = () => {
    viewport.value = viewportSize()
    const rect = header.value?.getBoundingClientRect()
    if (rect && rect.bottom > 0) headerBottom.value = Math.round(rect.bottom)
  }

  onMounted(() => {
    measure()
    window.addEventListener('resize', measure)
    if (typeof ResizeObserver !== 'undefined' && header.value) {
      observer = new ResizeObserver(measure)
      observer.observe(header.value)
    }
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', measure)
    observer?.disconnect()
  })

  const mode = computed(() => (breakpoint.value === 'desktop' ? 'side' : 'sheet'))
  const heights = computed(() =>
    sheetHeights(
      viewport.value.height,
      headerBottom.value,
      breakpoint.value === 'phone' ? SHEET_HALF_RATIO.phone : SHEET_HALF_RATIO.tablet,
    ),
  )
  const sheetVisible = computed(() =>
    mode.value === 'sheet' ? (heights.value[snap.value] ?? 0) : 0,
  )
  const widthFor = (isWide: boolean) => panelWidthFor(viewport.value.width, isWide)
  const panelWidth = computed(() => widthFor(wide.value))

  // How much of the map's right side the desktop panel covers; none while it is collapsed.
  const sideCover = computed(() => (collapsed.value ? 0 : panelWidth.value + 2 * DESKTOP_GUTTER_PX))

  // How far the visible map centre sits from the map's real centre.
  const focusOffset = computed<MapOffset>(() =>
    mode.value === 'side'
      ? // The panel covers the right, so the visible centre sits left of the map's centre.
        { x: 0 - Math.round(sideCover.value / 2), y: 0 }
      : { x: 0, y: -Math.round(sheetVisible.value / 2) },
  )

  // What covers the map: the panel on the right (desktop) or the header and sheet (below).
  const viewPadding = computed(() =>
    mode.value === 'side'
      ? { top: 0, right: sideCover.value, bottom: 0, left: 0 }
      : { top: headerBottom.value, right: 0, bottom: sheetVisible.value, left: 0 },
  )

  const cssVars = computed(() => ({
    '--shell-header-bottom': `${headerBottom.value}px`,
    '--sheet-visible': `${sheetVisible.value}px`,
    '--panel-w': `${widthFor(panelWide.value)}px`,
  }))

  return {
    mode,
    heights,
    snap,
    sheetVisible,
    focusOffset,
    viewPadding,
    cssVars,
    panelWidth,
    widthFor,
  }
}
