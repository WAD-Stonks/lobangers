<script setup lang="ts">
import { type IngestionSource, ingestionAddSourceRequestSchema } from '@broke-oclock/contracts/ingestion-sources'
import { BButton } from '@broke-oclock/ui'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onUnmounted, ref } from 'vue'

const emit = defineEmits<{ denied: [code: string]; changed: [] }>()
const items = ref<IngestionSource[] | null>(null)
const pending = ref(false)
const nextCursor = ref<string | null>(null)
const error = ref('')
const notice = ref('')
const name = ref('')
const previewUrl = ref('')
const invalidFields = ref<string[]>([])
const confirmedIds = ref<string[]>([])
let active = true
onUnmounted(() => { active = false })
const fail = (failure: unknown) => {
  const code = errorCode(failure)
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
    items.value = null
    nextCursor.value = null
    name.value = ''
    previewUrl.value = ''
    notice.value = ''
    confirmedIds.value = []
    emit('denied', code)
  }
  return code
}
const add = async () => {
  if (pending.value) return
  error.value = ''
  notice.value = ''
  const input = ingestionAddSourceRequestSchema.safeParse({ name: name.value, previewUrl: previewUrl.value })
  invalidFields.value = input.success ? [] : input.error.issues.map(issue => String(issue.path[0]))
  if (!input.success) {
    error.value = 'Enter a source name and use https://t.me/s/<publicusername> without parameters.'
    return
  }
  pending.value = true
  try {
    const source = await api.ingestion.addSource(input.data)
    if (!active) return
    items.value = [source, ...(items.value ?? []).filter(item => item.id !== source.id)]
    name.value = ''
    previewUrl.value = ''
    notice.value = `Added disabled source: ${source.url}. Review and confirm reuse before enabling.`
    emit('changed')
  } catch (failure) {
    if (!active) return
    const code = fail(failure)
    error.value = code === 'CONFLICT' ? 'This Telegram channel is already registered. Refresh sources to review it.' : 'Unable to add source. Refresh sources before trying again.'
  } finally { if (active) pending.value = false }
}
const refreshConflict = async (sourceId: string) => {
  items.value = null
  nextCursor.value = null
  confirmedIds.value = []
  const refreshed: IngestionSource[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const result = await api.ingestion.sources({ limit: 50, ...(cursor ? { cursor } : {}) })
    if (!active) return
    refreshed.push(...result.items)
    nextCursor.value = result.nextCursor
    if (result.items.some(item => item.id === sourceId) || !result.nextCursor) break
    if (seen.has(result.nextCursor)) throw new Error('Invalid source continuation')
    seen.add(result.nextCursor)
    cursor = result.nextCursor
  } while (cursor)
  items.value = [...new Map(refreshed.map(item => [item.id, item])).values()]
  confirmedIds.value = []
}
const toggle = async (source: IngestionSource) => {
  if (pending.value || source.provider !== 'TELEGRAM' || (!source.enabled && !confirmedIds.value.includes(source.id))) return
  pending.value = true
  error.value = ''
  notice.value = ''
  const reuseConfirmed = !source.enabled && confirmedIds.value.includes(source.id)
  confirmedIds.value = []
  try {
    const result = await api.ingestion.setSourceEnabled(source.id, {
      enabled: !source.enabled, expectedUpdatedAt: source.updatedAt, reuseConfirmed,
    })
    if (!active) return
    items.value = (items.value ?? []).map(item => item.id === result.id ? result : item)
    notice.value = `${result.name} is now ${result.enabled ? 'enabled' : 'disabled'}.`
    emit('changed')
  } catch (failure) {
    if (!active) return
    const code = fail(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return
    if (code === 'CONFLICT') {
      try {
        await refreshConflict(source.id)
        if (active) error.value = 'Source changed. Current sources were refreshed; review and confirm again. No change was replayed.'
      } catch (refreshFailure) {
        if (!active) return
        items.value = null
        nextCursor.value = null
        fail(refreshFailure)
        error.value = 'Source changed. Unable to refresh; reload sources before trying again.'
      }
    } else {
      items.value = null
      nextCursor.value = null
      error.value = 'Unable to confirm source change. Reload sources before trying again.'
    }
  } finally { if (active) pending.value = false }
}
const load = async (cursor?: string) => {
  if (pending.value) return
  pending.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await api.ingestion.sources({ limit: 20, ...(cursor ? { cursor } : {}) })
    if (!active) return
    const combined = cursor ? [...(items.value ?? []), ...result.items] : result.items
    items.value = [...new Map(combined.map(item => [item.id, item])).values()]
    nextCursor.value = result.nextCursor === cursor ? null : result.nextCursor
    confirmedIds.value = []
  } catch (failure) {
    if (!active) return
    items.value = null
    nextCursor.value = null
    fail(failure)
    error.value = 'Unable to load sources. Please retry.'
  } finally { if (active) pending.value = false }
}
</script>

<template>
  <section aria-labelledby="sources-title" class="card p-4 mb-4 text-break" :aria-busy="pending">
    <h2 id="sources-title" class="h4">Telegram sources</h2>
    <p class="text-secondary">Register public preview URLs here, not in server environment settings. New sources are disabled. Enabling requires your confirmation that reuse is permitted; a public URL alone does not grant permission.</p>
    <form class="row g-3 mb-3" @submit.prevent="add">
      <div class="col-12 col-md-4">
        <label for="source-name" class="form-label">Source name</label>
        <input id="source-name" v-model="name" class="form-control" maxlength="120" required :disabled="pending" :aria-invalid="invalidFields.includes('name')" aria-describedby="source-error">
      </div>
      <div class="col-12 col-md-8">
        <label for="source-preview-url" class="form-label">Telegram preview URL</label>
        <input id="source-preview-url" v-model="previewUrl" class="form-control" type="url" maxlength="128" required placeholder="https://t.me/s/ThisCounted" aria-describedby="source-url-help source-error" :aria-invalid="invalidFields.includes('previewUrl')" :disabled="pending">
        <p id="source-url-help" class="form-text mb-0">Use https://t.me/s/&lt;publicusername&gt;. Public channels only; no invite links, ports or URL parameters.</p>
      </div>
      <div class="col-12"><BButton type="submit" data-testid="add-source" variant="primary" :disabled="pending">Add disabled source</BButton></div>
    </form>
    <BButton data-testid="load-sources" :disabled="pending" @click="load()">{{ pending ? 'Please wait…' : items ? 'Refresh sources' : 'View sources' }}</BButton>
    <p v-if="error" id="source-error" role="alert" class="text-danger mt-3">{{ error }}</p>
    <p v-if="notice" role="status" class="mt-3">{{ notice }}</p>
    <p v-if="items?.length === 0" class="mt-3">No registered sources on this page.</p>
    <ul v-if="items?.length" class="list-unstyled mt-3 mb-0">
      <li v-for="source in items" :key="source.id" class="border-top py-3 text-break" :data-source-id="source.id">
        <h3 class="h6">{{ source.name }}</h3>
        <p class="mb-1">{{ source.provider }} · {{ source.enabled ? 'Enabled' : 'Disabled' }}</p>
        <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.url }}</a>
        <div v-if="source.provider === 'TELEGRAM'" class="mt-3">
          <div v-if="!source.enabled" class="form-check mb-2">
            <input :id="`source-reuse-${source.id}`" v-model="confirmedIds" :value="source.id" type="checkbox" class="form-check-input" :disabled="pending">
            <label :for="`source-reuse-${source.id}`" class="form-check-label">I have confirmed this source is permitted for use</label>
          </div>
          <BButton data-testid="toggle-source" :disabled="pending || (!source.enabled && !confirmedIds.includes(source.id))" @click="toggle(source)">{{ source.enabled ? 'Disable source' : 'Enable source' }}</BButton>
        </div>
        <p v-if="source.provider === 'WORDPRESS'" class="small mt-2 mb-0">Fixed WordPress source (read-only here).</p>
      </li>
    </ul>
    <BButton v-if="nextCursor" data-testid="more-sources" :disabled="pending" @click="load(nextCursor)">Load more sources</BButton>
  </section>
</template>
