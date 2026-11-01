import { type InjectionKey, inject, provide, ref, watch } from 'vue'

export const MAP_SIDEBAR_STORAGE_KEY = 'lobangers.map.show-sidebar'

export const createMapPreferences = (storage?: Pick<Storage, 'getItem' | 'setItem'>) => {
  let visible = true
  try {
    visible = storage?.getItem(MAP_SIDEBAR_STORAGE_KEY) !== '0'
  } catch {
    /* Storage may be unavailable. */
  }
  const sidebarVisible = ref(visible)
  const tutorialStep = ref<number | null>(null)
  watch(
    sidebarVisible,
    (show) => {
      try {
        storage?.setItem(MAP_SIDEBAR_STORAGE_KEY, show ? '1' : '0')
      } catch {
        /* Keep the in-memory choice. */
      }
    },
    { flush: 'sync' },
  )
  return {
    sidebarVisible,
    tutorialStep,
    startTutorial: () => {
      tutorialStep.value = 0
    },
  }
}

type MapPreferences = ReturnType<typeof createMapPreferences>
const KEY: InjectionKey<MapPreferences> = Symbol('map-preferences')
export const provideMapPreferences = () => {
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  } catch {
    /* Browsing still works without storage. */
  }
  const preferences = createMapPreferences(storage)
  provide(KEY, preferences)
  return preferences
}
export const useMapPreferences = () => inject(KEY, null)
