import {
  AWAY_AFTER_MS,
  choiceOutcome,
  keepLookingOutcome,
  nextHost,
  roomCode,
  sameName,
  tally,
  voters,
  votingOutcome,
} from '@api/modules/squad/rules'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-01T10:00:00.000Z')
const seat = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  spectator: false,
  leftAt: null,
  kickedAt: null,
  lastSeenAt: NOW,
  joinedAt: new Date(NOW.getTime() - Number.parseInt(id.slice(1), 10) * 1000),
  ...overrides,
})
const ballot = (memberId: string, stance: string | null, choice: string | null = null) => ({
  memberId,
  stance,
  choice,
})

describe('who votes', () => {
  it('leaves out spectators, people who left or were removed, and anyone gone quiet', () => {
    const seats = [
      seat('m1'),
      seat('m2', { spectator: true }),
      seat('m3', { leftAt: NOW }),
      seat('m4', { kickedAt: NOW }),
      seat('m5', { lastSeenAt: new Date(NOW.getTime() - AWAY_AFTER_MS - 1) }),
    ]
    expect(voters(seats, NOW).map((s) => s.id)).toEqual(['m1'])
  })
})

describe('votingOutcome', () => {
  const ids = ['m1', 'm2', 'm3', 'm4']

  it('matches as soon as more than half say yay', () => {
    expect(
      votingOutcome(ids, [ballot('m1', 'YAY'), ballot('m2', 'YAY'), ballot('m3', 'YAY')]),
    ).toBe('MATCH')
  })

  it('treats exactly half as not enough, once everyone has voted', () => {
    const half = [ballot('m1', 'YAY'), ballot('m2', 'YAY'), ballot('m3', 'NAH')]
    expect(votingOutcome(ids, half)).toBeNull()
    expect(votingOutcome(ids, [...half, ballot('m4', 'NAH')])).toBe('DECIDE')
  })

  it('waits for nobody when the room is empty', () => {
    expect(votingOutcome([], [])).toBeNull()
  })
})

describe('choiceOutcome', () => {
  const ids = ['m1', 'm2', 'm3']

  it('needs everyone to choose, and more than half to vote again', () => {
    expect(
      choiceOutcome(ids, [ballot('m1', 'NAH', 'AGAIN'), ballot('m2', 'NAH', 'AGAIN')]),
    ).toBeNull()
    expect(
      choiceOutcome(ids, [
        ballot('m1', 'NAH', 'AGAIN'),
        ballot('m2', 'NAH', 'AGAIN'),
        ballot('m3', 'YAY', 'NEXT'),
      ]),
    ).toBe('AGAIN')
    expect(
      choiceOutcome(['m1', 'm2'], [ballot('m1', 'NAH', 'AGAIN'), ballot('m2', 'NAH', 'NEXT')]),
    ).toBe('NEXT')
  })

  it('moves on as soon as at least 80% pick the next deal, without waiting for the rest', () => {
    const five = ['m1', 'm2', 'm3', 'm4', 'm5']
    const next = (id: string) => ballot(id, 'NAH', 'NEXT')
    expect(choiceOutcome(five, ['m1', 'm2', 'm3', 'm4'].map(next))).toBe('NEXT')
    expect(choiceOutcome(five, ['m1', 'm2', 'm3'].map(next))).toBeNull()
    expect(choiceOutcome(ids, [next('m1'), next('m2')])).toBeNull()
  })

  it('leaves a match only once at least 80% want to keep looking', () => {
    const five = ['m1', 'm2', 'm3', 'm4', 'm5']
    const next = (id: string) => ballot(id, 'YAY', 'NEXT')
    expect(keepLookingOutcome(five, ['m1', 'm2', 'm3', 'm4'].map(next))).toBe('NEXT')
    expect(keepLookingOutcome(five, ['m1', 'm2', 'm3'].map(next))).toBeNull()
    expect(keepLookingOutcome(ids, [ballot('m1', 'YAY', 'AGAIN')])).toBeNull()
    expect(keepLookingOutcome([], [])).toBeNull()
  })

  it('counts each side for the tally', () => {
    expect(tally(ids, [ballot('m1', 'YAY', 'AGAIN'), ballot('m2', 'NAH')])).toEqual({
      voters: 3,
      yesPeople: 1,
      voted: 2,
      again: 1,
      next: 0,
    })
  })
})

describe('room housekeeping', () => {
  it('hands the host role to the longest-standing voter', () => {
    const seats = [
      seat('m1', { leftAt: NOW }),
      seat('m3'),
      seat('m9'),
      seat('m8', { spectator: true }),
    ]
    expect(nextHost(seats)?.id).toBe('m9')
    expect(nextHost([seat('m1', { leftAt: NOW })])).toBeNull()
  })

  it('makes four-letter codes and compares names loosely', () => {
    expect(roomCode(0, () => 0)).toBe('KOPI')
    expect(roomCode(50, () => 1)).toMatch(/^[A-Z]{4}$/)
    expect(sameName(' Noah ', 'noah')).toBe(true)
  })
})
