import { areaFor } from '@web/modules/browse-map/cluster-area'
import { SINGAPORE_AREAS } from '@web/modules/browse-map/singapore-areas'
import type { Coordinates } from '@web/modules/browse-map/types'

export const LOCATION_REGIONS = ['North', 'South', 'East', 'West', 'Central', 'North-East'] as const
export const LOCATION_TOWNS = [...SINGAPORE_AREAS].sort((a, b) => a.name.localeCompare(b.name))
const SOUTH_AREAS = new Set(['HarbourFront', 'Sentosa', 'Pasir Panjang', 'Tanjong Pagar', 'Outram'])

export const locationLabel = (value: string): string => value.replace(/^(region|town):/, '')

// Use the same nearest neighbourhood centres as map cluster labels. These are approximate
// neighbourhood groupings rather than administrative boundary polygons.
export const matchesLocation = (venue: Coordinates & { name: string }, value: string): boolean => {
  const selected = value.trim()
  if (!selected) return true
  const area = areaFor(venue)
  if (selected.startsWith('region:')) {
    const region = selected.slice(7)
    return region === 'South' ? SOUTH_AREAS.has(area.name) : area.region === region
  }
  if (selected.startsWith('town:')) return area.name === selected.slice(5)
  // Preserve previously shared location searches.
  return venue.name.toLocaleLowerCase().includes(selected.toLocaleLowerCase())
}
