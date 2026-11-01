// Leaflet defaults for the public browse map. Tile providers live in basemap.ts.
export const SINGAPORE_CENTER = { lat: 1.3521, lng: 103.8198 } as const
// Zoom used when the map focuses a selected deal or venue.
export const FOCUS_ZOOM = 15
// "Near me" lands much closer in, at walking-street level around the visitor.
export const LOCATE_ZOOM = 17
export const MIN_ZOOM = 3
export const MAX_ZOOM = 19
// Selecting a deal flies there; hopping to a deal this close (at street zoom) pans instead.
export const FLY_DURATION_S = 0.65
export const PAN_DURATION_S = 0.4
export const NEARBY_PAN_METRES = 1500
export const USER_DOT_SIZE_PX = 14
export const USER_DOT_CLASS = 'deal-map-user-dot'
// Soft sky-blue halo for the browser's accuracy radius; matches --sky in main.css.
export const USER_ACCURACY_STYLE = {
  color: '#4f7df3',
  weight: 0,
  fillColor: '#4f7df3',
  fillOpacity: 0.14,
} as const
export const MAX_ACCURACY_HALO_METRES = 500

// Venue pins (animated 3D food plus a black price badge) are built by venue-pin.ts; area and
// "Near you" pills by cluster-icon.ts, chosen per zoom by map-tiers.ts. Styled in DealMap.vue.
export const DEAL_PIN_CLASS = 'deal-map-pin'
export const DEAL_PIN_BUBBLE_PX = 44
// Longer labels are cut so a badge never grows into a banner across the map.
export const DEAL_PIN_LABEL_MAX_CHARS = 14
