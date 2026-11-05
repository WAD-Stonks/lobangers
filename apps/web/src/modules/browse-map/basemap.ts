import type { Theme } from '@web/lib/theme'

export type BasemapProvider = 'carto' | 'onemap'

export type Basemap = {
  readonly provider: BasemapProvider
  readonly url: string
  readonly attribution: string
  readonly maxNativeZoom: number
}

const CARTO_MAX_NATIVE_ZOOM = 18
const ONEMAP_MAX_NATIVE_ZOOM = 19

export const CARTO_STYLE = 'light_all'
const CARTO_DARK_STYLE = 'dark_all'
const CARTO_TILE_HOST = 'https://basemaps.cartocdn.com/rastertiles'
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attribution/">CARTO</a>'

export const ONEMAP_STYLE = 'Grey'
const ONEMAP_DARK_STYLE = 'Night'
const oneMapTileUrl = (style: string) =>
  `https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`
const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:1rem;width:1rem;vertical-align:text-bottom"/> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'

const PLACEHOLDER_KEYS = new Set(['unset', 'unconfigured'])

const isConfiguredKey = (key: string | undefined): key is string => {
  const trimmed = key?.trim() ?? ''
  return trimmed.length > 0 && !PLACEHOLDER_KEYS.has(trimmed.toLowerCase())
}

export const resolveBasemap = (
  cartoApiKey: string | undefined,
  theme: Theme = 'light',
): Basemap => {
  const dark = theme === 'dark'
  if (!isConfiguredKey(cartoApiKey)) {
    return {
      provider: 'onemap',
      url: oneMapTileUrl(dark ? ONEMAP_DARK_STYLE : ONEMAP_STYLE),
      attribution: ONEMAP_ATTRIBUTION,
      maxNativeZoom: ONEMAP_MAX_NATIVE_ZOOM,
    }
  }
  const key = encodeURIComponent(cartoApiKey.trim())
  return {
    provider: 'carto',
    url: `${CARTO_TILE_HOST}/${dark ? CARTO_DARK_STYLE : CARTO_STYLE}/{z}/{x}/{y}{r}.png?key=${key}`,
    attribution: CARTO_ATTRIBUTION,
    maxNativeZoom: CARTO_MAX_NATIVE_ZOOM,
  }
}

export const readCartoApiKey = (): string | undefined => import.meta.env.VITE_CARTO_API_KEY
