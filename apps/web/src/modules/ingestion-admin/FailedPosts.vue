<script setup lang="ts">
import type { PostsPage } from '@broke-oclock/contracts/ingestion-recovery'
import { BButton } from '@broke-oclock/ui'
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromValues } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { adminRecordId } from '@web/lib/admin-workflow-links'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import PostInvestigation from '@web/modules/ingestion-admin/PostInvestigation.vue'
import { clearRecoveryWorkspace, useRecoveryWorkspace } from '@web/modules/ingestion-admin/recovery-workspace'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const STATUS_OPTIONS = optionsFromValues(['FAILED', 'NEW', 'PARSED', 'NEEDS_REVIEW', 'IGNORED'])

const props = withDefaults(defineProps<{ initialPostId?: string; active?: boolean }>(), { active: true })
const workspace = useRecoveryWorkspace()
const investigationBusy = ref(false)
const emit = defineEmits<{ denied: [code: string]; busy: [value: boolean] }>()
const status = ref<'FAILED'|'NEW'|'PARSED'|'NEEDS_REVIEW'|'IGNORED'>('FAILED'), sourceId = ref(''), code = ref(''), items = ref<PostsPage['items']>([]), next = ref<string | null>(null), selected = ref<string | null>(null), pending = ref(false), error = ref('')
const loaded = ref(false)
let generation = 0, closed = false
let queuedPostId: string | null | undefined
const statusFilter = computed({ get: () => status.value, set: value => { if (!closed && !investigationBusy.value) status.value = value } })
const sourceFilter = computed({ get: () => sourceId.value, set: value => { if (!closed && !investigationBusy.value) sourceId.value = value } })
const codeFilter = computed({ get: () => code.value, set: value => { if (!closed && !investigationBusy.value) code.value = value } })
watch(investigationBusy, value => {
 emit('busy', value)
 if (!value && !closed && queuedPostId !== undefined) { selected.value = queuedPostId; queuedPostId = undefined }
}, { immediate: true, flush: 'sync' })
watch(() => adminRecordId(props.initialPostId) ?? null, value => {
 if (closed) return
 if (investigationBusy.value) queuedPostId = value
 else selected.value = value
}, { immediate: true, flush: 'sync' })
const selectPost = (id: string) => { if (!closed && !investigationBusy.value) selected.value = adminRecordId(id) ?? null }
const denied = (value: string) => { closed = true; queuedPostId = undefined; clearRecoveryWorkspace(workspace); generation++; items.value = []; selected.value = null; loaded.value = false; emit('denied', value) }
const load = async (cursor?: string) => {
 if (closed || pending.value || investigationBusy.value) return
 const epoch = ++generation; pending.value = true; error.value = ''
 try { const result = await api.ingestionInvestigation.posts({ status: status.value, limit: 20, ...(sourceId.value ? { sourceId: sourceId.value } : {}), ...(code.value ? { errorCode: code.value } : {}), ...(cursor ? { cursor } : {}) }); if (closed || epoch !== generation) return; items.value = [...new Map([...(cursor ? items.value : []), ...result.items].map(item => [item.id, item])).values()]; next.value = result.nextCursor === cursor ? null : result.nextCursor; loaded.value = true } catch (failure) { if (epoch !== generation) return; const value = errorCode(failure); if (value === 'UNAUTHORIZED' || value === 'FORBIDDEN') denied(value); else error.value = 'Unable to load posts. Check filters and retry this read.' } finally { if (epoch === generation) pending.value = false }
}
watch([status, sourceId, code], () => { generation++; pending.value = false; items.value = []; selected.value = null; next.value = null; error.value = ''; loaded.value = false }, { flush: 'sync' })
watch(() => props.active, value => { if (value) void load() })
onMounted(() => { if (props.active) void load() }); onBeforeUnmount(() => { closed = true; generation++ })
</script>

<template>
 <section id="failed-posts" aria-label="Failed post investigation" class="card p-3 p-sm-4 mb-4">
  <h2 class="h4">Failed posts and source investigation</h2>
  <form @submit.prevent="load()"><label>Status<AppSelect v-model="statusFilter" name="post-status" :options="STATUS_OPTIONS" class="form-select" :disabled="investigationBusy || closed" /></label><label>Source ID<input v-model="sourceFilter" name="source-id" class="form-control" maxlength="24" spellcheck="false" autocomplete="off" autocapitalize="none" :disabled="investigationBusy || closed"></label><label>Error code<input v-model="codeFilter" name="error-code" class="form-control" maxlength="80" spellcheck="false" autocomplete="off" autocapitalize="none" :disabled="investigationBusy || closed"></label><BButton type="submit" :disabled="pending || investigationBusy || closed">Load matching posts</BButton></form>
  <TicketLoading v-if="pending" label="Loading posts…" /><p v-if="error" role="alert">{{ error }}</p><p v-if="!loaded && !pending && !error && !closed" role="status">Load matching posts to see results for these filters.</p><p v-if="loaded && !pending && !error && !items.length">No posts on this page. A bounded page can exclude unsupported sources.</p>
  <ul><li v-for="post in items" :key="post.id" class="text-break">{{ post.source.name }} · {{ post.externalId }} · {{ post.status }} · {{ post.errorCode ?? 'No error' }} · {{ post.failureStage ?? 'Stage unknown' }}<BButton class="ms-2" :disabled="investigationBusy || closed" @click="selectPost(post.id)">Investigate <span translate="no">{{ post.externalId }}</span></BButton></li></ul>
  <BButton v-if="next" :disabled="pending || investigationBusy || closed" @click="load(next)">More posts</BButton>
  <PostInvestigation v-if="selected" :post-id="selected" @denied="denied" @busy="investigationBusy = $event" />
 </section>
</template>

<style scoped>
section { min-width: 0; overflow-wrap: anywhere; }
form { display: grid; gap: .65rem; margin-block: 1rem; min-width: 0; }
label { display: block; min-width: 0; }
select, textarea, input:not([type="checkbox"]) { display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
button { max-width: 100%; white-space: normal; }
</style>
