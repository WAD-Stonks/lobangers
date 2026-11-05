<script setup lang="ts">
import type { IngestionRunsResponse } from '@broke-oclock/contracts/ingestion'
import { BButton } from '@broke-oclock/ui'
import TicketLoading from '@web/components/TicketLoading.vue'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { formatDateTime } from '@web/lib/format'
import { backgroundImport } from '@web/modules/ingestion-admin/background-import'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ revision: number; active?: boolean }>()
const emit = defineEmits<{ denied: [code: string] }>()
const items = ref<IngestionRunsResponse['items'] | null>(null)
const pending = ref(false)
const error = ref('')
const fence = createAdminReadFence()
const load = async () => {
  const current = fence.begin()
  pending.value = true
  error.value = ''
  try {
    const result = await api.ingestion.runs({ limit: 20 })
    if (fence.current(current)) { items.value = result.items; backgroundImport.resume(result.items) }
  } catch (failure) {
    if (!fence.current(current)) return
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    error.value = 'Unable to load runs. Please retry.'
  } finally {
    if (fence.current(current)) pending.value = false
  }
}
watch(() => props.revision, load, { immediate: true, flush: 'sync' })
watch(() => props.active, active => { if (active) void load() })
watch(() => backgroundImport.state.revision, () => { if (props.active) void load() })
onUnmounted(() => { fence.dispose(); items.value = null; error.value = '' })
</script>

<template>
  <section aria-labelledby="runs-title" class="card p-3 p-sm-4 mb-4" :aria-busy="pending">
    <header class="runs-heading"><h2 id="runs-title" class="h4">Recent runs</h2><BButton data-testid="refresh-runs" :disabled="pending" @click="load">{{ pending ? 'Refreshing…' : 'Refresh runs' }}</BButton></header>
    <TicketLoading v-if="pending" label="Loading runs…" />
    <div v-if="error" role="alert"><p>{{ error }}</p><BButton :disabled="pending" @click="load">Retry runs</BButton></div>
    <p v-if="!pending && !error && items?.length === 0">No ingestion runs yet.</p>
    <ul v-if="items?.length" class="list-unstyled mb-0">
      <li v-for="run in items" :key="run.id" class="border-top py-3">
        <h3 class="h6 text-break">{{ run.sourceName }} · {{ run.status }}</h3>
        <p class="small text-break mb-2">Run <span translate="no">{{ run.id }}</span> · Started <time :datetime="run.startedAt">{{ formatDateTime(run.startedAt) }}</time> · Finished <time v-if="run.finishedAt" :datetime="run.finishedAt">{{ formatDateTime(run.finishedAt) }}</time><template v-else>Not finished</template></p>
        <dl class="row small mb-0 run-counts">
          <div class="col-6 col-md-3"><dt>Fetched</dt><dd>{{ run.fetchedCount }}</dd></div>
          <div class="col-6 col-md-3"><dt>Created</dt><dd>{{ run.createdCount }}</dd></div>
          <div class="col-6 col-md-3"><dt>Updated</dt><dd>{{ run.updatedCount }}</dd></div>
          <div class="col-6 col-md-3"><dt>Failed</dt><dd>{{ run.failedCount }}</dd></div>
        </dl>
        <p v-if="run.errorCode" class="text-danger small mb-0 text-break">Error: <span translate="no">{{ run.errorCode }}</span></p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.run-counts dd { font-variant-numeric: tabular-nums; }
.runs-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.runs-heading h2 { margin: 0; }
</style>
