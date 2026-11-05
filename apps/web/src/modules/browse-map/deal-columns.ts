const MIN_COLUMN_PX = 224
export const COLUMN_GAP_PX = 14

export const columnsFor = (width: number): number =>
  Math.max(1, Math.floor((width + COLUMN_GAP_PX) / (MIN_COLUMN_PX + COLUMN_GAP_PX)))

export const dealColumns = <T>(items: readonly T[], count: number): T[][] =>
  Array.from({ length: count }, (_, column) => items.filter((_, index) => index % count === column))

const MIN_PHOTO_RATIO = 3 / 5
const MAX_PHOTO_RATIO = 2
export const DEFAULT_PHOTO_RATIO = 4 / 3

export const clampPhotoRatio = (ratio: number | undefined): number =>
  ratio ? Math.min(MAX_PHOTO_RATIO, Math.max(MIN_PHOTO_RATIO, ratio)) : DEFAULT_PHOTO_RATIO
