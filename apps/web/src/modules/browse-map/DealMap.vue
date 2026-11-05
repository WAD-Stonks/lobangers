<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import { useTheme } from '@web/lib/theme'
import type { AreaBounds } from '@web/modules/browse-map/apply-filters'
import { readCartoApiKey, resolveBasemap } from '@web/modules/browse-map/basemap'
import { createGroupIcon, describeGroup } from '@web/modules/browse-map/cluster-icon'
import { clusterPins, declutter, type PlacedGroup, pinBox } from '@web/modules/browse-map/declutter'
import { distanceMetres } from '@web/modules/browse-map/distance'
import {
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
  USER_DOT_Z_OFFSET,
} from '@web/modules/browse-map/map-config'
import L from 'leaflet'
import '@web/modules/browse-map/food-sprite.css'
import {
  ISLAND_GROUP_KEY,
  OPEN_GROUP_MAX_ZOOM,
  planMapLayers,
  REGIONS_FROM_ZOOM,
} from '@web/modules/browse-map/map-tiers'
import { SINGAPORE_BOUNDS, toBoundsTuple } from '@web/modules/browse-map/singapore-bounds'
import { mountStations, type StationLayer } from '@web/modules/browse-map/station-layer'
import type { Coordinates, VenuePin } from '@web/modules/browse-map/types'
import { createVenuePinIcon, type PinState } from '@web/modules/browse-map/venue-pin'
import { type Ambient, mountAmbient } from '@web/modules/map-ambient/ambient-layer'
import { sharedBuilding } from '@web/modules/venues-feed/place'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type MapOffset = { readonly x: number; readonly y: number }

const props = withDefaults(
  defineProps<{
    pins?: readonly VenuePin[]
    focus?: Coordinates | null
    focusZoom?: number
    focusOffset?: MapOffset
    viewPadding?: { top: number; right: number; bottom: number; left: number }
    searchPadding?: { top: number; right: number; bottom: number; left: number }
    userPosition?: Coordinates | null
    userAccuracyMetres?: number | null
    selectedVenueId?: string | null
    placeVenueIds?: readonly string[]
    hoveredVenueId?: string | null
    hoverEnabled?: boolean
    reducedMotion?: boolean
    framed?: boolean
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
    placeVenueIds: () => [],
    hoveredVenueId: null,
    hoverEnabled: true,
    reducedMotion: false,
    framed: false,
  },
)
const emit = defineEmits<{
  select: [id: string]
  place: [ids: string[]]
  hover: [id: string | null]
  moved: [area: AreaBounds]
  ready: [map: L.Map]
}>()

const container = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let tileLayer: L.TileLayer | null = null
const { theme } = useTheme()
let pinLayer: L.LayerGroup | null = null
let groupLayer: L.LayerGroup | null = null
let planKey = ''
const SETTLED_CLASS = 'is-settled'
const SELECTED_CLASS = 'is-selected'
const FRAME_MARGIN_PX = 48
const FRAME_MAX_ZOOM = 16
let shownPins = new Set<string>()
let groupMarkers = new Map<string, { marker: L.Marker; group: PlacedGroup }>()
let userLayer: L.LayerGroup | null = null
let resizeObserver: ResizeObserver | null = null
let ambient: Ambient | null = null
let stations: StationLayer | null = null
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

let opened: { readonly ids: ReadonlySet<string>; readonly zoom: number } | null = null

const projectAt = (zoom: number) => (point: Coordinates) =>
  map ? map.project([point.lat, point.lng], zoom) : L.point(0, 0)

const openStack = (group: PlacedGroup) => {
  if (!map) return
  const from = map.getZoom()
  const zooms = Array.from({ length: MAX_ZOOM - from }, (_, index) => from + index + 1)
  const split = zooms.find((zoom) => {
    const layout = clusterPins(group.venues, projectAt(zoom))
    return layout.pins.length + layout.stacks.length > 1
  })
  if (split === undefined) {
    emit('place', group.venues.map((venue) => venue.id))
    return
  }
  const bounds = L.latLngBounds(group.venues.map((venue) => L.latLng(venue.lat, venue.lng)))
  map.flyTo(centreFor(bounds.getCenter(), split), split, { animate: !props.reducedMotion, duration: FLY_DURATION_S })
}

const isOneSpot = (venues: readonly VenuePin[]) => {
  const layout = clusterPins(venues, projectAt(MAX_ZOOM))
  return layout.pins.length + layout.stacks.length === 1
}

const asPlace = (group: PlacedGroup): PlacedGroup =>
  group.kind === 'stack' && isOneSpot(group.venues)
    ? {
        ...group,
        kind: 'place',
        key: group.key.replace(/^stack:/, 'place:'),
        label: sharedBuilding(group.venues.map((venue) => venue.name)) ?? 'one building',
      }
    : group

const openGroup = (group: PlacedGroup) => {
  if (!map) return
  if (group.kind === 'place') {
    emit('place', group.venues.map((venue) => venue.id))
    return
  }
  if (group.kind === 'stack') {
    openStack(group)
    return
  }
  const bounds = L.latLngBounds(group.venues.map((venue) => L.latLng(venue.lat, venue.lng)))
  if (group.key === ISLAND_GROUP_KEY) {
    const zoom = Math.max(REGIONS_FROM_ZOOM, map.getZoom() + 1)
    map.flyTo(centreFor(bounds.getCenter(), zoom), zoom, { animate: !props.reducedMotion, duration: FLY_DURATION_S })
    return
  }
  const { top, right, bottom, left } = props.viewPadding
  const fitted = map.getBoundsZoom(bounds, false, L.point(left + right + 80, top + bottom + 80))
  const zoom = Math.min(fitted, OPEN_GROUP_MAX_ZOOM)
  opened = { ids: new Set(group.venues.map((venue) => venue.id)), zoom }
  map.flyTo(centreFor(bounds.getCenter(), zoom), zoom, { animate: !props.reducedMotion, duration: FLY_DURATION_S })
  replan()
}

const groupLook = (group: PlacedGroup) =>
  `${group.dealCount}:${group.compact}:${group.offset.x},${group.offset.y}`

const keyOf = (loose: readonly VenuePin[], groups: readonly PlacedGroup[]) =>
  [
    loose.map((pin) => pin.id).join(','),
    groups.map((group) => `${group.key}:${groupLook(group)}`).join(','),
  ].join('|')

const replan = (force = false) => {
  if (!map || !pinLayer || !groupLayer) return
  const zoom = map.getZoom()
  const openIds = opened?.ids
  const openPins = openIds ? props.pins.filter((pin) => openIds.has(pin.id)) : []
  const planned = props.framed
    ? { loose: props.pins, groups: [] }
    : planMapLayers({
        pins: openIds ? props.pins.filter((pin) => !openIds.has(pin.id)) : props.pins,
        zoom,
        user: props.userPosition,
        selectedVenueId: props.selectedVenueId,
      })
  const plan = props.framed ? planned : { ...planned, loose: [...planned.loose, ...openPins] }
  const project = projectAt(zoom)
  const selected = plan.loose.filter((pin) => pin.id === props.selectedVenueId)
  const layout = clusterPins(
    plan.loose.filter((pin) => pin.id !== props.selectedVenueId),
    project,
  )
  const obstacles = [...layout.boxes, ...selected.map((pin) => pinBox(pin, project(pin)))]
  const groups = [...layout.stacks.map(asPlace), ...declutter(plan.groups, project, obstacles)]
  const shown = [...selected, ...layout.pins]
  const place = props.placeVenueIds.join(',')
  const key = `${props.framed}|${props.selectedVenueId ?? ''}|${place}|${keyOf(shown, groups)}`
  if (!force && key === planKey) return
  planKey = key
  syncLoosePins(pinLayer, shown, force)
  syncGroups(groupLayer, groups)
}

const syncLoosePins = (layer: L.LayerGroup, loose: readonly VenuePin[], rebuilt: boolean) => {
  const wanted = new Set(loose.map((pin) => pin.id))
  if (rebuilt) {
    layer.clearLayers()
    shownPins = new Set()
  }
  for (const id of shownPins) {
    const marker = markers.get(id)?.marker
    if (!wanted.has(id) && marker) layer.removeLayer(marker)
  }
  for (const id of wanted) {
    const marker = markers.get(id)?.marker
    if (!shownPins.has(id) && marker) layer.addLayer(marker)
  }
  shownPins = wanted
}

const isOpenPlace = (group: PlacedGroup) =>
  (group.kind === 'stack' || group.kind === 'place') && group.venues.some((venue) => props.placeVenueIds.includes(venue.id))

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
          .on('click', () => openGroup(groupMarkers.get(key)?.group ?? group))
          .addTo(layer)
        marker.getElement()?.classList.toggle(SELECTED_CLASS, isOpenPlace(group))
        return [key, { marker, group }]
      }
      kept.marker.setLatLng([group.centre.lat, group.centre.lng])
      if (groupLook(kept.group) !== groupLook(group)) {
        kept.marker.setIcon(createGroupIcon(group))
        const element = kept.marker.getElement()
        element?.classList.add(SETTLED_CLASS)
        element?.setAttribute('title', describeGroup(group))
      }
      kept.marker.getElement()?.classList.toggle(SELECTED_CLASS, isOpenPlace(group))
      return [key, { marker: kept.marker, group }]
    }),
  )
}

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
  L.marker(latLng, {
    icon,
    interactive: false,
    keyboard: false,
    alt: 'You are here',
    zIndexOffset: USER_DOT_Z_OFFSET,
  })
    .bindTooltip('You are here', { direction: 'top', offset: [0, -USER_DOT_SIZE_PX / 2] })
    .addTo(userLayer)
}

const centreFor = (target: L.LatLng, zoom: number): L.LatLng => {
  if (!map) return target
  const point = map.project(target, zoom).subtract([props.focusOffset.x, props.focusOffset.y])
  return map.unproject(point, zoom)
}

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

const frameAll = (pins: readonly VenuePin[]) => {
  if (!map || pins.length === 0) return
  const bounds = L.latLngBounds(pins.map((pin) => L.latLng(pin.lat, pin.lng)))
  const { top, right, bottom, left } = props.viewPadding
  map.flyToBounds(bounds, {
    paddingTopLeft: [left + FRAME_MARGIN_PX, top + FRAME_MARGIN_PX],
    paddingBottomRight: [right + FRAME_MARGIN_PX, bottom + FRAME_MARGIN_PX],
    maxZoom: FRAME_MAX_ZOOM,
    animate: !props.reducedMotion,
    duration: FLY_DURATION_S,
  })
}

const zoomBy = (delta: number) => {
  if (!map) return
  const visibleCentre = map.getSize().divideBy(2).add([props.focusOffset.x, props.focusOffset.y])
  map.setZoomAround(visibleCentre, map.getZoom() + delta, { animate: !props.reducedMotion })
}

const getArea = (): AreaBounds | null => {
  if (!map) return null
  const size = map.getSize()
  const { top, right, bottom, left } = props.searchPadding ?? props.viewPadding
  if (size.x <= left + right || size.y <= top + bottom) return null
  const northWest = map.containerPointToLatLng([left, top])
  const southEast = map.containerPointToLatLng([size.x - right, size.y - bottom])
  return { south: southEast.lat, west: northWest.lng, north: northWest.lat, east: southEast.lng }
}
const publishArea = () => {
  const area = getArea()
  if (area) emit('moved', area)
}

onMounted(() => {
  if (!container.value) return
  const bounds = L.latLngBounds(toBoundsTuple(SINGAPORE_BOUNDS).map(([lat, lng]) => L.latLng(lat, lng)))
  map = L.map(container.value, {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    zoomAnimation: !props.reducedMotion,
    fadeAnimation: !props.reducedMotion,
    markerZoomAnimation: !props.reducedMotion,
  })
  const { top, right, bottom, left } = props.viewPadding
  map.fitBounds(bounds, {
    paddingTopLeft: [left + 16, top + 16],
    paddingBottomRight: [right + 16, bottom + 16],
    animate: false,
  })
  const basemap = resolveBasemap(readCartoApiKey(), theme.value)
  tileLayer = L.tileLayer(basemap.url, {
    attribution: basemap.attribution,
    maxZoom: MAX_ZOOM,
    maxNativeZoom: basemap.maxNativeZoom,
  }).addTo(map)
  stations = mountStations(map)
  pinLayer = L.layerGroup().addTo(map)
  groupLayer = L.layerGroup().addTo(map)
  userLayer = L.layerGroup().addTo(map)
  ambient = mountAmbient(map, { reducedMotion: props.reducedMotion })
  map.on('moveend', publishArea)
  map.on('zoomend', () => {
    if (opened && map && map.getZoom() < opened.zoom) opened = null
    replan()
  })
  syncPins(props.pins)
  syncUserPosition(props.userPosition, props.userAccuracyMetres)
  if (props.framed) frameAll(props.pins)
  else if (props.focus) focusOn(props.focus, props.focusZoom)
  resizeObserver = observeResize(container.value)
  emit('ready', map)
  publishArea()
})

watch(() => props.searchPadding ?? props.viewPadding, publishArea, { deep: true, flush: 'post' })
watch(
  () => [props.pins, props.framed] as const,
  ([pins, framed]) => {
    syncPins(pins)
    if (framed) frameAll(pins)
  },
)
watch(
  () => [props.selectedVenueId, props.hoveredVenueId, props.placeVenueIds] as const,
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

watch(theme, (value) => tileLayer?.setUrl(resolveBasemap(readCartoApiKey(), value).url))

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  ambient?.dispose()
  ambient = null
  stations?.dispose()
  stations = null
  map?.remove()
  map = null
  tileLayer = null
  pinLayer = null
  groupLayer = null
  planKey = ''
  opened = null
  shownPins = new Set()
  groupMarkers = new Map()
  userLayer = null
  markers.clear()
})

defineExpose({
  leaflet: (): L.Map | null => map,
  zoomIn: () => zoomBy(1),
  zoomOut: () => zoomBy(-1),
  getArea,
})
</script>

<template>
  <section class="deal-map-region" :class="{ 'deal-map-region--framed': framed }" aria-label="Deals map" data-testid="deal-map">
    <div ref="container" class="deal-map" />
  </section>
</template>

<style scoped>
.deal-map-region,
.deal-map {
  position: relative;
  width: 100%;
  height: 100%;
}

.deal-map-region {
  --pin-fill: rgb(29 29 34 / 0.94);
  --pin-text: var(--on-ink);
  --pin-text-muted: rgb(255 255 255 / 0.78);
  --pin-stem: rgb(29 29 34 / 0.85);
}

.app-palette[data-theme='dark'] .deal-map-region {
  --pin-fill: rgb(243 241 236 / 0.96);
  --pin-text-muted: rgb(27 27 31 / 0.72);
  --pin-stem: rgb(243 241 236 / 0.85);
}

.deal-map :deep(.leaflet-container) {
  font-family: var(--font-sans);
  background: var(--map-canvas);
}

.deal-map :deep(.deal-map-pin) {
  background: transparent;
  border: 0;
}

.deal-map :deep(.deal-map-pin__stack) {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, calc(-100% + 5.5px));
  transform-origin: 50% 100%;
  transition:
    transform 200ms var(--ease-out),
    opacity 200ms ease;
}

.deal-map :deep(.deal-map-pin__bubble) {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  margin-top: 22px;
  padding: 0 6px 0 40px;
  white-space: nowrap;
  color: var(--pin-text);
  background: var(--pin-fill);
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 20px rgba(27, 27, 31, 0.26);
  transition: background-color 150ms ease;
}

.deal-map :deep(.deal-map-pin__bubble .food-sprite) {
  position: absolute;
  top: -24px;
  left: -14px;
  width: 52px;
  height: 52px;
  filter: drop-shadow(0 4px 4px rgba(27, 27, 31, 0.25));
}

.deal-map :deep(.deal-map-pin__flag) {
  position: absolute;
  top: -26px;
  left: 26px;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  color: var(--pin-text);
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
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.deal-map :deep(.deal-map-pin__badge:last-child) {
  padding-right: 8px;
}

.deal-map :deep(.deal-map-pin__tag) {
  padding: 5px 7px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
  border-radius: 8px;
}

.deal-map :deep(.deal-map-pin__tag--promo) {
  color: var(--on-accent);
  background: var(--sunny);
}

.deal-map :deep(.deal-map-pin__tag--plain) {
  background: var(--paper-white);
}

.deal-map :deep(.deal-map-pin__stem) {
  width: 2px;
  height: 12px;
  background: var(--pin-stem);
}

.deal-map :deep(.deal-map-pin__dot) {
  box-sizing: border-box;
  width: 11px;
  height: 11px;
  background: var(--paper-white);
  border: 3px solid var(--ink-strong);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(27, 27, 31, 0.25);
}

.deal-map :deep(.deal-map-pin.is-hot .deal-map-pin__stack) {
  transform: translate(-50%, calc(-100% + 5.5px)) translateY(-4px) scale(1.06);
}

.deal-map :deep(.deal-map-pin.is-hot .deal-map-pin__bubble),
.deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__bubble),
.deal-map-region--framed :deep(.deal-map-pin__bubble) {
  background: var(--coral);
}

.deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__dot),
.deal-map-region--framed :deep(.deal-map-pin__dot) {
  border-color: var(--coral);
}

.deal-map :deep(.deal-map-pin.is-selected .deal-map-pin__stack) {
  transform: translate(-50%, calc(-100% + 5.5px)) scale(1.1);
  animation: pin-bounce 220ms var(--ease-out);
}

.deal-map :deep(.deal-map-pin .food-sprite) {
  animation-play-state: paused;
}

.deal-map :deep(.deal-map-pin.is-hot .food-sprite),
.deal-map :deep(.deal-map-pin.is-selected .food-sprite) {
  animation-play-state: running;
}

@media (hover: hover) and (pointer: fine) {
  .deal-map :deep(.deal-map-pin:hover .deal-map-pin__stack) {
    transform: translate(-50%, calc(-100% + 5.5px)) translateY(-3px);
  }

  .deal-map :deep(.deal-map-pin:hover .food-sprite) {
    animation-play-state: running;
  }
}

.deal-map :deep(.deal-map-pin:focus-visible) {
  outline: none;
}

.deal-map :deep(.deal-map-pin:focus-visible .deal-map-pin__bubble) {
  box-shadow:
    0 0 0 3px var(--sunny-ring),
    0 8px 20px rgba(27, 27, 31, 0.26);
}

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
  gap: 8px;
  max-width: 240px;
  padding: 5px 16px 5px 8px;
  white-space: nowrap;
  color: var(--pin-text);
  background: var(--pin-fill);
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 20px rgba(27, 27, 31, 0.26);
  transform: translate(-50%, -50%);
  transition:
    transform 160ms ease-out,
    background-color 150ms ease;
  animation: deal-map-group-in 200ms var(--ease-out);
  cursor: pointer;
}

.deal-map :deep(.deal-map-cluster__chip--near) {
  --pin-text-muted: rgb(255 255 255 / 0.78);
  color: #fff;
  background: var(--sky-strong);
}

.deal-map :deep(.deal-map-cluster__chip--region) {
  padding: 7px 18px 7px 10px;
}

.deal-map :deep(.deal-map-cluster__chip--region .deal-map-cluster__name) {
  font-size: 0.9375rem;
}

.deal-map :deep(.deal-map-cluster__chip--compact) {
  gap: 4px;
  padding: 4px 11px 4px 5px;
}

.deal-map :deep(.deal-map-cluster__chip:active) {
  transform: translate(-50%, -50%) scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .deal-map :deep(.deal-map-cluster__chip:hover) {
    background: var(--ink-strong-hover);
  }

  .deal-map :deep(.deal-map-cluster__chip--near:hover) {
    background: var(--sky-strong-hover);
  }
}

.deal-map :deep(.deal-map-cluster.is-selected .deal-map-cluster__chip) {
  color: var(--on-ink);
  background: var(--coral);
}

.deal-map :deep(.deal-map-pin__building) {
  flex: none;
  width: 20px;
  height: 20px;
}

.deal-map :deep(.deal-map-pin--place .deal-map-pin__bubble) {
  margin-top: 0;
  padding-left: 12px;
  color: var(--pin-fill);
  background: var(--pin-text);
  box-shadow:
    inset 0 0 0 2px var(--pin-fill),
    0 8px 20px rgba(27, 27, 31, 0.26);
}

.deal-map :deep(.deal-map-pin--place.is-hot .deal-map-pin__bubble),
.deal-map :deep(.deal-map-pin--place.is-selected .deal-map-pin__bubble) {
  color: var(--pin-text);
  box-shadow: 0 8px 20px rgba(27, 27, 31, 0.26);
}

.deal-map :deep(.deal-map-cluster__fan) {
  display: flex;
  flex: none;
}

.deal-map :deep(.deal-map-cluster__fan .food-sprite) {
  width: 30px;
  height: 30px;
  margin-left: -12px;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.3));
}

.deal-map :deep(.deal-map-cluster__fan .food-sprite:first-child) {
  margin-left: 0;
}

.deal-map :deep(.deal-map-cluster__text) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.deal-map :deep(.deal-map-cluster__name) {
  min-width: 0;
  padding-block: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-display);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.1;
}

.deal-map :deep(.deal-map-cluster__count) {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--pin-text-muted);
  font-variant-numeric: tabular-nums;
}

.deal-map :deep(.deal-map-cluster__chip--compact .deal-map-cluster__count) {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: inherit;
}

.deal-map :deep(.deal-map-cluster:focus-visible) {
  outline: none;
}

.deal-map :deep(.deal-map-cluster:focus-visible .deal-map-cluster__chip) {
  box-shadow:
    0 0 0 3px var(--sunny-ring),
    var(--shadow-pill);
}

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

.deal-map :deep(.deal-map-user-dot) {
  box-sizing: border-box;
  background: var(--sky);
  border: 3px solid var(--paper-white);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(27, 27, 31, 0.3);
}

.deal-map :deep(.deal-map-station) {
  background: transparent;
  border: 0;
}

.deal-map :deep(.deal-map-station__mark) {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  opacity: 0.55;
  transform: translate(-50%, -50%);
  transition: opacity 120ms ease-out;
  cursor: default;
}

.deal-map :deep(.deal-map-station__dot) {
  position: relative;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px var(--paper-white);
  transition: transform 120ms ease-out;
}

.deal-map :deep(.deal-map-station__dot::after) {
  position: absolute;
  inset: 3px;
  content: '';
  background: var(--paper-white);
  border-radius: 50%;
}

.deal-map :deep(.deal-map-station__mark--interchange .deal-map-station__dot) {
  width: 14px;
  height: 14px;
}

.deal-map :deep(.deal-map-station__mark--interchange .deal-map-station__dot::after) {
  inset: 3.5px;
}

.deal-map :deep(.deal-map-station__mark--lrt .deal-map-station__dot) {
  width: 9px;
  height: 9px;
}

.deal-map :deep(.deal-map-station__mark--lrt .deal-map-station__dot::after) {
  inset: 2.5px;
}

@media (hover: hover) and (pointer: fine) {
  .deal-map :deep(.deal-map-station__mark:hover) {
    opacity: 1;
  }

  .deal-map :deep(.deal-map-station__mark:hover .deal-map-station__dot) {
    transform: scale(1.3);
  }
}

.deal-map :deep(.deal-map-station-tooltip) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 9px;
  font-family: var(--font-sans);
  white-space: nowrap;
  color: var(--ink);
  background: var(--paper-white);
  border: 0;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
}

.deal-map :deep(.deal-map-station-tooltip > div) {
  display: flex;
  align-items: center;
  gap: 6px;
}

.deal-map :deep(.deal-map-station-tooltip::before) {
  display: none;
}

.deal-map :deep(.deal-map-station-tooltip__name) {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.3;
}

.deal-map :deep(.deal-map-station-tooltip__lines) {
  display: flex;
  gap: 3px;
}

.deal-map :deep(.deal-map-station-tooltip__line) {
  padding: 1px 5px;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--paper-white);
  border-radius: 4px;
}

.deal-map :deep(.leaflet-control-attribution) {
  color: var(--ink-muted);
  background: var(--glass);
  border-top-left-radius: var(--radius-control);
}

.deal-map :deep(.leaflet-control-attribution a) {
  color: var(--ink);
}

@keyframes pin-bounce {
  40% {
    transform: translate(-50%, calc(-100% + 5.5px)) translateY(-4px) scale(1.16);
  }

  to {
    transform: translate(-50%, calc(-100% + 5.5px)) scale(1.1);
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
    transform: translate(-50%, calc(-100% + 5.5px));
  }
}
</style>
