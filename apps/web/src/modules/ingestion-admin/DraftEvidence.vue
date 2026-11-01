<script setup lang="ts">
import type {
  CitationMetadata,
  CitationDetail as Detail,
} from '@broke-oclock/contracts/ingestion-evidence'
import { BButton } from '@broke-oclock/ui'
import { api } from '@web/lib/api-client'
import CitationDetail from '@web/modules/ingestion-admin/CitationDetail.vue'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ dealId: string; contentVersion: number }>()
const emit = defineEmits<{ denied: [code: string]; investigate: [postId: string] }>()
const items = ref<CitationMetadata[]>([]),
  next = ref<string | null>(null),
  selected = ref<string | null>(null),
  detail = ref<Detail | null>(null)
const pending = ref(false),
  detailPending = ref(false),
  error = ref(''),
  detailError = ref('')
let generation = 0,
  listRequest = 0,
  detailRequest = 0,
  closed = false
const deny = (failure: unknown) => {
  const code = errorCode(failure)
  if (code !== 'UNAUTHORIZED' && code !== 'FORBIDDEN') return false
  closed = true
  generation++
  items.value = []
  detail.value = null
  selected.value = null
  emit('denied', code)
  return true
}
const load = async (cursor?: string) => {
  if (closed || pending.value) return
  const epoch = generation,
    ticket = ++listRequest
  pending.value = true
  error.value = ''
  try {
    const page = await api.ingestionInvestigation.evidence(props.dealId, {
      limit: 20,
      ...(cursor ? { cursor } : {}),
    })
    if (closed || epoch !== generation || ticket !== listRequest) return
    items.value = [
      ...new Map(
        [...(cursor ? items.value : []), ...page.items].map((item) => [item.id, item]),
      ).values(),
    ]
    next.value = page.nextCursor === cursor ? null : page.nextCursor
  } catch (failure) {
    if (epoch === generation && ticket === listRequest && !deny(failure))
      error.value = 'Unable to load source evidence. Retry this read.'
  } finally {
    if (epoch === generation && ticket === listRequest) pending.value = false
  }
}
const view = async (id: string, cursor?: string) => {
  if (closed || detailPending.value) return
  const epoch = generation,
    ticket = ++detailRequest
  selected.value = id
  detailPending.value = true
  detailError.value = ''
  if (!cursor) detail.value = null
  try {
    const value = await api.ingestionInvestigation.citation(props.dealId, id, {
      limit: 20,
      ...(cursor ? { cursor } : {}),
    })
    if (closed || epoch !== generation || ticket !== detailRequest || selected.value !== id) return
    detail.value = {
      ...value,
      images: [
        ...new Map(
          [...(cursor ? (detail.value?.images ?? []) : []), ...value.images].map((image) => [
            image.id,
            image,
          ]),
        ).values(),
      ].slice(-20),
    }
  } catch (failure) {
    if (epoch === generation && ticket === detailRequest && !deny(failure))
      detailError.value = 'Unable to load this citation. No source content was reconstructed.'
  } finally {
    if (epoch === generation && ticket === detailRequest) detailPending.value = false
  }
}
watch(
  [() => props.dealId, () => props.contentVersion],
  () => {
    generation++
    listRequest++
    detailRequest++
    pending.value = false
    detailPending.value = false
    items.value = []
    detail.value = null
    selected.value = null
    next.value = null
    error.value = ''
    detailError.value = ''
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  closed = true
  generation++
})
</script>
<template>
 <section aria-label="Immutable source evidence" class="my-4">
  <h4 class="h6">Immutable source evidence</h4><p>All pinned citations, not only the first source. Current source state is separate from immutable evidence; disabled sources remain readable.</p>
  <p v-if="pending" role="status">Loading evidence…</p><p v-if="error" role="alert">{{ error }}</p><BButton v-if="error" :disabled="pending" @click="load()">Retry evidence read</BButton>
  <p v-if="!pending && !error && !items.length">No citations on this page.</p>
  <ul><li v-for="item in items" :key="item.id" class="text-break"><strong>{{ item.source.name }}</strong> · {{ item.source.provider }} / {{ item.source.externalId }} · {{ item.source.enabled ? 'Enabled' : 'Disabled' }}<br>Pinned {{ item.pinnedHash }}<br>Current {{ item.currentHash }} · {{ item.hashMatchesCurrent ? 'Matches pinned hash' : 'SOURCE CHANGED' }}<br>Latest envelope {{ item.latestSnapshotHash ?? 'Missing (legacy)' }}<br>{{ item.postStatus }} · {{ item.errorCode ?? 'No error' }} · {{ item.imageCount }} image(s) · Fetched {{ item.fetchedAt }}<br><BButton :disabled="detailPending" @click="view(item.id)">Read citation {{ item.id }}</BButton><BButton @click="$emit('investigate', item.postId)">Investigate post</BButton></li></ul>
  <BButton v-if="next" :disabled="pending" @click="load(next)">More citations</BButton>
  <p v-if="detailPending" role="status">Loading exact citation…</p><p v-if="detailError" role="alert">{{ detailError }}</p><BButton v-if="detailError && selected" @click="view(selected)">Retry citation read</BButton>
  <CitationDetail v-if="detail" :detail="detail" :pending="detailPending" @more="view(detail.citation.id, detail.nextImageCursor ?? undefined)" />
 </section>
</template>
