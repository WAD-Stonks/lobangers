import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'

export const FIRST_IDLE_MS = 2500
export const REPEAT_IDLE_MS = 9000
export const BANNER_LIFE_MS = 5000

export const idleNeeded = (shownCount: number): number =>
  shownCount === 0 ? FIRST_IDLE_MS : REPEAT_IDLE_MS

export const isDue = (now: number, lastActivity: number, shownCount: number): boolean =>
  now - lastActivity >= idleNeeded(shownCount)

type Point = { lat: number; lng: number }

const squaredDistance = (a: Point, b: Point) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2

export const bannerOrder = (
  drops: readonly PublicFlashDrop[],
  user: Point | null,
  now: number,
): PublicFlashDrop[] =>
  drops
    .filter((drop) => drop.codesLeft > 0 && new Date(drop.endsAt).getTime() > now)
    .sort((a, b) =>
      user ? squaredDistance(user, a) - squaredDistance(user, b) : a.endsAt.localeCompare(b.endsAt),
    )

export const nextBannerDrop = (
  drops: readonly PublicFlashDrop[],
  user: Point | null,
  now: number,
  shownCount: number,
): PublicFlashDrop | null => {
  const order = bannerOrder(drops, user, now)
  return order.length === 0 ? null : (order[shownCount % order.length] ?? null)
}
