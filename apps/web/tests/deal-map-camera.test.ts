import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import DealMap from '@web/modules/browse-map/DealMap.vue'
import L from 'leaflet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watch } from 'vue'

const leaflet = vi.hoisted(() => ({ map: vi.fn() }))
vi.mock('leaflet', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import('leaflet') }>()
  const layer = () => {
    const result = {
      addTo: vi.fn(() => result),
      clearLayers: vi.fn(),
      removeLayers: vi.fn(),
      addLayers: vi.fn(),
    }
    return result
  }
  return {
    ...actual,
    default: {
      ...actual.default,
      map: leaflet.map,
      tileLayer: layer,
      markerClusterGroup: layer,
      layerGroup: layer,
    },
  }
})
vi.mock('leaflet.markercluster', () => ({}))
vi.mock('@web/modules/map-ambient/ambient-layer', () => ({
  mountAmbient: () => ({ dispose: vi.fn() }),
}))
vi.mock('@web/modules/browse-map/station-layer', () => ({
  mountStations: () => ({ dispose: vi.fn() }),
}))

// Model Leaflet's synchronous moveend and cancellable animated camera. Projection is
// deliberately simple: these tests exercise camera ownership, not Leaflet geography.
const createMap = () => {
  let centre = L.latLng(1.35, 103.8)
  let zoom = 11
  let pending: (() => void) | null = null
  const handlers = new Map<string, (() => void)[]>()
  const fire = (event: string) => {
    for (const handler of handlers.get(event) ?? []) handler()
  }
  const move = (target: L.LatLng, targetZoom: number, animate = false) => {
    const finish = () => {
      centre = L.latLng(target.lat, target.lng)
      zoom = targetZoom
      fire('zoomend')
      fire('moveend')
    }
    if (animate) pending = finish
    else finish()
  }
  const map = {
    fitBounds: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    }),
    getCenter: () => centre,
    getZoom: () => zoom,
    getSize: () => L.point(1000, 800),
    project: (target: L.LatLng) => L.point(target.lng * 10000, -target.lat * 10000),
    unproject: (point: L.Point) => L.latLng(-point.y / 10000, point.x / 10000),
    containerPointToLatLng: ([x, y]: [number, number]) =>
      L.latLng(centre.lat + (400 - y) / (10000 * zoom), centre.lng + (x - 500) / (10000 * zoom)),
    panTo: vi.fn((target: L.LatLng, options: { animate: boolean }) =>
      move(target, zoom, options.animate),
    ),
    flyTo: vi.fn((target: L.LatLng, targetZoom: number, options: { animate: boolean }) =>
      move(target, targetZoom, options.animate),
    ),
    setView: vi.fn((target: L.LatLng, targetZoom: number) => {
      move(target, targetZoom)
      return map
    }),
    setZoomAround: vi.fn((_point: L.Point, targetZoom: number) => move(centre, targetZoom)),
    stop: vi.fn(() => {
      // Leaflet may emit moveend as an in-flight pan is stopped.
      if (pending) {
        pending = null
        fire('moveend')
      }
      return map
    }),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    fire,
    move,
    finishAnimation: () => {
      const finish = pending
      pending = null
      finish?.()
    },
  }
  return map
}

type MapDouble = ReturnType<typeof createMap>
let map: MapDouble
let wrapper: VueWrapper | null = null
const padding = { top: 0, right: 0, bottom: 0, left: 200 }
const north = { lat: 1.436, lng: 103.786 }
const west = { lat: 1.333, lng: 103.743 }
const mountMap = (props = {}) => {
  wrapper = mount(DealMap, { props: { reducedMotion: true, searchPadding: padding, ...props } })
  return wrapper
}
const lastArea = (view: VueWrapper) => view.emitted('moved')?.at(-1)?.[0]
const camera = () => ({ centre: map.getCenter(), zoom: map.getZoom() })

beforeEach(() => {
  map = createMap()
  leaflet.map.mockReturnValue(map)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

describe('map selection camera and search area', () => {
  it('keeps publishing browse pans, zoom controls, and near-me focus', async () => {
    const view = mountMap()
    const initialArea = lastArea(view)
    map.move(L.latLng(west.lat, west.lng), 16)
    const westArea = lastArea(view)
    expect(westArea).not.toEqual(initialArea)
    expect(view.emitted('moved')).toHaveLength(2)
    ;(view.vm as unknown as { zoomIn: () => void }).zoomIn()
    expect(map.getZoom()).toBe(17)
    expect(view.emitted('moved')).toHaveLength(3)
    await view.setProps({ focus: north, focusZoom: 18 })
    expect(map.getCenter()).toEqual(L.latLng(north.lat, north.lng))
    expect(lastArea(view)).not.toEqual(westArea)
    expect(view.emitted('moved')).toHaveLength(4)
  })

  it('keeps the geographic search live when a room highlights a venue without opening details', async () => {
    const view = mountMap({ preserveBrowseContext: false })
    const initialArea = lastArea(view)
    await view.setProps({ selectedVenueId: 'room-venue', focus: north })
    expect(lastArea(view)).not.toEqual(initialArea)
    map.move(L.latLng(west.lat, west.lng), 16)
    const explored = camera()
    const exploredArea = lastArea(view)
    expect(exploredArea).not.toEqual(initialArea)
    await view.setProps({ selectedVenueId: null, focus: null })
    await flushPromises()
    expect(camera()).toEqual(explored)
    expect(lastArea(view)).toEqual(exploredArea)
  })

  it('does not turn detail focus, resize, or selection padding into a new search area', async () => {
    const view = mountMap()
    const area = lastArea(view)
    await view.setProps({ selectedVenueId: 'north', focus: north })
    expect(map.getCenter()).toEqual(L.latLng(north.lat, north.lng))
    await view.setProps({ searchPadding: { ...padding, left: 400 } })
    map.fire('moveend')
    expect(view.emitted('moved')).toEqual([[area]])
  })

  it('restores the original exploration camera across selected-outlet switches', async () => {
    const view = mountMap()
    map.move(L.latLng(west.lat, west.lng), 16)
    const exploration = camera()
    const area = lastArea(view)
    const count = view.emitted('moved')?.length
    await view.setProps({ selectedVenueId: 'north', focus: north })
    await view.setProps({ selectedVenueId: 'west', focus: west })
    expect(view.emitted('moved')).toHaveLength(count ?? 0)
    await view.setProps({ selectedVenueId: null, focus: null, focusOffset: { x: 0, y: -150 } })
    await flushPromises()
    expect(camera()).toEqual(exploration)
    expect(lastArea(view)).toEqual(area)
    expect(view.emitted('moved')).toHaveLength((count ?? 0) + 1)
    // Subsequent ordinary exploration still updates the geographic filter.
    map.move(L.latLng(north.lat, north.lng), 15)
    expect(lastArea(view)).not.toEqual(area)
    const nextExploration = camera()
    await view.setProps({ selectedVenueId: 'west', focus: west })
    await view.setProps({ selectedVenueId: null, focus: null })
    await flushPromises()
    expect(camera()).toEqual(nextExploration)
  })

  it('preserves nearby detail pans and returns to the street-level exploration camera', async () => {
    const view = mountMap()
    map.move(L.latLng(west.lat, west.lng), 16)
    const exploration = camera()
    const area = lastArea(view)
    await view.setProps({
      selectedVenueId: 'next-door',
      focus: { lat: 1.3345, lng: 103.7445 },
      focusOffset: { x: 0, y: -259 },
    })
    expect(map.panTo).toHaveBeenCalledOnce()
    expect(map.flyTo).not.toHaveBeenCalled()
    expect(map.getZoom()).toBe(16)
    expect(view.emitted('moved')).toHaveLength(2)
    await view.setProps({ selectedVenueId: null, focus: null })
    await flushPromises()
    expect(camera()).toEqual(exploration)
    expect(lastArea(view)).toEqual(area)
  })

  it('uses settled browse padding when restoring, not the outgoing detail layout', async () => {
    const view = mountMap()
    const exploration = camera()
    await view.setProps({
      selectedVenueId: 'north',
      focus: north,
      searchPadding: { ...padding, left: 400 },
    })
    const areas = view.emitted('moved')?.length
    await view.setProps({ selectedVenueId: null, focus: null, searchPadding: padding })
    await flushPromises()
    expect(camera()).toEqual(exploration)
    expect(view.emitted('moved')).toHaveLength((areas ?? 0) + 1)
    expect(lastArea(view)).toEqual({
      south: 1.35 - 400 / 110000,
      north: 1.35 + 400 / 110000,
      west: 103.8 - 300 / 110000,
      east: 103.8 + 500 / 110000,
    })
  })

  it('cancels in-flight detail animation before restoring and publishing', async () => {
    const view = mountMap({ reducedMotion: false })
    const exploration = camera()
    const area = lastArea(view)
    await view.setProps({ selectedVenueId: 'north', focus: north })
    await view.setProps({ selectedVenueId: null, focus: null })
    await flushPromises()
    map.finishAnimation()
    expect(camera()).toEqual(exploration)
    expect(view.emitted('moved')).toEqual([[area], [area]])
    expect(map.stop).toHaveBeenCalled()
  })

  it('does not let a queued restore interrupt a newly selected outlet', async () => {
    const view = mountMap()
    const exploration = camera()
    await view.setProps({ selectedVenueId: 'north', focus: north })
    const stop = watch(
      () => (view.vm.$props as { selectedVenueId: string | null }).selectedVenueId,
      (selected) => {
        if (selected === null) void view.setProps({ selectedVenueId: 'west', focus: west })
      },
      { flush: 'post' },
    )
    await view.setProps({ selectedVenueId: null, focus: null })
    await flushPromises()
    stop()
    expect(map.getCenter()).toEqual(L.latLng(west.lat, west.lng))
    expect(map.setView).not.toHaveBeenCalled()
    await view.setProps({ selectedVenueId: null, focus: null })
    await flushPromises()
    expect(camera()).toEqual(exploration)
  })

  it('drops a pending restore when the map unmounts', async () => {
    const view = mountMap()
    await view.setProps({ selectedVenueId: 'north', focus: north })
    const stop = watch(
      () => (view.vm.$props as { selectedVenueId: string | null }).selectedVenueId,
      (selected) => {
        if (selected === null) view.unmount()
      },
      { flush: 'post' },
    )
    await view.setProps({ selectedVenueId: null, focus: null })
    await nextTick()
    stop()
    wrapper = null
    expect(map.remove).toHaveBeenCalledOnce()
    expect(map.setView).not.toHaveBeenCalled()
  })

  it('falls back to the current camera when a directly entered detail has no browse snapshot', async () => {
    const view = mountMap({ selectedVenueId: 'north', focus: north })
    const detailCamera = camera()
    await view.setProps({ selectedVenueId: null, focus: null })
    await flushPromises()
    expect(camera()).toEqual(detailCamera)
    expect(map.setView).not.toHaveBeenCalled()
    expect(lastArea(view)).toBeDefined()
  })
})
