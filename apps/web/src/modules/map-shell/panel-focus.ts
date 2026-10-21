import { type InjectionKey, inject, type Ref, ref } from 'vue'

// After the first navigation, every newly mounted panel moves focus to its heading so screen
// reader users hear where they landed. On the first page load focus is left alone.
export const PANEL_FOCUS_KEY: InjectionKey<Ref<boolean>> = Symbol('panel-focus')

export const usePanelFocusFlag = (): Ref<boolean> => inject(PANEL_FOCUS_KEY, ref(false))
