<script setup lang="ts">
import AccountSessionsPanel from '@web/modules/platform-security/AccountSessionsPanel.vue'
import FreshLoginNotice from '@web/modules/platform-security/FreshLoginNotice.vue'
import { type SecurityProps, useAccountSecurity } from '@web/modules/platform-security/use-account-security'

const props = defineProps<SecurityProps>()
const emit = defineEmits<{
  busy: [boolean]
  changed: [{ id: string; version: number }]
  denied: [string]
  freshnessRequired: []
}>()
const {
  account, sessions, context, action, selectedSession, loadingMore, note, confirmed,
  pending, loading, success, error, blocked, currentEvidence, safeVersion, self,
  uncertain, freshness, accountActionLabel, actionLabel, reload, moreSessions, submit,
} = useAccountSecurity(props, emit)
</script>

<template>
  <section aria-label="Account security" class="card p-3 security-panel" :aria-busy="loading || pending">
    <h3 class="h5">Account security</h3>
    <button
      type="button"
      data-testid="security-reload"
      class="btn btn-outline-secondary align-self-start mb-3"
      :disabled="pending || disabled"
      @click="reload"
    >Reload security</button>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="loading" role="status">Loading security…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="uncertain && !error" role="alert">
      Result unknown. Do not repeat this action; reload security and wait for a newer account version.
    </p>
    <FreshLoginNotice v-if="freshness || context?.reauthenticationRequired" />
    <p v-if="context" class="small text-muted">
      Server checks freshness for every action. Sign-in age shown here is informational only.
      Fresh-login window reported by server: {{ context.freshLoginUntil ?? 'Unavailable' }}.
    </p>
    <p v-if="self" role="status">
      Use your existing session controls for your own account. Administrator security actions
      are for other accounts only.
    </p>
    <p v-if="account && !currentEvidence" role="status">
      Reload security: newer account evidence is required before another action.
    </p>
    <template v-if="account">
      <p class="small text-muted">Account ID: {{ userId }} · Version {{ safeVersion }}</p>
      <p class="fw-semibold">{{ account.state }}</p>
      <p v-if="account.suspendedAt" class="small">
        Suspended at: <time :datetime="account.suspendedAt">{{ account.suspendedAt }}</time>
      </p>
      <div class="security-methods mb-3">
        <p>Email verified: {{ account.emailVerified ? 'Yes' : 'No' }}</p>
        <p>Password configured: {{ account.methods.passwordConfigured ? 'Yes' : 'No' }}</p>
        <p>Google linked: {{ account.methods.googleLinked ? 'Yes' : 'No' }}</p>
        <p>Email OTP available: {{ account.methods.emailOtpAvailable ? 'Yes' : 'No' }}</p>
      </div>
      <p>Suspension is indefinite, ends all sessions and preserves content and grants.</p>
      <p>Reinstatement requires a new sign-in by the target account; ended sessions are not restored.</p>
      <AccountSessionsPanel
        v-if="sessions"
        v-model:selected-session="selectedSession"
        :page="sessions"
        :disabled="pending || !!disabled || self || loading"
        :loading-more="loadingMore"
        @more="moreSessions"
      />
      <form data-testid="security-form" class="mt-3" @submit.prevent="submit">
        <fieldset :disabled="pending || disabled || self">
          <legend class="h6">Security action</legend>
          <label class="form-label d-block">Action for this account
            <select v-model="action" data-testid="security-action" class="form-select mt-1">
              <option value="account">{{ accountActionLabel }} account</option>
              <option value="session">Revoke one session</option>
              <option value="sessions">Revoke all sessions</option>
            </select>
          </label>
          <p v-if="action === 'session'" class="small">
            Ends only the selected session for this account. Other sessions remain signed in.
          </p>
          <p v-else-if="action === 'sessions'" class="small">
            Ends all sessions for this account. The target must sign in again.
            Account state, content and grants are unchanged.
          </p>
          <label class="form-label d-block">Reason (required, up to 500 characters)
            <textarea
              v-model="note"
              data-testid="security-note"
              class="form-control mt-1"
              maxlength="500"
              required
            />
          </label>
          <label class="form-check d-flex gap-2 mt-3" data-testid="security-confirm-label">
            <input
              v-model="confirmed"
              data-testid="security-confirm"
              class="form-check-input"
              type="checkbox"
            />
            <span>
              {{ actionLabel }} {{ userId }}{{ action === 'session' ? ` · ${selectedSession || 'choose a session'}` : '' }}
              : I confirm this action.
            </span>
          </label>
          <button
            class="btn btn-primary mt-3"
            type="submit"
            :disabled="blocked || !confirmed || !note.trim() || note.trim().length > 500"
          >{{ actionLabel }}{{ action === 'account' ? ' account' : '' }}</button>
        </fieldset>
      </form>
    </template>
  </section>
</template>

<style scoped>
.security-panel {
  min-width: 0;
  overflow-wrap: anywhere;
}
.security-panel fieldset {
  min-width: 0;
}
.security-methods p {
  margin-bottom: 0.25rem;
}
.security-panel .form-check {
  padding-left: 0;
  align-items: flex-start;
}
.security-panel .form-check-input {
  margin-left: 0;
  flex-shrink: 0;
}
.security-panel :deep(select),
.security-panel textarea {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.security-panel textarea {
  min-height: 6rem;
}
.security-panel :deep(button),
.security-panel :deep(select) {
  min-height: 2.75rem;
  white-space: normal;
}
.security-panel :deep(:focus-visible) {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
</style>
