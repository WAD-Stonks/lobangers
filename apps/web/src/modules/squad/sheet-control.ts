import type { InjectionKey, Ref } from 'vue'

// What the map shell lets a panel do with the phone's bottom sheet: the Makan Squad room tucks
// itself down to a live bar so the map shows, then springs back up.
export type SheetControl = {
  readonly mode: Readonly<Ref<'sheet' | 'side'>>
  readonly minimised: Readonly<Ref<boolean>>
  readonly minimise: () => void
  readonly expand: () => void
}

export const SHEET_CONTROL_KEY: InjectionKey<SheetControl> = Symbol('sheet-control')
