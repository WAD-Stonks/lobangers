import type { InjectionKey, Ref } from 'vue'

export type SheetControl = {
  readonly mode: Readonly<Ref<'sheet' | 'side'>>
  readonly minimised: Readonly<Ref<boolean>>
  readonly minimise: () => void
  readonly expand: () => void
}

export const SHEET_CONTROL_KEY: InjectionKey<SheetControl> = Symbol('sheet-control')
