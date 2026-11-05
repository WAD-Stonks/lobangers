export const AWAY_AFTER_MS = 40_000
export const SEEN_WRITE_AFTER_MS = 10_000
export const LOBBY_LIFETIME_MS = 30 * 60_000
export const MAX_REPLAY_EVENTS = 200
export const MAX_EFFECTS_PER_SEND = 3

const CODE_WORDS = ['KOPI', 'TEHO', 'LAKS', 'PRAT', 'MILO', 'ROTI', 'KAYA', 'MEEP', 'TAHU', 'SATE']
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'

export const roomCode = (attempt: number, random: (max: number) => number): string => {
  if (attempt < CODE_WORDS.length) return CODE_WORDS[random(CODE_WORDS.length)] ?? 'KOPI'
  return Array.from({ length: 4 }, () => LETTERS[random(LETTERS.length)]).join('')
}

export type Seat = {
  id: string
  spectator: boolean
  leftAt: Date | null
  kickedAt: Date | null
  lastSeenAt: Date
}

export const isPresent = (seat: Seat) => !seat.leftAt && !seat.kickedAt
export const isAway = (seat: Seat, now: Date) =>
  now.getTime() - seat.lastSeenAt.getTime() > AWAY_AFTER_MS
export const voters = <T extends Seat>(seats: readonly T[], now: Date): T[] =>
  seats.filter((seat) => isPresent(seat) && !seat.spectator && !isAway(seat, now))

export type Ballot = { memberId: string; stance: string | null; choice: string | null }

const byMember = (ballots: readonly Ballot[]) =>
  new Map(ballots.map((ballot) => [ballot.memberId, ballot]))

export const votingOutcome = (
  voterIds: readonly string[],
  ballots: readonly Ballot[],
): 'MATCH' | 'DECIDE' | null => {
  if (voterIds.length === 0) return null
  const cast = byMember(ballots)
  const yes = voterIds.filter((id) => cast.get(id)?.stance === 'YAY').length
  if (yes * 2 > voterIds.length) return 'MATCH'
  return voterIds.every((id) => cast.get(id)?.stance) ? 'DECIDE' : null
}

export const SKIP_DEAL_PERCENT = 80

export const keepLookingOutcome = (
  voterIds: readonly string[],
  ballots: readonly Ballot[],
): 'NEXT' | null => {
  if (voterIds.length === 0) return null
  const cast = byMember(ballots)
  const next = voterIds.filter((id) => cast.get(id)?.choice === 'NEXT').length
  return next * 100 >= voterIds.length * SKIP_DEAL_PERCENT ? 'NEXT' : null
}

export const choiceOutcome = (
  voterIds: readonly string[],
  ballots: readonly Ballot[],
): 'AGAIN' | 'NEXT' | null => {
  if (voterIds.length === 0) return null
  if (keepLookingOutcome(voterIds, ballots)) return 'NEXT'
  const cast = byMember(ballots)
  if (!voterIds.every((id) => cast.get(id)?.choice)) return null
  const again = voterIds.filter((id) => cast.get(id)?.choice === 'AGAIN').length
  return again * 2 > voterIds.length ? 'AGAIN' : 'NEXT'
}

export const tally = (voterIds: readonly string[], ballots: readonly Ballot[]) => {
  const cast = byMember(ballots)
  const of = (pick: (ballot: Ballot | undefined) => boolean) =>
    voterIds.filter((id) => pick(cast.get(id))).length
  return {
    voters: voterIds.length,
    yesPeople: of((ballot) => ballot?.stance === 'YAY'),
    voted: of((ballot) => !!ballot?.stance),
    again: of((ballot) => ballot?.choice === 'AGAIN'),
    next: of((ballot) => ballot?.choice === 'NEXT'),
  }
}

export const nextHost = <T extends Seat & { joinedAt: Date }>(seats: readonly T[]): T | null =>
  [...seats]
    .filter((seat) => isPresent(seat) && !seat.spectator)
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0] ?? null

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
