<script setup lang="ts">
import AppSelect from '@web/components/AppSelect.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import { optionsFromValues, type SelectOption } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { adminRecordId } from '@web/lib/admin-workflow-links'
import { formatDateTime } from '@web/lib/format'
import type { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'
import { computed } from 'vue'

const STATUS_OPTIONS = optionsFromValues(['PENDING', 'APPROVED', 'REJECTED'])
const DECISION_OPTIONS: readonly SelectOption[] = [
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REJECT', label: 'Reject' },
]

const props = defineProps<{ s: ReturnType<typeof usePlatformAdmin> }>()
const applicantHref = computed(() => {
  const id = adminRecordId(props.s.selectedRequest?.userId)
  if (!id) return undefined
  const returnTo = `/admin/accounts?requestStatus=${props.s.requestStatus}#merchant-requests`
  return `/admin/accounts?${new URLSearchParams({ accountId: id, returnTo })}`
})
</script>
<template>
<section aria-label="Merchant requests" class="workspace-surface">
        <h2 id="merchant-requests" class="h4">Merchant requests</h2>
        <label for="request-status" class="form-label">Request status</label>
        <AppSelect id="request-status" v-model="s.requestStatus" :options="STATUS_OPTIONS" :disabled="s.busy" class="form-select mb-3" />
        <TicketLoading v-if="s.requests.loading" label="Loading requests…" />
        <p v-if="s.requests.error" role="alert">{{ s.requests.error }}</p>
        <button type="button" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.requests.loading" data-testid="reload-requests" @click="s.loadRequests()">Reload requests</button>
        <p v-if="!s.requests.loading && !s.requests.error && !s.requests.data?.items.length">No requests match this status.</p>
        <ul class="list-unstyled"><li v-for="request in s.requests.data?.items" :key="request.id" class="mb-2"><button type="button" class="btn admin-record-button text-start" :class="{ 'is-selected': s.selectedRequest?.id === request.id }" :data-testid="`request-${request.id}`" :disabled="s.busy" @click="s.selectRequest(request.id)">Review request: {{ request.userName }} / {{ request.venueName }} ({{ request.status }})</button></li></ul>
        <button type="button" v-if="s.requests.data?.nextCursor" data-testid="more-requests" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.requests.loading" @click="s.loadRequests(true)">Load more requests</button>
        <article v-if="s.selectedRequest" aria-label="Request details" class="border-top pt-3">
          <h3 class="h5">{{ s.selectedRequest.venueName }} / {{ s.selectedRequest.merchantName }}</h3>
          <p>{{ s.selectedRequest.userName }} ({{ s.selectedRequest.userEmail }})</p>
          <p v-if="applicantHref"><AdminTaskLink data-testid="request-account" :to="applicantHref" :disabled="s.busy">View applicant account</AdminTaskLink></p>
          <p>{{ s.selectedRequest.message }}</p>
          <p>Status: {{ s.selectedRequest.status }} | Version {{ s.selectedRequest.version }} | <time :datetime="s.selectedRequest.createdAt">{{ formatDateTime(s.selectedRequest.createdAt) }}</time></p>
          <p v-if="s.selectedRequest.reviewNote">Review note: {{ s.selectedRequest.reviewNote }}</p>
          <p v-if="s.requestError || s.staleRequests.has(s.selectedRequest.id)" role="alert">{{ s.requestError || 'Request changed. Reload requests before trying again.' }}</p>
          <form v-if="s.selectedRequest.status === 'PENDING'" id="request-form" @submit.prevent="s.reviewRequest">
            <fieldset :disabled="s.busy || s.requests.loading">
              <label for="request-decision" class="form-label">Request decision</label>
              <AppSelect id="request-decision" v-model="s.decision" :options="DECISION_OPTIONS" class="form-select mb-3" />
              <p>Approval grants only this named stall. An eligible USER becomes MERCHANT. Existing staff roles are not silently downgraded.</p>
              <label for="request-note" class="form-label">Request review note (required)</label>
              <textarea id="request-note" v-model="s.requestNote" class="form-control mb-3" maxlength="500" required />
              <label class="d-block mb-3"><input id="request-confirm" v-model="s.requestConfirmed" type="checkbox" /> Confirm {{ s.decision }} for {{ s.selectedRequest.userEmail }} at {{ s.selectedRequest.venueName }}</label>
              <button class="btn btn-primary" type="submit" :disabled="!s.requestReady">{{ s.decision === 'APPROVE' ? 'Approve request' : 'Reject request' }}</button>
            </fieldset>
          </form>
        </article>
      </section>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>
