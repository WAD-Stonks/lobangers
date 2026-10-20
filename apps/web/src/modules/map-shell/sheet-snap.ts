// Snap rules for the bottom sheet. Heights are ascending (peek, half, full). Velocity is in
// px/ms and positive when the sheet is growing (finger moving up).
export const FLICK_VELOCITY = 0.11

type Release = { readonly height: number; readonly velocity: number; readonly start: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const snapIndex = (heights: readonly number[], release: Release): number => {
  const last = heights.length - 1
  if (Math.abs(release.velocity) > FLICK_VELOCITY) {
    return clamp(release.start + Math.sign(release.velocity), 0, last)
  }
  return heights.reduce(
    (best, height, index) =>
      Math.abs(height - release.height) < Math.abs((heights[best] ?? 0) - release.height)
        ? index
        : best,
    0,
  )
}
