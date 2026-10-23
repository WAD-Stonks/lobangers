import {
  COMMUNITY_POLICY,
  type CommunityStatus,
  communityStatus,
  communityStatusLabels,
} from '@broke-oclock/contracts/community-policy'
import { hawkerPhotoAnchor } from '@web/modules/landing/hawker-projection'
import { clamp, segment } from '@web/modules/landing/use-story-progress'

export type SampleReport = Readonly<{
  id: string
  userId: string
  kind: 'alive' | 'ended' | 'changed'
  message: string
  observedAt: number
}>

// A fixed fictional clock keeps the example reproducible. These are never live reports.
export const SAMPLE_REPORT_TIME = Date.parse('2026-10-19T04:00:00Z')
const minutes = (n: number) => SAMPLE_REPORT_TIME - n * 60_000
export const sampleReports = [
  {
    id: 'lunch',
    userId: 'sample-alice',
    kind: 'alive',
    message: 'Still available during lunch!',
    observedAt: minutes(18),
  },
  {
    id: 'redeemed',
    userId: 'sample-bob',
    kind: 'alive',
    message: 'Redeemed this offer earlier.',
    observedAt: minutes(52),
  },
  {
    id: 'staff',
    userId: 'sample-charlie',
    kind: 'alive',
    message: 'Staff confirmed the promotion.',
    observedAt: minutes(180),
  },
  {
    id: 'ended',
    userId: 'sample-dana',
    kind: 'ended',
    message: 'Might have ended — check first.',
    observedAt: minutes(1920),
  },
  {
    id: 'terms',
    userId: 'sample-elliot',
    kind: 'changed',
    message: 'Terms have changed since yesterday.',
    observedAt: minutes(1620),
  },
] as const satisfies readonly SampleReport[]

export function reportAge(report: SampleReport, now = SAMPLE_REPORT_TIME) {
  const age = Math.max(0, Math.floor((now - report.observedAt) / 60_000))
  return age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`
}

export function deriveCommunityStatus(reports: readonly SampleReport[], now = SAMPLE_REPORT_TIME) {
  const cutoff = now - COMMUNITY_POLICY.windowHours * 3600000
  const recent = reports.filter((r) => r.observedAt <= now && r.observedAt > cutoff)
  const current = new Map<string, SampleReport>()
  for (const report of recent) {
    if (report.kind === 'changed') continue // A comment about terms is not an availability vote.
    const previous = current.get(report.userId)
    if (!previous || report.observedAt >= previous.observedAt) current.set(report.userId, report)
  }
  const votes = [...current.values()]
  const alive = votes.filter((r) => r.kind === 'alive').length
  const ended = votes.filter((r) => r.kind === 'ended').length
  const status = communityStatus({ alive, dead: ended }, null, new Date(now))
  return {
    status: communityStatusLabels[status],
    recent: recent.length,
    older: reports.filter((r) => r.observedAt <= cutoff).length,
    alive,
    ended,
  }
}

export const statusTone = (label: string) => {
  const status = (Object.keys(communityStatusLabels) as CommunityStatus[]).find(
    (key) => communityStatusLabels[key] === label,
  )
  return status === 'LIKELY_STILL_ON'
    ? 'on'
    : status === 'EXPIRED'
      ? 'ended'
      : status === 'NO_RECENT_REPORTS'
        ? 'neutral'
        : 'uncertain'
}

export function communityTimeline(progress: number, reduced = false) {
  const p = reduced ? 1 : clamp(progress)
  return {
    handoff: segment(p, 0, 0.34),
    base: segment(p, 0.1, 0.19),
    counter: segment(p, 0.15, 0.24),
    walls: segment(p, 0.17, 0.27),
    awning: segment(p, 0.23, 0.33),
    sign: segment(p, 0.25, 0.34),
    food: segment(p, 0.3, 0.39),
    decor: segment(p, 0.32, 0.4),
    reports: segment(p, 0.35, 0.55),
    pulse: segment(p, 0.55, 0.7),
    flip: segment(p, 0.7, 0.85),
    cta: segment(p, 0.85, 0.95),
  }
}

export function hawkerLayout(width: number, height: number, cta: number) {
  const mobile = width <= 1100
  const size = mobile
    ? Math.min(width <= 600 ? 320 : 440, width * 0.94, height * (width <= 600 ? 0.37 : 0.41))
    : Math.min(800, width * 0.43, height * 0.88)
  const x = width * (mobile ? 0.5 : 0.66)
  const top = height * (mobile ? 0.25 + cta * 0.17 : height <= 850 ? 0.18 : 0.12)
  return {
    mobile,
    size,
    x,
    top,
    height: (size * 420) / 440,
    signWidth: mobile ? Math.min(width - 32, size * 1.02) : Math.min(650, size * 0.85),
    signY: mobile ? top + size * (width <= 350 ? 0.18 : 0.12) : top + size * 0.18,
    foodY: top + (size * hawkerPhotoAnchor.y) / 440,
  }
}
