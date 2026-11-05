import { adminUserAnalyticsResponseSchema } from '@broke-oclock/contracts/platform-admin'
import type { db } from '@broke-oclock/db'

const day = 24 * 60 * 60 * 1000
const week = 7 * day
const singaporeOffset = 8 * 60 * 60 * 1000

export const registrationWeeks = (now: Date) => {
  const local = new Date(now.getTime() + singaporeOffset)
  const daysSinceMonday = (local.getUTCDay() + 6) % 7
  const monday =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday) -
    singaporeOffset
  return Array.from({ length: 8 }, (_, index) => ({
    start: new Date(monday - (7 - index) * week),
    end: new Date(monday - (6 - index) * week),
  }))
}

export const readUserAnalytics = async (database: Pick<typeof db, 'user'>, now = new Date()) => {
  const weeks = registrationWeeks(now)
  const [totalUsers, ...counts] = await Promise.all([
    database.user.count({ where: { createdAt: { lt: now } } }),
    ...weeks.map(({ start, end }) =>
      database.user.count({
        where: { createdAt: { gte: start, lt: end > now ? now : end } },
      }),
    ),
  ])
  return adminUserAnalyticsResponseSchema.parse({
    generatedAt: now.toISOString(),
    timeZone: 'Asia/Singapore',
    totalUsers,
    newUsersThisWeek: counts[7],
    weeks: weeks.map(({ start, end }, index) => ({
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      newUsers: counts[index],
    })),
  })
}
