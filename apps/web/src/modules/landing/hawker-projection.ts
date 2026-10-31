/** Shared orthographic front-left projection in the stall's 440 × 420 artboard.
 * x runs across the counter, y is height, z runs towards the back wall.
 * Every physical fixture, including the photo display, uses this basis.
 */
export const hawkerProject = (x: number, y: number, z: number) => ({
  x: 220 + x * 0.9 - z * 0.3,
  y: 395 + x * 0.035 - z * 0.32 - y * 0.9,
})
export const hawkerPoint = (x: number, y: number, z: number) => {
  const p = hawkerProject(x, y, z)
  return `${p.x},${p.y}`
}
export const hawkerFace = (points: readonly (readonly [number, number, number])[]) =>
  points.map((p) => hawkerPoint(...p)).join(' ')
export const hawkerPhotoAnchor = hawkerProject(0, 104, 24)
