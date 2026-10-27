<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { AreaBounds } from '@web/modules/browse-map/apply-filters'
import { readCartoApiKey, resolveBasemap } from '@web/modules/browse-map/basemap'
import {
  createGroupIcon,
  createStackIcon,
  describeGroup,
  stackRadiusFor,
} from '@web/modules/browse-map/cluster-icon'
import { declutter, type PlacedGroup } from '@web/modules/browse-map/declutter'
import { distanceMetres } from '@web/modules/browse-map/distance'
import {
  FLY_DURATION_S,
  FOCUS_ZOOM,
  MAX_ACCURACY_HALO_METRES,
  MAX_ZOOM,
  MIN_ZOOM,
  NEARBY_PAN_METRES,
  OPEN_MIN_ZOOM,
  PAN_DURATION_S,
  USER_ACCURACY_STYLE,
  USER_DOT_CLASS,
  USER_DOT_SIZE_PX,
} from '@web/modules/browse-map/map-config'
import '@web/modules/browse-map/food-sprite.css'
import {
  AREA_FROM_ZOOM,
  NEAR_PINS_FROM_ZOOM,
  OPEN_GROUP_MAX_ZOOM,
  planMapLayers,
  STREET_FROM_ZOOM,
} from '@web/modules/browse-map/map-tiers'
import { SINGAPORE_BOUNDS, toBoundsTuple } from '@web/modules/browse-map/singapore-bounds'
import type { Coordinates, VenuePin } from '@web/modules/browse-map/types'
import { createVenuePinIcon, type PinState } from '@web/modules/browse-map/venue-pin'
import { type Ambient, mountAmbient } from '@web/modules/map-ambient/ambient-layer'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type MapOffset = { readonly x: number; readonly y: number }

const props = withDefaults(
  defineProps<{
    pins?: readonly VenuePin[]
    focus?: Coordinates | null
    focusZoom?: number
    focusOffset?: MapOffset
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
    focusZoom: FOCUS_ZOOM,
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
let pinLayer: L.MarkerClusterGroup | null = null
let groupLayer: L.LayerGroup | null = null
let selectedLayer: L.LayerGroup | null = null
let planKey = ''
const SETTLED_CLASS = 'is-settled'
let shownPins = new Set<string>()
let groupMarkers = new Map<string, { marker: L.Marker; group: PlacedGroup }>()
let userLayer: L.LayerGroup | null = null
let resizeObserver: ResizeObserver | null = null
let ambient: Ambient | null = null
const markers = new Map<string, { marker: L.Marker; pin: VenuePin; key: string }>()

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

// Every outlet gets its marker once; replan decides which of them are on the map.
const syncPins = (pins: readonly VenuePin[]) => {
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
    markers.set(pin.id, { marker, pin, key: stateKey(state) })
  }
  replan(true)
}

// Tapping a group zooms far enough to break it into the next tier down, and no further.
const openZoomFor = (group: PlacedGroup): number => {
  if (group.kind === 'region') return AREA_FROM_ZOOM
  return group.kind === 'near' ? NEAR_PINS_FROM_ZOOM : STREET_FROM_ZOOM
}

const openGroup = (group: PlacedGroup) => {
  if (!map) return
  const bounds = L.latLngBounds(group.venues.map((venue) => L.latLng(venue.lat, venue.lng)))
  const { top, right, bottom, left } = props.viewPadding
  const fitted = map.getBoundsZoom(bounds, false, L.point(left + right + 80, top + bottom + 80))
  const zoom = Math.min(Math.max(fitted, openZoomFor(group), map.getZoom() + 1), OPEN_GROUP_MAX_ZOOM)
  const centre = group.kind === 'near' ? L.latLng(group.centre.lat, group.centre.lng) : bounds.getCenter()
  map.flyTo(centreFor(centre, zoom), zoom, { animate: !props.reducedMotion, duration: FLY_DURATION_S })
}

const keyOf = (loose: readonly VenuePin[], groups: readonly PlacedGroup[]) =>
  [
    loose.map((pin) => pin.id).join(','),
    groups.map((group) => `${group.key}:${group.dealCount}:${group.compact}`).join(','),
  ].join('|')

// Redraws pins and groups for the current zoom, visitor and selection. Skipped when nothing
// would change, so panning and same-tier zooms stay cheap.
const replan = (force = false) => {
  if (!map || !pinLayer || !groupLayer || !selectedLayer) return
  const zoom = map.getZoom()
  const plan = planMapLayers({
    pins: props.pins,
    zoom,
    user: props.userPosition,
    selectedVenueId: props.selectedVenueId,
  })
  const projector = map
  const groups = declutter(plan.groups, (point) => projector.project([point.lat, point.lng], zoom))
  const key = `${props.selectedVenueId ?? ''}|${keyOf(plan.loose, groups)}`
  if (!force && key === planKey) return
  planKey = key
  syncLoosePins(pinLayer, selectedLayer, plan.loose, force)
  syncGroups(groupLayer, groups)
}

// Pins and pills that stay on the map keep their elements, so a zoom never blinks them out and
// replays their entrance; only ones that newly appear animate in.
const syncLoosePins = (
  layer: L.MarkerClusterGroup,
  selected: L.LayerGroup,
  loose: readonly VenuePin[],
  rebuilt: boolean,
) => {
  const selectedId = loose.some((pin) => pin.id === props.selectedVenueId) ? props.selectedVenueId : null
  const selectedMarker = selectedId ? markers.get(selectedId)?.marker : undefined
  const wanted = new Set(loose.map((pin) => pin.id).filter((id) => id !== selectedId))
  // A marker lives in one layer at a time: let go of the old selection before it rejoins the
  // stacks, and take the new one out of the stacks before it moves here.
  if (rebuilt || !selectedMarker || !selected.hasLayer(selectedMarker)) selected.clearLayers()
  if (rebuilt) {
    layer.clearLayers()
    shownPins = new Set()
  }
  const leaving = [...shownPins].filter((id) => !wanted.has(id))
  const arriving = [...wanted].filter((id) => !shownPins.has(id))
  layer.removeLayers(leaving.flatMap((id) => markers.get(id)?.marker ?? []))
  layer.addLayers(arriving.flatMap((id) => markers.get(id)?.marker ?? []))
  shownPins = wanted
  if (selectedMarker && !selected.hasLayer(selectedMarker)) selected.addLayer(selectedMarker)
}

// What a pill shows; when only this changes (a count, or the compact form at a new zoom) the
// pill is redrawn in place without its entrance.
const groupLook = (group: PlacedGroup) => `${group.dealCount}:${group.compact}`

const syncGroups = (layer: L.LayerGroup, groups: readonly PlacedGroup[]) => {
  const next = new Map(groups.map((group) => [group.key, group]))
  for (const [key, entry] of groupMarkers) {
    if (!next.has(key)) layer.removeLayer(entry.marker)
  }
  groupMarkers = new Map(
    [...next].map(([key, group]) => {
      const kept = groupMarkers.get(key)
      if (!kept) {
        const marker = L.marker([group.centre.lat, group.centre.lng], {
          icon: createGroupIcon(group),
          title: describeGroup(group),
        })
          // Read the latest group at click time: a kept pill's venues can change underneath it.
          .on('click', () => openGroup(groupMarkers.get(key)?.group ?? group))
          .addTo(layer)
        return [key, { marker, group }]
      }
      kept.marker.setLatLng([group.centre.lat, group.centre.lng])
      if (groupLook(kept.group) !== groupLook(group)) {
        kept.marker.setIcon(createGroupIcon(group))
        const element = kept.marker.getElement()
        element?.classList.add(SETTLED_CLASS)
        element?.setAttribute('title', describeGroup(group))
      }
      return [key, { marker: kept.marker, group }]
    }),
  )
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

// Short hops between nearby deals pan; anything further, or a zoom too far out, flies.
const focusOn = (focus: Coordinates, zoom: number) => {
  if (!map) return
  const target = L.latLng(focus.lat, focus.lng)
  const animate = !props.reducedMotion
  const nearby = map.getZoom() >= zoom - 1 && distanceMetres(map.getCenter(), focus) < NEARBY_PAN_METRES
  if (nearby) {
    map.panTo(centreFor(target, map.getZoom()), { animate, duration: PAN_DURATION_S })
    return
  }
  map.flyTo(centreFor(target, zoom), zoom, { animate, duration: FLY_DURATION_S })
}

// The zoom buttons zoom around the middle of the part of the map the visitor can see, not the
// map's true centre, which sits under the panel or sheet.
const zoomBy = (delta: number) => {
  if (!map) return
  const visibleCentre = map.getSize().divideBy(2).add([props.focusOffset.x, props.focusOffset.y])
  map.setZoomAround(visibleCentre, map.getZoom() + delta, { animate: !props.reducedMotion })
}

onMounted(() => {
  if (!container.value) return
  const bounds = L.latLngBounds(toBoundsTuple(SINGAPORE_BOUNDS).map(([lat, lng]) => L.latLng(lat, lng)))
  map = L.map(container.value, {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    // MapControls draws its own zoom buttons in the shell's control stack.
    zoomControl: false,
    zoomAnimation: !props.reducedMotion,
    fadeAnimation: !props.reducedMotion,
    markerZoomAnimation: !props.reducedMotion,
  })
  const { top, right, bottom, left } = props.viewPadding
  const fitted = map.getBoundsZoom(bounds, false, L.point(left + right, top + bottom))
  if (fitted >= OPEN_MIN_ZOOM) {
    map.fitBounds(bounds, { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom] })
  } else {
    map.setView(centreFor(bounds.getCenter(), OPEN_MIN_ZOOM), OPEN_MIN_ZOOM)
  }
  const basemap = resolveBasemap(readCartoApiKey())
  L.tileLayer(basemap.url, {
    attribution: basemap.attribution,
    maxZoom: MAX_ZOOM,
    maxNativeZoom: basemap.maxNativeZoom,
  }).addTo(map)
  pinLayer = L.markerClusterGroup({
    animate: !props.reducedMotion,
    maxClusterRadius: stackRadiusFor,
    showCoverageOnHover: false,
    iconCreateFunction: (stack) => createStackIcon(stack.getChildCount()),
  }).addTo(map)
  groupLayer = L.layerGroup().addTo(map)
  selectedLayer = L.layerGroup().addTo(map)
  userLayer = L.layerGroup().addTo(map)
  ambient = mountAmbient(map, { reducedMotion: props.reducedMotion })
  // Only a drag by the visitor offers "Search this area"; flyTo and panTo never fire dragend.
  map.on('dragend', () => emit('moved'))
  map.on('zoomend', () => replan())
  syncPins(props.pins)
  syncUserPosition(props.userPosition, props.userAccuracyMetres)
  if (props.focus) focusOn(props.focus, props.focusZoom)
  resizeObserver = observeResize(container.value)
})

watch(() => props.pins, syncPins)
watch(
  () => [props.selectedVenueId, props.hoveredVenueId] as const,
  () => {
    syncPinStates()
    replan()
  },
)
watch(
  () => [props.userPosition, props.userAccuracyMetres] as const,
  ([position, accuracy]) => {
    syncUserPosition(position, accuracy)
    replan()
  },
)
watch(
  () => props.focus,
  (focus) => {
    if (focus) focusOn(focus, props.focusZoom)
  },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  ambient?.dispose()
  ambient = null
  map?.remove()
  map = null
  pinLayer = null
  groupLayer = null
  selectedLayer = null
  planKey = ''
  shownPins = new Set()
  groupMarkers = new Map()
  userLayer = null
  markers.clear()
})

defineExpose({
  zoomIn: () => zoomBy(1),
  zoomOut: () => zoomBy(-1),
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

/* The 3D food stands on a soft contact shadow; no disc behind it, so the model is the pin. */
.deal-map :deep(.deal-map-pin__bubble) {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  transition: filter 200ms ease;
}

.deal-map :deep(.deal-map-pin__bubble::before) {
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 30px;
  height: 8px;
  content: '';
  background: radial-gradient(closest-side, rgba(60, 45, 25, 0.28), rgba(60, 45, 25, 0));
  transform: translateX(-50%);
}

.deal-map :deep(.deal-map-pin__bubble .food-sprite) {
  position: relative;
  width: 52px;
  height: 52px;
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
  filter: drop-shadow(0 0 4px var(--coral));
}

.deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__stack) {
  transform: translate(-50%, -50%) translateY(-4px) scale(1.15);
  animation: pin-bounce 220ms var(--ease-out);
}

/* Other pins stay at full strength while a deal is open, so the next one is easy to find; the
   selected pin stands out by size, lift and glow instead. */

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

/* Groups: one sunny pill holding the area name and, on a white inset, the deal count. "Near
   you" is sky blue like the visitor's dot; regions are a size up; a crowded group shrinks to a
   count dot. The icon is a zero-size anchor, so the pill centres itself on the point. */
.deal-map :deep(.deal-map-cluster) {
  background: transparent;
  border: 0;
}

.deal-map :deep(.deal-map-cluster__chip) {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 180px;
  padding: 5px 5px 5px 12px;
  white-space: nowrap;
  background: var(--sunny);
  border: 2px solid var(--paper-white);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
  transform: translate(-50%, -50%);
  transition:
    transform 160ms ease-out,
    background-color 150ms ease;
  animation: deal-map-group-in 200ms var(--ease-out);
  cursor: pointer;
}

.deal-map :deep(.deal-map-cluster__chip--near) {
  background: var(--sky-strong);
}

.deal-map :deep(.deal-map-cluster__chip--near .deal-map-cluster__name) {
  color: var(--paper-white);
}

.deal-map :deep(.deal-map-cluster__chip--region) {
  padding: 7px 7px 7px 16px;
  gap: 9px;
}

.deal-map :deep(.deal-map-cluster__chip--region .deal-map-cluster__name) {
  font-size: var(--text-md);
}

.deal-map :deep(.deal-map-cluster__chip--compact) {
  padding: 3px;
}

.deal-map :deep(.deal-map-cluster__chip:active) {
  transform: translate(-50%, -50%) scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .deal-map :deep(.deal-map-cluster__chip:hover) {
    background: var(--sunny-deep);
  }

  .deal-map :deep(.deal-map-cluster__chip--near:hover) {
    background: var(--sky-strong-hover);
  }
}

.deal-map :deep(.deal-map-cluster__name) {
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1;
  color: var(--ink);
}

.deal-map :deep(.deal-map-cluster__count) {
  flex: none;
  min-width: 24px;
  box-sizing: border-box;
  padding: 4px 7px;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1;
  text-align: center;
  color: var(--ink);
  background: var(--paper-white);
  border-radius: var(--radius-pill);
}

/* Outlets sharing one spot (a food court) before they spread out at the closest zoom. */
.deal-map :deep(.deal-map-stack) {
  background: transparent;
  border: 0;
}

.deal-map :deep(.deal-map-stack__chip) {
  position: absolute;
  left: 0;
  top: 0;
  padding: 7px 11px;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1;
  color: var(--paper-white);
  background: var(--ink-strong);
  border: 2px solid var(--paper-white);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
  transform: translate(-50%, -50%);
  transition:
    transform 160ms ease-out,
    background-color 150ms ease;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .deal-map :deep(.deal-map-stack__chip:hover) {
    background: var(--ink-strong-hover);
  }
}

.deal-map :deep(.deal-map-stack__chip:active) {
  transform: translate(-50%, -50%) scale(0.97);
}

/* Group and stack markers are zero-size anchors, so the browser's outline has nothing to draw
   around; the ring goes on the pill itself, as it does on a pin's bubble. */
.deal-map :deep(.deal-map-cluster:focus-visible),
.deal-map :deep(.deal-map-stack:focus-visible) {
  outline: none;
}

.deal-map :deep(.deal-map-cluster:focus-visible .deal-map-cluster__chip),
.deal-map :deep(.deal-map-stack:focus-visible .deal-map-stack__chip) {
  box-shadow:
    0 0 0 3px var(--sunny-ring),
    var(--shadow-pill);
}

/* Pills appear as the map changes tier; a short ease-out keeps the swap from flashing. */
/* A pill redrawn in place (new count or form) is already on screen, so it skips the entrance. */
.deal-map :deep(.deal-map-cluster.is-settled .deal-map-cluster__chip) {
  animation: none;
}

@keyframes deal-map-group-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
}

@keyframes deal-map-group-fade {
  from {
    opacity: 0;
  }
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
    transform: translate(-50%, -50%) translateY(-6px) scale(1.25);
  }

  to {
    transform: translate(-50%, -50%) translateY(-4px) scale(1.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  .deal-map :deep(.deal-map-cluster__chip) {
    animation-name: deal-map-group-fade;
  }

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
