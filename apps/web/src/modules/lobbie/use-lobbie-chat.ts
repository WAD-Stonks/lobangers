import {
  ASSISTANT_HISTORY_MAX,
  ASSISTANT_MESSAGE_MAX_CHARS,
  type AssistantChatBody,
  type AssistantChatResponse,
  type AssistantFilters,
  type AssistantMessage,
  NO_ASSISTANT_FILTERS,
} from '@broke-oclock/contracts/assistant'
import type { DealPin } from '@broke-oclock/contracts/deals'
import { ApiClientError, api } from '@web/lib/api-client'
import { toDealRows, toVenuePins } from '@web/modules/browse-map/load-deals'
import type { Coordinates, DealRow, VenuePin } from '@web/modules/browse-map/types'
import type { FilterToken } from '@web/modules/lobbie/filter-labels'
import { type LobbieSprite, replySprite } from '@web/modules/lobbie/sprites'
import { computed, type InjectionKey, inject, provide, type Ref, ref, shallowRef } from 'vue'

export const LOBBIE_GREETING =
  "I'm Lobbie the Lobang Lobster, I'm here to help you claw back some savings. What are you hungry for?"
export const LOBBIE_SUGGESTIONS = [
  'Cheap eats near me',
  'Lunch under $5',
  'Deals ending today',
] as const

const BUSY_REPLY = 'So many people asking at once! My claws are full. Try again in a minute?'
const FAILED_REPLY = "Sorry, I couldn't fetch deals just now. You can still browse them on the map!"

export type LobbieEntry =
  | { readonly id: number; readonly role: 'user'; readonly text: string }
  | {
      readonly id: number
      readonly role: 'assistant'
      readonly text: string
      readonly deals: readonly DealPin[]
      readonly failed: boolean
      readonly sprite: LobbieSprite
    }
  | { readonly id: number; readonly role: 'notice'; readonly text: string }

type Deps = {
  readonly position: Readonly<Ref<Coordinates | null>>
  readonly send?: (body: AssistantChatBody) => Promise<AssistantChatResponse>
}

const GREETING: LobbieEntry = {
  id: 0,
  role: 'assistant',
  text: LOBBIE_GREETING,
  deals: [],
  failed: false,
  sprite: 'hello',
}

const historyOf = (entries: readonly LobbieEntry[], fromId: number): AssistantMessage[] =>
  entries
    .filter((entry) => entry.id >= fromId && entry.id !== GREETING.id)
    .flatMap((entry): AssistantMessage[] => {
      if (entry.role === 'notice' || (entry.role === 'assistant' && entry.failed)) return []
      return [{ role: entry.role, text: entry.text }]
    })
    .slice(-ASSISTANT_HISTORY_MAX)

export const createLobbieChat = ({ position, send = (body) => api.assistant.chat(body) }: Deps) => {
  const entries = shallowRef<readonly LobbieEntry[]>([GREETING])
  const pending = ref(false)
  const activeFilters = shallowRef<AssistantFilters>(NO_ASSISTANT_FILTERS)
  let nextId = 1
  let historyFrom = nextId

  const push = (entry: LobbieEntry) => {
    entries.value = [...entries.value, entry]
  }

  const ask = async (question: string) => {
    const text = question.trim().slice(0, ASSISTANT_MESSAGE_MAX_CHARS)
    if (!text || pending.value) return
    push({ id: nextId++, role: 'user', text })
    pending.value = true
    try {
      const answer = await send({
        messages: historyOf(entries.value, historyFrom),
        position: position.value,
        filters: activeFilters.value,
      })
      activeFilters.value = answer.filters
      push({
        id: nextId++,
        role: 'assistant',
        text: answer.reply,
        deals: answer.deals,
        failed: false,
        sprite: replySprite(answer.deals),
      })
    } catch (error) {
      const busy = error instanceof ApiClientError && error.code === 'TOO_MANY_REQUESTS'
      push({
        id: nextId++,
        role: 'assistant',
        text: busy ? BUSY_REPLY : FAILED_REPLY,
        deals: [],
        failed: true,
        sprite: 'thinking',
      })
    } finally {
      pending.value = false
    }
  }

  const removeFilter = (token: FilterToken) => {
    if (pending.value) return
    activeFilters.value = token.next
    push({ id: nextId++, role: 'notice', text: `Removed “${token.label}”` })
  }

  const clearFilters = () => {
    if (pending.value) return
    activeFilters.value = NO_ASSISTANT_FILTERS
    historyFrom = nextId
    push({ id: nextId++, role: 'notice', text: 'Cleared all filters' })
  }

  const rowsFor = (deals: readonly DealPin[]): readonly DealRow[] =>
    deals.flatMap((deal) => toDealRows(toVenuePins([deal]), position.value))

  const latestDeals = computed(() => {
    const latest = [...entries.value].reverse().find((entry) => entry.role === 'assistant')
    return latest?.role === 'assistant' ? latest.deals : []
  })
  const resultPins = computed<readonly VenuePin[]>(() => {
    const pins = new Map<string, VenuePin>()
    for (const row of rowsFor(latestDeals.value)) {
      const existing = pins.get(row.venue.id)
      pins.set(
        row.venue.id,
        existing ? { ...existing, deals: [...existing.deals, row.deal] } : row.venue,
      )
    }
    return [...pins.values()]
  })

  return {
    entries,
    pending,
    activeFilters,
    ask,
    removeFilter,
    clearFilters,
    rowsFor,
    resultPins,
  }
}

export type LobbieChat = ReturnType<typeof createLobbieChat>

const LOBBIE_KEY: InjectionKey<LobbieChat> = Symbol('lobbie-chat')

export const provideLobbieChat = (deps: Deps): LobbieChat => {
  const chat = createLobbieChat(deps)
  provide(LOBBIE_KEY, chat)
  return chat
}

export const useLobbieChat = (): LobbieChat => {
  const chat = inject(LOBBIE_KEY, null)
  if (!chat) throw new Error('useLobbieChat() must be called inside MapShell')
  return chat
}
