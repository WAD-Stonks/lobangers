<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import { useTheme } from '@web/lib/theme'
import {
  addStallFromPlace,
  errorMessageFor,
  type Place,
  type Stall,
  searchPlaces,
} from '@web/modules/add-deal/add-deal-api'
import { readCartoApiKey, resolveBasemap } from '@web/modules/browse-map/basemap'
import { FOCUS_ZOOM, MAX_ZOOM } from '@web/modules/browse-map/map-config'
import { SINGAPORE_BOUNDS, toBoundsTuple } from '@web/modules/browse-map/singapore-bounds'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import L from 'leaflet'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  initialSearch: string
  chosenIds: readonly string[]
}>()
const emit = defineEmits<{ add: [stall: Stall] }>()

const search = ref(props.initialSearch)
const places = ref<Place[]>([])
const picked = ref<Place | null>(null)
const searching = ref(false)
const adding = ref(false)
const message = ref('')

const container = ref<HTMLElement | null>(null)
const { theme } = useTheme()
let map: L.Map | null = null
let tileLayer: L.TileLayer | null = null
let pinLayer: L.LayerGroup | null = null

const pinIcon = (active: boolean) =>
  L.divIcon({
    className: `stall-map__pin${active ? ' is-picked' : ''}`,
    html: '<span></span>',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })

const drawPins = () => {
  if (!map || !pinLayer) return
  pinLayer.clearLayers()
  for (const place of places.value) {
    const active = place.placeId === picked.value?.placeId
    L.marker([place.latitude, place.longitude], {
      icon: pinIcon(active),
      zIndexOffset: active ? 1000 : 0,
      title: place.name,
      keyboard: false,
    })
      .on('click', () => pick(place))
      .addTo(pinLayer)
  }
}

const showAll = () => {
  if (!map || places.value.length === 0) return
  const points = places.value.map((place) => L.latLng(place.latitude, place.longitude))
  map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: FOCUS_ZOOM })
}

const find = async () => {
  const words = search.value.trim()
  if (searching.value) return
  if (words.length < 2) {
    message.value = 'Type at least 2 letters of the shop name.'
    return
  }
  searching.value = true
  message.value = ''
  picked.value = null
  try {
    places.value = await searchPlaces(words)
    if (places.value.length === 0) message.value = 'Google Maps found nothing. Try the name on its signboard.'
    drawPins()
    showAll()
  } catch (error) {
    message.value = errorMessageFor(error, 'Could not search the map. Please try again.')
  } finally {
    searching.value = false
  }
}

const pick = (place: Place) => {
  picked.value = place
  drawPins()
  map?.setView([place.latitude, place.longitude], Math.max(map.getZoom(), FOCUS_ZOOM))
}

const add = async () => {
  const place = picked.value
  if (!place || adding.value || isOnDeal(place)) return
  if (place.stall) {
    emit('add', place.stall)
    return
  }
  adding.value = true
  message.value = ''
  try {
    const stall = await addStallFromPlace(place.placeId, place.name.slice(0, 120))
    places.value = places.value.map((found) => (found.placeId === place.placeId ? { ...found, stall } : found))
    picked.value = { ...place, stall }
    emit('add', stall)
  } catch (error) {
    message.value = errorMessageFor(error, 'Could not add the stall. Please try again.')
  } finally {
    adding.value = false
  }
}

const isOnDeal = (place: Place) => !!place.stall && props.chosenIds.includes(place.stall.id)
const pickedOnDeal = computed(() => !!picked.value && isOnDeal(picked.value))
const addLabel = computed(() => {
  if (adding.value) return 'Adding…'
  if (pickedOnDeal.value) return 'Already added'
  return picked.value?.stall ? 'Add this stall to deal' : 'Add as a new stall'
})

onMounted(() => {
  if (!container.value) return
  map = L.map(container.value, { maxZoom: MAX_ZOOM, scrollWheelZoom: false })
  map.fitBounds(L.latLngBounds(toBoundsTuple(SINGAPORE_BOUNDS).map(([lat, lng]) => L.latLng(lat, lng))), {
    animate: false,
  })
  const basemap = resolveBasemap(readCartoApiKey(), theme.value)
  tileLayer = L.tileLayer(basemap.url, {
    attribution: basemap.attribution,
    maxZoom: MAX_ZOOM,
    maxNativeZoom: basemap.maxNativeZoom,
  }).addTo(map)
  pinLayer = L.layerGroup().addTo(map)
  if (search.value.trim().length >= 2) void find()
})

watch(theme, (value) => tileLayer?.setUrl(resolveBasemap(readCartoApiKey(), value).url))

onBeforeUnmount(() => {
  map?.remove()
  map = null
  tileLayer = null
  pinLayer = null
})
</script>

<template>
  <div class="stall-map">
    <label for="place-search" class="form-label">Find it on Google Maps</label>
    <div class="stall-map__search">
      <input
        id="place-search"
        v-model="search"
        type="search"
        autocomplete="off"
        class="form-control"
        maxlength="100"
        placeholder="Shop name and area, e.g. Ah Seng Bedok"
        @keydown.enter.prevent="find"
      />
      <button type="button" class="lb-btn" :disabled="searching" @click="find">
        <ShellIcon name="search" :size="18" />{{ searching ? 'Searching…' : 'Search map' }}
      </button>
    </div>

    <div ref="container" class="stall-map__map" aria-hidden="true"></div>

    <div role="status">
      <p v-if="message" class="stall-map__hint mb-0">{{ message }}</p>
    </div>

    <ul v-if="places.length > 0" class="stall-map__places" aria-label="Places found">
      <li v-for="place in places" :key="place.placeId">
        <button
          type="button"
          class="stall-map__place"
          :class="{ 'is-picked': place.placeId === picked?.placeId }"
          :aria-pressed="place.placeId === picked?.placeId"
          @click="pick(place)"
        >
          <ShellIcon name="pin" :size="18" />
          <span class="stall-map__place-text">
            <strong>{{ place.name }}</strong><span>{{ place.address }}</span>
          </span>
          <span v-if="place.stall" class="stall-map__badge">{{ isOnDeal(place) ? 'Already added' : 'Listed' }}</span>
        </button>
      </li>
    </ul>

    <div v-if="picked" class="stall-map__confirm">
      <p v-if="pickedOnDeal" class="stall-map__hint">{{ picked.stall?.name }} is already on this deal.</p>
      <button type="button" class="lb-btn lb-btn--primary" :disabled="adding || pickedOnDeal" @click="add">{{ addLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.stall-map {
  display: grid;
  gap: 10px;
  padding: 16px;
  background: var(--paper-sunk, var(--paper-white));
  border: 1px solid var(--hairline);
  border-radius: 20px;
}
.stall-map .form-label {
  margin-bottom: 0;
  font-weight: 700;
}
.stall-map__search {
  display: flex;
  gap: 10px;
}
.stall-map__search .form-control {
  flex: 1;
  min-width: 0;
}
.stall-map__search .lb-btn {
  flex: none;
  gap: 6px;
}
.stall-map__map {
  height: 260px;
  overflow: hidden;
  border: 1px solid var(--hairline);
  border-radius: 16px;
}
.stall-map__hint {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.875rem;
}
.stall-map__places {
  display: grid;
  gap: 8px;
  max-height: 280px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.stall-map__place {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: var(--hit, 44px);
  padding: 10px 12px;
  color: var(--ink);
  text-align: left;
  background: var(--paper-white);
  border: 1.5px solid var(--hairline);
  border-radius: 14px;
  cursor: pointer;
}
.stall-map__place.is-picked {
  background: var(--sunny-wash);
  border-color: var(--sunny-deep);
}
.stall-map__place:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}
.stall-map__place-text {
  display: grid;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.stall-map__place-text span {
  color: var(--ink-muted);
  font-size: 0.875rem;
}
.stall-map__badge {
  flex: none;
  padding: 2px 10px;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--sunny-soft);
  border-radius: 999px;
}
.stall-map__confirm {
  display: grid;
  gap: 6px;
  justify-items: start;
}

.stall-map__map :deep(.stall-map__pin span) {
  display: block;
  width: 22px;
  height: 22px;
  margin: 2px;
  background: var(--sunny);
  border: 2px solid var(--ink);
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
}
.stall-map__map :deep(.stall-map__pin.is-picked span) {
  background: var(--coral-deep);
  transform: rotate(-45deg) scale(1.2);
}

@media (max-width: 480px) {
  .stall-map__search {
    flex-direction: column;
  }
  .stall-map__map {
    height: 220px;
  }
}
</style>
