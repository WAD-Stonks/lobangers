import { mountNearbyLayer, type NearbyLayer } from '@web/modules/hungry-nearby/nearby-layer'
import type { HungryNearby } from '@web/modules/hungry-nearby/use-hungry-nearby'
import type L from 'leaflet'
import { onBeforeUnmount, type Ref, watch } from 'vue'

// Keeps the people layer on the shell's Leaflet map in step with the Hungry Nearby store.
// Nobody is drawn while the viewer is not looking.
export const useNearbyMap = (map: Readonly<Ref<L.Map | null>>, store: HungryNearby) => {
  let layer: NearbyLayer | null = null

  const draw = () => {
    if (!layer) return
    layer.update(
      store.looking.value ? store.people.value : [],
      store.looking.value ? store.me.value : null,
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
  watch([store.people, store.me, store.looking], draw)

  onBeforeUnmount(() => {
    layer?.dispose()
    layer = null
  })
}
