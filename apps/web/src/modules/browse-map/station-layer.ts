import {
  RAIL_STATIONS,
  type RailLine,
  type RailStation,
} from '@broke-oclock/contracts/rail-stations'
import L from 'leaflet'

// MRT and LRT stations as quiet landmarks, so a visitor can tell where a deal is ("next to
// Bugis") at a glance. Each dot is ringed in its line colour, split for interchanges, and
// hovering (or tapping) one shows its name and lines. They sit in their own pane below the pins.
export const STATIONS_FROM_ZOOM = 14
export const STATION_PANE = 'deal-map-stations'
// Above tiles and shapes (400), below marker shadows (500) and pins (600).
const STATION_PANE_Z_INDEX = 450

// LTA's published line colours; the three LRT systems share one grey.
const LRT_GREY = '#748477'
export const LINE_STYLES: Readonly<
  Record<RailLine, { readonly name: string; readonly colour: string }>
> = {
  NS: { name: 'North-South Line', colour: '#d42e12' },
  EW: { name: 'East-West Line', colour: '#009645' },
  NE: { name: 'North East Line', colour: '#9900aa' },
  CC: { name: 'Circle Line', colour: '#fa9e0d' },
  DT: { name: 'Downtown Line', colour: '#005ec4' },
  TE: { name: 'Thomson-East Coast Line', colour: '#9d5b25' },
  BP: { name: 'Bukit Panjang LRT', colour: LRT_GREY },
  SK: { name: 'Sengkang LRT', colour: LRT_GREY },
  PG: { name: 'Punggol LRT', colour: LRT_GREY },
}

export const stationsVisibleAt = (zoom: number) => zoom >= STATIONS_FROM_ZOOM

// One solid colour per line, or equal slices of a conic gradient for an interchange.
export const ringFor = (lines: readonly RailLine[]): string => {
  const colours = [...new Set(lines.map((line) => LINE_STYLES[line].colour))]
  if (colours.length === 1) return colours[0] ?? LRT_GREY
  const slice = 360 / colours.length
  const stops = colours.map(
    (colour, index) => `${colour} ${index * slice}deg ${(index + 1) * slice}deg`,
  )
  return `conic-gradient(${stops.join(', ')})`
}

// Built from DOM nodes, like the venue pins, so names are never parsed as HTML.
const createStationIcon = ([, kind, , , lines]: RailStation): L.DivIcon => {
  const root = document.createElement('div')
  root.className = `deal-map-station__mark deal-map-station__mark--${kind.toLowerCase()}`
  if (lines.length > 1) root.classList.add('deal-map-station__mark--interchange')
  const dot = document.createElement('span')
  dot.className = 'deal-map-station__dot'
  dot.style.background = ringFor(lines)
  root.append(dot)
  return L.divIcon({ className: 'deal-map-station', html: root, iconSize: [0, 0] })
}

const createTooltip = ([name, kind, , , lines]: RailStation): HTMLElement => {
  const root = document.createElement('div')
  const title = document.createElement('span')
  title.className = 'deal-map-station-tooltip__name'
  title.textContent = `${name} ${kind}`
  const badges = document.createElement('span')
  badges.className = 'deal-map-station-tooltip__lines'
  for (const line of lines) {
    const badge = document.createElement('span')
    badge.className = 'deal-map-station-tooltip__line'
    badge.style.background = LINE_STYLES[line].colour
    badge.textContent = line
    badge.title = LINE_STYLES[line].name
    badges.append(badge)
  }
  root.append(title, badges)
  return root
}

export type StationLayer = { readonly sync: () => void; readonly dispose: () => void }

export const mountStations = (map: L.Map): StationLayer => {
  const pane = map.createPane(STATION_PANE)
  pane.style.zIndex = String(STATION_PANE_Z_INDEX)
  const layer = L.layerGroup(
    RAIL_STATIONS.map((station) =>
      L.marker([station[2], station[3]], {
        icon: createStationIcon(station),
        pane: STATION_PANE,
        keyboard: false,
        bubblingMouseEvents: false,
      }).bindTooltip(createTooltip(station), {
        className: 'deal-map-station-tooltip',
        direction: 'top',
        offset: [0, -8],
      }),
    ),
  )
  const sync = () => {
    const visible = stationsVisibleAt(map.getZoom())
    if (visible && !map.hasLayer(layer)) layer.addTo(map)
    if (!visible && map.hasLayer(layer)) layer.remove()
  }
  map.on('zoomend', sync)
  sync()
  return {
    sync,
    dispose: () => {
      map.off('zoomend', sync)
      layer.remove()
    },
  }
}
