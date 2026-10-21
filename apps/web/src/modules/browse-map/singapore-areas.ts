import type { Coordinates } from '@web/modules/browse-map/types'

// Rough centre points of the neighbourhoods people name when they talk about where to eat.
// Group pills take the nearest one, so names only need to be recognisable, not surveyed.
// Regions follow URA's five planning regions, which is why Holland and Toa Payoh are Central.
export const SINGAPORE_REGIONS = ['Central', 'East', 'North', 'North-East', 'West'] as const
export type SingaporeRegion = (typeof SINGAPORE_REGIONS)[number]

export type SingaporeArea = Coordinates & {
  readonly name: string
  readonly region: SingaporeRegion
}

export const SINGAPORE_AREAS: readonly SingaporeArea[] = [
  { name: 'Orchard', region: 'Central', lat: 1.3048, lng: 103.8318 },
  { name: 'Somerset', region: 'Central', lat: 1.3007, lng: 103.839 },
  { name: 'Tanglin', region: 'Central', lat: 1.306, lng: 103.818 },
  { name: 'Dempsey', region: 'Central', lat: 1.305, lng: 103.809 },
  { name: 'River Valley', region: 'Central', lat: 1.295, lng: 103.83 },
  { name: 'Robertson Quay', region: 'Central', lat: 1.2915, lng: 103.8385 },
  { name: 'Clarke Quay', region: 'Central', lat: 1.2906, lng: 103.8465 },
  { name: 'City Hall', region: 'Central', lat: 1.2931, lng: 103.852 },
  { name: 'Bras Basah', region: 'Central', lat: 1.2966, lng: 103.852 },
  { name: 'Bugis', region: 'Central', lat: 1.3005, lng: 103.8558 },
  { name: 'Little India', region: 'Central', lat: 1.3066, lng: 103.8494 },
  { name: 'Farrer Park', region: 'Central', lat: 1.3124, lng: 103.8541 },
  { name: 'Newton', region: 'Central', lat: 1.3138, lng: 103.838 },
  { name: 'Novena', region: 'Central', lat: 1.3204, lng: 103.8438 },
  { name: 'Balestier', region: 'Central', lat: 1.326, lng: 103.85 },
  { name: 'Raffles Place', region: 'Central', lat: 1.284, lng: 103.8515 },
  { name: 'Marina Bay', region: 'Central', lat: 1.282, lng: 103.859 },
  { name: 'Chinatown', region: 'Central', lat: 1.2833, lng: 103.8443 },
  { name: 'Tanjong Pagar', region: 'Central', lat: 1.2765, lng: 103.8455 },
  { name: 'Outram', region: 'Central', lat: 1.28, lng: 103.8395 },
  { name: 'Tiong Bahru', region: 'Central', lat: 1.286, lng: 103.827 },
  { name: 'Redhill', region: 'Central', lat: 1.2896, lng: 103.8168 },
  { name: 'HarbourFront', region: 'Central', lat: 1.265, lng: 103.822 },
  { name: 'Sentosa', region: 'Central', lat: 1.249, lng: 103.83 },
  { name: 'Lavender', region: 'Central', lat: 1.3074, lng: 103.863 },
  { name: 'Kallang', region: 'Central', lat: 1.311, lng: 103.871 },
  { name: 'Geylang', region: 'East', lat: 1.318, lng: 103.887 },
  { name: 'Paya Lebar', region: 'East', lat: 1.318, lng: 103.893 },
  { name: 'Katong', region: 'East', lat: 1.305, lng: 103.905 },
  { name: 'Bedok', region: 'East', lat: 1.324, lng: 103.93 },
  { name: 'Tampines', region: 'East', lat: 1.353, lng: 103.945 },
  { name: 'Pasir Ris', region: 'East', lat: 1.373, lng: 103.949 },
  { name: 'Changi', region: 'East', lat: 1.357, lng: 103.988 },
  { name: 'Toa Payoh', region: 'Central', lat: 1.3343, lng: 103.8563 },
  { name: 'Bishan', region: 'Central', lat: 1.351, lng: 103.848 },
  { name: 'Thomson', region: 'Central', lat: 1.354, lng: 103.833 },
  { name: 'Ang Mo Kio', region: 'North-East', lat: 1.37, lng: 103.8495 },
  { name: 'Serangoon', region: 'North-East', lat: 1.35, lng: 103.873 },
  { name: 'Hougang', region: 'North-East', lat: 1.371, lng: 103.892 },
  { name: 'Sengkang', region: 'North-East', lat: 1.391, lng: 103.895 },
  { name: 'Punggol', region: 'North-East', lat: 1.405, lng: 103.902 },
  { name: 'Seletar', region: 'North-East', lat: 1.404, lng: 103.869 },
  { name: 'Yishun', region: 'North', lat: 1.429, lng: 103.835 },
  { name: 'Sembawang', region: 'North', lat: 1.449, lng: 103.82 },
  { name: 'Woodlands', region: 'North', lat: 1.436, lng: 103.786 },
  { name: 'Bukit Timah', region: 'Central', lat: 1.329, lng: 103.802 },
  { name: 'Holland Village', region: 'Central', lat: 1.311, lng: 103.796 },
  { name: 'Buona Vista', region: 'Central', lat: 1.307, lng: 103.79 },
  { name: 'Queenstown', region: 'Central', lat: 1.294, lng: 103.806 },
  { name: 'Kent Ridge', region: 'Central', lat: 1.2966, lng: 103.7764 },
  { name: 'Pasir Panjang', region: 'Central', lat: 1.276, lng: 103.791 },
  { name: 'Clementi', region: 'West', lat: 1.315, lng: 103.765 },
  { name: 'Jurong East', region: 'West', lat: 1.333, lng: 103.742 },
  { name: 'Jurong West', region: 'West', lat: 1.34, lng: 103.707 },
  { name: 'Bukit Batok', region: 'West', lat: 1.349, lng: 103.75 },
  { name: 'Bukit Panjang', region: 'West', lat: 1.378, lng: 103.762 },
  { name: 'Choa Chu Kang', region: 'West', lat: 1.385, lng: 103.744 },
]
