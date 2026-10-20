<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { AreaBounds } from '@web/modules/browse-map/apply-filters'
import { readCartoApiKey, resolveBasemap } from '@web/modules/browse-map/basemap'
import { distanceMetres } from '@web/modules/browse-map/distance'
import {
  BOUNDS_VISCOSITY,
  CLUSTER_ICON_PX,
  FLY_DURATION_S,
  FOCUS_ZOOM,
  MAX_ACCURACY_HALO_METRES,
  MAX_ZOOM,
  MIN_ZOOM,
  NEARBY_PAN_METRES,
  PAN_DURATION_S,
  USER_ACCURACY_STYLE,
  USER_DOT_CLASS,
  USER_DOT_SIZE_PX,
} from '@web/modules/browse-map/map-config'
import { SINGAPORE_BOUNDS, toBoundsTuple } from '@web/modules/browse-map/singapore-bounds'
import type { Coordinates, VenuePin } from '@web/modules/browse-map/types'
import { createVenuePinIcon, type PinState } from '@web/modules/browse-map/venue-pin'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type MapOffset = { readonly x: number; readonly y: number }

// The map stays mounted for the whole shell. It opens fitted to Singapore; `focus` later flies
// to a point. `focusOffset` is how far the visible centre sits from the map's centre (the side
// panel or bottom sheet covers part of it), so a focused pin lands beside the panel.
const props = withDefaults(
  defineProps<{
    pins?: readonly VenuePin[]
    focus?: Coordinates | null
    focusOffset?: MapOffset
    // Pixels the panel, sheet or header cover on each side; the first fit keeps the island clear of them.
    viewPadding?: { top: number; right: number; bottom: number; left: number }
    userPosition?: Coordinates | null
    userAccuracyMetres?: number | null
    selectedVenueId?: string | null
    hoveredVenueId?: string | null
    hoverEnabled?: boolean
    reducedMotion?: boolean
  }>(),
  {
    pins: () => [],
    focus: null,
    focusOffset: () => ({ x: 0, y: 0 }),
    viewPadding: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    userPosition: null,
    userAccuracyMetres: null,
    selectedVenueId: null,
    hoveredVenueId: null,
    hoverEnabled: true,
    reducedMotion: false,
  },
)
const emit = defineEmits<{ select: [id: string]; hover: [id: string | null]; moved: [] }>()

const container = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let cluster: L.MarkerClusterGroup | null = null
let userLayer: L.LayerGroup | null = null
let resizeObserver: ResizeObserver | null = null
const markers = new Map<string, { marker: L.Marker; pin: VenuePin; key: string }>()

// The canvas resizes the map when the list panel opens; Leaflet must re-measure its container.
const observeResize = (element: HTMLElement) => {
  if (typeof ResizeObserver === 'undefined') return null
  const observer = new ResizeObserver(() => map?.invalidateSize({ animate: false }))
  observer.observe(element)
  return observer
}

const pinTitle = (pin: VenuePin) =>
  pin.deals.length === 1 ? `${pin.deals[0]?.title} at ${pin.name}` : `${pin.deals.length} deals at ${pin.name}`

const stateFor = (venueId: string): PinState => ({
  selected: props.selectedVenueId === venueId,
  dimmed: props.selectedVenueId !== null && props.selectedVenueId !== venueId,
  hot: props.hoveredVenueId === venueId,
})
const stateKey = (state: PinState) => `${state.selected}${state.dimmed}${state.hot}`

const syncPins = (pins: readonly VenuePin[]) => {
  if (!cluster) return
  cluster.clearLayers()
  markers.clear()
  for (const pin of pins) {
    const title = pinTitle(pin)
    const state = stateFor(pin.id)
    const marker = L.marker([pin.lat, pin.lng], {
      icon: createVenuePinIcon(pin, state),
      title,
      alt: title,
      riseOnHover: true,
    })
      .on('click', () => emit('select', pin.id))
      .on('mouseover', () => props.hoverEnabled && emit('hover', pin.id))
      .on('mouseout', () => props.hoverEnabled && emit('hover', null))
    marker.addTo(cluster)
    markers.set(pin.id, { marker, pin, key: stateKey(state) })
  }
}

// Only markers whose state changed get a new icon, so hovering a row stays cheap.
const syncPinStates = () => {
  for (const [id, entry] of markers) {
    const state = stateFor(id)
    const key = stateKey(state)
    if (key === entry.key) continue
    entry.marker.setIcon(createVenuePinIcon(entry.pin, state))
    entry.marker.setZIndexOffset(state.selected || state.hot ? 1000 : 0)
    markers.set(id, { ...entry, key })
  }
}

const syncUserPosition = (position: Coordinates | null, accuracy: number | null) => {
  if (!userLayer) return
  userLayer.clearLayers()
  if (!position) return
  const latLng = L.latLng(position.lat, position.lng)
  if (accuracy !== null && accuracy <= MAX_ACCURACY_HALO_METRES) {
    L.circle(latLng, { ...USER_ACCURACY_STYLE, radius: accuracy, interactive: false }).addTo(userLayer)
  }
  const icon = L.divIcon({
    className: USER_DOT_CLASS,
    iconSize: [USER_DOT_SIZE_PX, USER_DOT_SIZE_PX],
    iconAnchor: [USER_DOT_SIZE_PX / 2, USER_DOT_SIZE_PX / 2],
  })
  L.marker(latLng, { icon, interactive: false, keyboard: false, alt: 'You are here' })
    .bindTooltip('You are here', { direction: 'top', offset: [0, -USER_DOT_SIZE_PX / 2] })
    .addTo(userLayer)
}

// Where the map centre must go so `target` shows at the visible centre beside the panel.
const centreFor = (target: L.LatLng, zoom: number): L.LatLng => {
  if (!map) return target
  const point = map.project(target, zoom).subtract([props.focusOffset.x, props.focusOffset.y])
  return map.unproject(point, zoom)
}

// Short hops between nearby deals pan; anything further flies.
const focusOn = (focus: Coordinates) => {
  if (!map) return
  const target = L.latLng(focus.lat, focus.lng)
  const animate = !props.reducedMotion
  const nearby =
    map.getZoom() >= FOCUS_ZOOM - 1 && distanceMetres(map.getCenter(), focus) < NEARBY_PAN_METRES
  if (nearby) {
    map.panTo(centreFor(target, map.getZoom()), { animate, duration: PAN_DURATION_S })
    return
  }
  map.flyTo(centreFor(target, FOCUS_ZOOM), FOCUS_ZOOM, { animate, duration: FLY_DURATION_S })
}

onMounted(() => {
  if (!container.value) return
  const bounds = L.latLngBounds(toBoundsTuple(SINGAPORE_BOUNDS).map(([lat, lng]) => L.latLng(lat, lng)))
  map = L.map(container.value, {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBounds: bounds,
    maxBoundsViscosity: BOUNDS_VISCOSITY,
    // MapControls draws its own zoom buttons in the shell's control stack.
    zoomControl: false,
    zoomAnimation: !props.reducedMotion,
    fadeAnimation: !props.reducedMotion,
    markerZoomAnimation: !props.reducedMotion,
  })
  const { top, right, bottom, left } = props.viewPadding
  map.fitBounds(bounds, { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom] })
  const basemap = resolveBasemap(readCartoApiKey())
  L.tileLayer(basemap.url, { attribution: basemap.attribution, maxZoom: MAX_ZOOM }).addTo(map)
  cluster = L.markerClusterGroup({
    animate: !props.reducedMotion,
    // 44px so a cluster is as easy to tap as any other control.
    iconCreateFunction: (group) =>
      L.divIcon({
        html: `<div><span>${group.getChildCount()}</span></div>`,
        className: 'marker-cluster',
        iconSize: L.point(CLUSTER_ICON_PX, CLUSTER_ICON_PX),
      }),
  })
  cluster.addTo(map)
  userLayer = L.layerGroup().addTo(map)
  // Only a drag by the visitor offers "Search this area"; flyTo and panTo never fire dragend.
  map.on('dragend', () => emit('moved'))
  syncPins(props.pins)
  syncUserPosition(props.userPosition, props.userAccuracyMetres)
  if (props.focus) focusOn(props.focus)
  resizeObserver = observeResize(container.value)
})

watch(() => props.pins, syncPins)
watch(() => [props.selectedVenueId, props.hoveredVenueId] as const, syncPinStates)
watch(
  () => [props.userPosition, props.userAccuracyMetres] as const,
  ([position, accuracy]) => syncUserPosition(position, accuracy),
)
watch(
  () => props.focus,
  (focus) => {
    if (focus) focusOn(focus)
  },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
  cluster = null
  userLayer = null
  markers.clear()
})

defineExpose({
  zoomIn: () => map?.zoomIn(1, { animate: !props.reducedMotion }),
  zoomOut: () => map?.zoomOut(1, { animate: !props.reducedMotion }),
  getArea: (): AreaBounds | null => {
    const bounds = map?.getBounds()
    return bounds
      ? { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() }
      : null
  },
})
</script>

<template>
  <div class="deal-map-region" data-testid="deal-map">
    <div ref="container" class="deal-map" />
  </div>
</template>

<style scoped>
.deal-map-region,
.deal-map {
  position: relative;
  width: 100%;
  height: 100%;
}

.deal-map :deep(.leaflet-container) {
  font-family: var(--font-sans);
  background: var(--map-canvas);
}

.deal-map :deep(.deal-map-pin) {
  background: transparent;
  border: 0;
}

/* Bubble centred on the outlet, badge hanging just below it. */
.deal-map :deep(.deal-map-pin__stack) {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transform: translate(-50%, -50%);
  transition:
    transform 200ms var(--ease-out),
    opacity 200ms ease;
}

.deal-map :deep(.deal-map-pin__bubble) {
  position: relative;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 44px;
  height: 44px;
  color: var(--ink);
  background: var(--pin-tint, var(--tint-other));
  border: 3px solid var(--paper-white);
  border-radius: 50%;
  box-shadow: var(--shadow-pill);
  transition: border-color 200ms ease;
}

.deal-map :deep(.deal-map-pin__bubble svg) {
  width: 20px;
  height: 20px;
}

.deal-map :deep(.deal-map-pin__flag) {
  position: absolute;
  top: -5px;
  right: -7px;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  color: var(--paper-white);
  border: 2px solid var(--paper-white);
  border-radius: 50%;
}

.deal-map :deep(.deal-map-pin__flag svg) {
  width: 9px;
  height: 9px;
}

.deal-map :deep(.deal-map-pin__flag--verified) {
  background: var(--ok);
}

.deal-map :deep(.deal-map-pin__flag--ending) {
  background: var(--coral);
}

.deal-map :deep(.deal-map-pin__badge) {
  padding: 2px 9px;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  color: var(--paper-white);
  background: var(--ink-strong);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
}

.deal-map :deep(.deal-map-pin.is-hot .deal-map-pin__stack) {
  transform: translate(-50%, -50%) translateY(-6px) scale(1.1);
}

.deal-map :deep(.deal-map-pin.is-hot .deal-map-pin__badge),
.deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__badge) {
  background: var(--coral);
}

.deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__bubble) {
  border-color: var(--coral);
}

.deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__stack) {
  animation: pin-bounce 220ms var(--ease-out);
}

.deal-map :deep(.deal-map-pin.is-dimmed .deal-map-pin__stack) {
  opacity: 0.4;
}

@media (hover: hover) and (pointer: fine) {
  .deal-map :deep(.deal-map-pin:hover .deal-map-pin__stack) {
    transform: translate(-50%, -50%) translateY(-4px);
  }
}

.deal-map :deep(.deal-map-pin:focus-visible) {
  outline: none;
}

.deal-map :deep(.deal-map-pin:focus-visible .deal-map-pin__bubble) {
  box-shadow: 0 0 0 3px var(--sunny-ring);
}

/* Cluster bubbles: a soft sunny ring around a solid sunny count. */
.deal-map :deep(.marker-cluster) {
  background: var(--sunny-soft);
}

.deal-map :deep(.marker-cluster div) {
  width: 34px;
  height: 34px;
  margin: 5px;
  line-height: 34px;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--ink);
  background: var(--sunny);
}

/* "You are here": sky-blue dot with a white ring over the soft accuracy halo. */
.deal-map :deep(.deal-map-user-dot) {
  box-sizing: border-box;
  background: var(--sky);
  border: 3px solid var(--paper-white);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(27, 27, 31, 0.3);
}

.deal-map :deep(.leaflet-control-attribution) {
  color: var(--ink-muted);
  background: rgba(255, 255, 255, 0.85);
  border-top-left-radius: var(--radius-control);
}

.deal-map :deep(.leaflet-control-attribution a) {
  color: var(--ink);
}

@keyframes pin-bounce {
  40% {
    transform: translate(-50%, -50%) scale(1.12);
  }

  to {
    transform: translate(-50%, -50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .deal-map :deep(.deal-map-pin__stack) {
    transition: opacity 150ms ease;
  }

  .deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__stack) {
    animation: none;
  }

  .deal-map :deep(.deal-map-pin.is-hot .deal-map-pin__stack) {
    transform: translate(-50%, -50%);
  }
}
</style>
