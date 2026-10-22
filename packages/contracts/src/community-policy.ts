export const DEFAULT_COMMUNITY_POLICY = {
  minAlive: 3,
  positivePercent: 80,
  windowHours: 24,
} as const
export type CommunityPolicy = { minAlive: number; positivePercent: number; windowHours: number }
export type CommunityStatus = 'NO_RECENT_REPORTS' | 'UNCERTAIN' | 'LIKELY_STILL_ON' | 'EXPIRED'

// Counts must already be limited to each user's current vote in the freshness window.
export const communityStatus = (
  votes: { alive: number; dead: number },
  validUntil: string | null,
  now = new Date(),
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
): CommunityStatus => {
  if (validUntil && new Date(validUntil).getTime() <= now.getTime()) return 'EXPIRED'
  const total = votes.alive + votes.dead
  if (!total) return 'NO_RECENT_REPORTS'
  return votes.alive >= policy.minAlive && votes.alive * 100 >= total * policy.positivePercent
    ? 'LIKELY_STILL_ON'
    : 'UNCERTAIN'
}
