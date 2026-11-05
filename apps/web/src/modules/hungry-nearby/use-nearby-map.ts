import type { Coordinates } from '@web/modules/browse-map/types'
import { mountNearbyLayer, type NearbyLayer } from '@web/modules/hungry-nearby/nearby-layer'
import type { HungryNearby } from '@web/modules/hungry-nearby/use-hungry-nearby'
import type L from 'leaflet'
import { onBeforeUnmount, type Ref, watch } from 'vue'

export const useNearbyMap = (
  map: Readonly<Ref<L.Map | null>>,
  store: HungryNearby,
  position: Readonly<Ref<Coordinates | null>>,
) => {
  let layer: NearbyLayer | null = null

  const ownSpot = () => {
    const me = store.me.value
    const here = position.value
    return me && here ? { ...me, lat: here.lat, lng: here.lng } : me
  }

  const draw = () => {
    if (!layer) return
    layer.update(
      store.looking.value ? store.people.value : [],
      store.looking.value ? ownSpot() : null,
    )
  }

  watch(
    map,
    (next) => {
      layer?.dispose()
      layer = next
        ? mountNearbyLayer(next, {
            onSelf: () => {
              store.popoverOpen.value = true
            },
          })
        : null
      draw()
    },
    { immediate: true },
  )
  watch([store.people, store.me, store.looking, position], draw)

  onBeforeUnmount(() => {
    layer?.dispose()
    layer = null
  })
}
