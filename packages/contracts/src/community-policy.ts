export const COMMUNITY_POLICY = { minAlive: 3, positivePercent: 80, windowHours: 24 } as const
export type CommunityStatus = 'NO_RECENT_REPORTS' | 'UNCERTAIN' | 'LIKELY_STILL_ON' | 'EXPIRED'
export const communityStatus = (
  votes: { alive: number; dead: number },
  validUntil: string | null,
  now = new Date(),
): CommunityStatus => {
  if (validUntil && new Date(validUntil).getTime() <= now.getTime()) return 'EXPIRED'
  const total = votes.alive + votes.dead
  if (!total) return 'NO_RECENT_REPORTS'
  return votes.alive >= COMMUNITY_POLICY.minAlive &&
    votes.alive * 100 >= total * COMMUNITY_POLICY.positivePercent
    ? 'LIKELY_STILL_ON'
    : 'UNCERTAIN'
}
export const communityStatusLabels: Record<CommunityStatus, string> = {
  NO_RECENT_REPORTS: 'No recent reports',
  UNCERTAIN: 'Availability uncertain',
  LIKELY_STILL_ON: 'Likely still on',
  EXPIRED: 'Promotion has ended',
}
