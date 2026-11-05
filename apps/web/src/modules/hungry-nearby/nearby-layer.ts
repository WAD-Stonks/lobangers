import type { MyPresence, NearbyPerson, PresenceAvatar } from '@broke-oclock/contracts/presence'
import {
  AVATAR_NAMES,
  avatarSrc,
  PERSON_LABEL,
  SELF_LABEL,
} from '@web/modules/hungry-nearby/avatars'
import {
  ALL_PEOPLE_FROM_ZOOM,
  type PeopleChip,
  planPeople,
} from '@web/modules/hungry-nearby/nearby-cluster'
import L from 'leaflet'
import '@web/modules/hungry-nearby/nearby.css'

export const AVATAR_PX = 34
const POKE_MS = 260
const LABEL_MS = 1800
const PEOPLE_Z = -1000
const LABEL_Z = 4000

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const face = (avatar: PresenceAvatar, className: string, size: number) => {
  const image = el('img', className)
  image.src = avatarSrc(avatar)
  image.alt = ''
  image.width = size
  image.height = size
  image.draggable = false
  image.decoding = 'async'
  return image
}

const spoken = (text: string) => el('span', 'visually-hidden', text)

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>[]>()

const LABEL_MARGIN_PX = 8

export const fitLabel = (root: HTMLElement) => {
  const label = root.querySelector<HTMLElement>('.nearby-person__label')
  const map = root.closest('.leaflet-container')
  if (!label || !map) return
  const current = Number.parseFloat(label.style.getPropertyValue('--label-shift')) || 0
  const bounds = map.getBoundingClientRect()
  const rect = label.getBoundingClientRect()
  const tooFarLeft = bounds.left + LABEL_MARGIN_PX - (rect.left - current)
  const tooFarRight = rect.right - current - (bounds.right - LABEL_MARGIN_PX)
  const shift = Math.round(tooFarLeft > 0 ? tooFarLeft : tooFarRight > 0 ? -tooFarRight : 0)
  if (shift !== current) label.style.setProperty('--label-shift', `${shift}px`)
}

export const poke = (root: HTMLElement, avatar: PresenceAvatar) => {
  const image = root.querySelector('img')
  for (const timer of timers.get(root) ?? []) clearTimeout(timer)
  fitLabel(root)
  if (root.classList.contains('is-poked')) {
    root.classList.remove('is-poked')
    void root.offsetWidth
  }
  root.classList.add('is-poked', 'is-labelled')
  if (image) image.src = avatarSrc(avatar, 'poked')
  timers.set(root, [
    setTimeout(() => {
      root.classList.remove('is-poked')
      if (image) image.src = avatarSrc(avatar)
    }, POKE_MS),
    setTimeout(() => root.classList.remove('is-labelled'), LABEL_MS),
  ])
}

const personIcon = (avatar: PresenceAvatar, label: string, self: boolean, name: string = label) => {
  const root = el('span', self ? 'nearby-person nearby-person--self' : 'nearby-person')
  root.dataset.avatar = avatar
  if (self) root.append(el('span', 'nearby-person__ground'))
  const visible = el('span', 'nearby-person__label', label)
  visible.setAttribute('aria-hidden', 'true')
  root.append(face(avatar, 'nearby-person__img', AVATAR_PX), visible, spoken(name))
  root.addEventListener('mouseenter', () => fitLabel(root))
  return L.divIcon({
    className: 'nearby-person-anchor',
    html: root,
    iconSize: [AVATAR_PX, AVATAR_PX],
    iconAnchor: [AVATAR_PX / 2, AVATAR_PX - 2],
  })
}

const chipLabel = (count: number) =>
  `${count} ${count === 1 ? 'lobanger' : 'lobangers'} nearby. Zoom in to see them.`

const chipIcon = (chip: PeopleChip) => {
  const root = el('span', 'nearby-chip')
  const faces = el('span', 'nearby-chip__faces')
  faces.setAttribute('aria-hidden', 'true')
  for (const avatar of chip.faces) faces.append(face(avatar, 'nearby-chip__face', 24))
  root.append(faces)
  const more = chip.count - chip.faces.length
  if (more > 0) {
    const count = el('span', 'nearby-chip__count', `+${more}`)
    count.setAttribute('aria-hidden', 'true')
    root.append(count)
  }
  root.append(spoken(chipLabel(chip.count)))
  return L.divIcon({ className: 'nearby-chip-anchor', html: root, iconSize: [0, 0] })
}

type Entry = { marker: L.Marker; person: NearbyPerson }

export const mountNearbyLayer = (map: L.Map, handlers: { readonly onSelf: () => void }) => {
  const layer = L.layerGroup().addTo(map)
  const entries = new Map<string, Entry>()
  let chips: L.Marker[] = []
  let self: { marker: L.Marker; key: string } | null = null
  let lastPeople: readonly NearbyPerson[] = []
  let lastMe: MyPresence | null = null

  const addPerson = (person: NearbyPerson): Entry => {
    const marker = L.marker([person.lat, person.lng], {
      icon: personIcon(person.avatar, PERSON_LABEL, false),
      title: PERSON_LABEL,
      alt: PERSON_LABEL,
      zIndexOffset: PEOPLE_Z,
      riseOnHover: false,
    }).addTo(layer)
    const entry = { marker, person }
    let lower: ReturnType<typeof setTimeout> | null = null
    const raise = (raised: boolean) => marker.setZIndexOffset(raised ? LABEL_Z : PEOPLE_Z)
    marker
      .on('mouseover', () => raise(true))
      .on('mouseout', () => lower === null && raise(false))
      .on('click', () => {
        const root = marker.getElement()?.querySelector<HTMLElement>('.nearby-person')
        if (root) poke(root, entry.person.avatar)
        raise(true)
        if (lower) clearTimeout(lower)
        lower = setTimeout(() => {
          lower = null
          raise(false)
        }, LABEL_MS)
      })
    return entry
  }

  const syncPeople = (visible: readonly NearbyPerson[]) => {
    const wanted = new Map(visible.map((person) => [person.token, person]))
    for (const [token, entry] of entries) {
      if (wanted.has(token)) continue
      layer.removeLayer(entry.marker)
      entries.delete(token)
    }
    for (const person of visible) {
      const kept = entries.get(person.token)
      if (!kept) {
        entries.set(person.token, addPerson(person))
        continue
      }
      if (kept.person.lat !== person.lat || kept.person.lng !== person.lng)
        kept.marker.setLatLng([person.lat, person.lng])
      if (kept.person.avatar !== person.avatar)
        kept.marker.setIcon(personIcon(person.avatar, PERSON_LABEL, false))
      kept.person = person
    }
  }

  const syncChips = (next: readonly PeopleChip[]) => {
    for (const chip of chips) layer.removeLayer(chip)
    chips = next.map((chip) =>
      L.marker([chip.lat, chip.lng], {
        icon: chipIcon(chip),
        title: chipLabel(chip.count),
        alt: chipLabel(chip.count),
        zIndexOffset: PEOPLE_Z,
      })
        .on('click', () => map.flyTo([chip.lat, chip.lng], ALL_PEOPLE_FROM_ZOOM, { duration: 0.6 }))
        .addTo(layer),
    )
  }

  const syncSelf = (me: MyPresence | null) => {
    const key = me ? `${me.avatar}:${me.lat}:${me.lng}` : null
    if (self && self.key === key) return
    if (self) layer.removeLayer(self.marker)
    self = null
    if (!me || !key) return
    const label = `${SELF_LABEL}: ${AVATAR_NAMES[me.avatar]}, shown about here to others`
    const marker = L.marker([me.lat, me.lng], {
      icon: personIcon(me.avatar, SELF_LABEL, true, label),
      title: label,
      alt: label,
      zIndexOffset: PEOPLE_Z + 1,
    })
      .on('click', () => {
        const root = marker.getElement()?.querySelector<HTMLElement>('.nearby-person')
        if (root) poke(root, me.avatar)
        handlers.onSelf()
      })
      .addTo(layer)
    self = { marker, key }
  }

  const render = () => {
    const zoom = map.getZoom()
    const placed = lastPeople.map((person) => {
      const point = map.project([person.lat, person.lng], zoom)
      return { ...person, x: point.x, y: point.y }
    })
    const plan = planPeople(placed, zoom)
    syncPeople(plan.loose.map(({ token, avatar, lat, lng }) => ({ token, avatar, lat, lng })))
    syncChips(plan.chips)
    syncSelf(lastMe)
  }

  map.on('zoomend', render)

  return {
    update: (people: readonly NearbyPerson[], me: MyPresence | null) => {
      lastPeople = people
      lastMe = me
      render()
    },
    dispose: () => {
      map.off('zoomend', render)
      layer.remove()
      entries.clear()
      chips = []
      self = null
    },
  }
}

export type NearbyLayer = ReturnType<typeof mountNearbyLayer>
