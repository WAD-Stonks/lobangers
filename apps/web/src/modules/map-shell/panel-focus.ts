import { type InjectionKey, inject, type Ref, ref } from 'vue'

export const PANEL_FOCUS_KEY: InjectionKey<Ref<boolean>> = Symbol('panel-focus')

export const usePanelFocusFlag = (): Ref<boolean> => inject(PANEL_FOCUS_KEY, ref(false))
