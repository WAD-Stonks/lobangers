// Masonry for the deal cards. Cards are dealt into columns left to right (1st, 2nd, 3rd, then
// back to the 1st), so the nearest-first order still reads across the top row. CSS columns would
// fill top to bottom instead, pushing the second-nearest deal to the bottom of column one.
const MIN_COLUMN_PX = 224 // 14rem
export const COLUMN_GAP_PX = 14

export const columnsFor = (width: number): number =>
  Math.max(1, Math.floor((width + COLUMN_GAP_PX) / (MIN_COLUMN_PX + COLUMN_GAP_PX)))

export const dealColumns = <T>(items: readonly T[], count: number): T[][] =>
  Array.from({ length: count }, (_, column) => items.filter((_, index) => index % count === column))

// Shape limits for deal photos (width / height): a 3:5 poster at the tallest, 2:1 at the widest,
// so one odd image cannot fill or flatten the layout.
const MIN_PHOTO_RATIO = 3 / 5
const MAX_PHOTO_RATIO = 2
// Held until a photo reports its size, so the frame does not start from nothing.
export const DEFAULT_PHOTO_RATIO = 4 / 3

export const clampPhotoRatio = (ratio: number | undefined): number =>
  ratio ? Math.min(MAX_PHOTO_RATIO, Math.max(MIN_PHOTO_RATIO, ratio)) : DEFAULT_PHOTO_RATIO
