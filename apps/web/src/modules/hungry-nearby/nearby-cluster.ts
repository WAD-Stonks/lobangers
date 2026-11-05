import type { PresenceAvatar } from '@broke-oclock/contracts/presence'

export type ScreenPerson = {
  readonly token: string
  readonly avatar: PresenceAvatar
  readonly lat: number
  readonly lng: number
  readonly x: number
  readonly y: number
}

export type PeopleChip = {
  readonly key: string
  readonly lat: number
  readonly lng: number
  readonly count: number
  readonly faces: readonly PresenceAvatar[]
}

export type PeoplePlan = {
  readonly loose: readonly ScreenPerson[]
  readonly chips: readonly PeopleChip[]
}

export const ALL_PEOPLE_FROM_ZOOM = 15
export const PEOPLE_AREA_FROM_ZOOM = 13
export const MAX_LOOSE_WHEN_GROUPED = 12
export const CHIP_FACES = 3
const AREA_CELL_PX = 72
const ISLAND_CELL_PX = 140

const cellSizeFor = (zoom: number) =>
  zoom >= PEOPLE_AREA_FROM_ZOOM ? AREA_CELL_PX : ISLAND_CELL_PX

const chipOf = (members: readonly ScreenPerson[]): PeopleChip => ({
  key: `people:${members.map((member) => member.token).sort()[0] ?? ''}`,
  lat: members.reduce((sum, member) => sum + member.lat, 0) / members.length,
  lng: members.reduce((sum, member) => sum + member.lng, 0) / members.length,
  count: members.length,
  faces: members.slice(0, CHIP_FACES).map((member) => member.avatar),
})

export const planPeople = (people: readonly ScreenPerson[], zoom: number): PeoplePlan => {
  if (zoom >= ALL_PEOPLE_FROM_ZOOM) return { loose: people, chips: [] }
  const size = cellSizeFor(zoom)
  const cells = people.reduce<ReadonlyMap<string, readonly ScreenPerson[]>>((acc, person) => {
    const key = `${Math.floor(person.x / size)}:${Math.floor(person.y / size)}`
    return new Map(acc).set(key, [...(acc.get(key) ?? []), person])
  }, new Map())
  const groups = [...cells.values()]
  const singles =
    zoom >= PEOPLE_AREA_FROM_ZOOM
      ? groups.filter((members) => members.length === 1).slice(0, MAX_LOOSE_WHEN_GROUPED)
      : []
  const singleTokens = new Set(singles.flatMap((members) => members.map((member) => member.token)))
  const chipped = groups.filter(
    (members) => !members.some((member) => singleTokens.has(member.token)),
  )
  return { loose: singles.flat(), chips: chipped.map(chipOf) }
}
