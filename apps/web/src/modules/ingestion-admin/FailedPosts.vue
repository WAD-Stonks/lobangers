<script setup lang="ts">
import type { PostsPage } from '@broke-oclock/contracts/ingestion-recovery'
import { BButton } from '@broke-oclock/ui'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import PostInvestigation from '@web/modules/ingestion-admin/PostInvestigation.vue'
import { clearRecoveryWorkspace, useRecoveryWorkspace } from '@web/modules/ingestion-admin/recovery-workspace'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const workspace = useRecoveryWorkspace()
const emit = defineEmits<{ denied: [code: string] }>()
const status = ref<'FAILED'|'NEW'|'PARSED'|'NEEDS_REVIEW'|'IGNORED'>('FAILED'), sourceId = ref(''), code = ref(''), items = ref<PostsPage['items']>([]), next = ref<string | null>(null), selected = ref<string | null>(null), pending = ref(false), error = ref('')
let generation = 0, closed = false
const denied = (value: string) => { clearRecoveryWorkspace(workspace); closed = true; generation++; items.value = []; selected.value = null; emit('denied', value) }
const load = async (cursor?: string) => {
 if (closed || pending.value) return
 const epoch = ++generation; pending.value = true; error.value = ''
 try { const result = await api.ingestionInvestigation.posts({ status: status.value, limit: 20, ...(sourceId.value ? { sourceId: sourceId.value } : {}), ...(code.value ? { errorCode: code.value } : {}), ...(cursor ? { cursor } : {}) }); if (closed || epoch !== generation) return; items.value = [...new Map([...(cursor ? items.value : []), ...result.items].map(item => [item.id, item])).values()]; next.value = result.nextCursor === cursor ? null : result.nextCursor } catch (failure) { if (epoch !== generation) return; const value = errorCode(failure); if (value === 'UNAUTHORIZED' || value === 'FORBIDDEN') denied(value); else error.value = 'Unable to load posts. Check filters and retry this read.' } finally { if (epoch === generation) pending.value = false }
}
watch([status, sourceId, code], () => { generation++; pending.value = false; items.value = []; selected.value = null; next.value = null; error.value = '' })
onMounted(() => load()); onBeforeUnmount(() => { closed = true; generation++ })
</script>

<template>
 <section id="failed-posts" aria-label="Failed post investigation" class="card p-4 mb-4">
  <h2 class="h4">Failed posts and source investigation</h2>
  <form @submit.prevent="load()"><label>Status<select v-model="status"><option v-for="value in ['FAILED','NEW','PARSED','NEEDS_REVIEW','IGNORED']" :key="value">{{ value }}</option></select></label><label>Source ID<input v-model="sourceId" maxlength="24"></label><label>Error code<input v-model="code" maxlength="80"></label><BButton type="submit" :disabled="pending">Load matching posts</BButton></form>
  <p v-if="pending" role="status">Loading posts…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="!pending && !error && !items.length">No posts on this page. A bounded page can exclude unsupported sources.</p>
  <ul><li v-for="post in items" :key="post.id" class="text-break">{{ post.source.name }} · {{ post.externalId }} · {{ post.status }} · {{ post.errorCode ?? 'No error' }} · {{ post.failureStage ?? 'Stage unknown' }}<BButton @click="selected = post.id">Investigate {{ post.externalId }}</BButton></li></ul>
  <BButton v-if="next" :disabled="pending" @click="load(next)">More posts</BButton>
  <PostInvestigation v-if="selected" :post-id="selected" @denied="denied" />
 </section>
</template>

<style scoped>
section { min-width: 0; overflow-wrap: anywhere; }
form { display: grid; gap: .65rem; margin-block: 1rem; min-width: 0; }
label { display: block; min-width: 0; }
select, textarea, input:not([type="checkbox"]) { display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
button { max-width: 100%; white-space: normal; }
</style>
