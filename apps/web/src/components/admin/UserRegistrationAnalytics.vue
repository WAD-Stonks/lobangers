<script setup lang="ts">
import type { AdminUserAnalyticsResponse } from '@broke-oclock/contracts/platform-admin'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const analytics = ref<AdminUserAnalyticsResponse | null>(null)
const loading = ref(false)
const failed = ref(false)
const fence = createAdminReadFence()
const maximum = computed(() => Math.max(1, ...(analytics.value?.weeks.map(week => week.newUsers) ?? [])))
const shortDate = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
const fullDate = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })
const count = (value: number) => value.toLocaleString('en-SG')
const load = async () => {
  if (loading.value) return
  const ticket = fence.begin()
  loading.value = true
  failed.value = false
  analytics.value = null
  try {
    const result = await api.platformAdmin.userAnalytics()
    if (fence.current(ticket)) analytics.value = result
  } catch (error) {
    if (!fence.current(ticket)) return
    const code = errorCode(error)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    else failed.value = true
  } finally {
    if (fence.current(ticket)) loading.value = false
  }
}
onMounted(load)
onUnmounted(() => fence.dispose())
</script>

<template>
  <section class="card p-3 registration-analytics" aria-labelledby="registration-title" :aria-busy="loading">
    <div class="registration-heading">
      <div>
        <h2 id="registration-title">User registrations</h2>
        <p class="small text-secondary mb-0">All registered account roles, including suspended accounts. Weeks start Monday in Singapore time.</p>
      </div>
      <button v-if="analytics" class="btn btn-outline-primary" type="button" @click="load">Refresh registrations</button>
    </div>
    <p v-if="loading" role="status" class="mt-3 mb-0">Loading registration analytics…</p>
    <div v-else-if="failed" role="alert" class="mt-3">
      <p>Registration analytics are unavailable. The rest of the overview is still available.</p>
      <button type="button" class="btn btn-outline-primary" @click="load">Retry registrations</button>
    </div>
    <template v-else-if="analytics">
      <dl class="registration-totals">
        <div><dt>Total registered users</dt><dd>{{ count(analytics.totalUsers) }}</dd></div>
        <div><dt>New users this week <span class="registration-partial">so far</span></dt><dd>{{ count(analytics.newUsersThisWeek) }}</dd></div>
      </dl>
      <h3 class="h6">New users per week</h3>
      <p class="small text-secondary">Last 8 weeks, including the current partial week. Each full-width bar represents {{ count(maximum) }} registrations.</p>
      <p v-if="analytics.weeks.every(week => week.newUsers === 0)" class="text-secondary">No registrations in these eight weeks.</p>
      <ol class="registration-weeks" aria-label="Weekly user registrations">
        <li v-for="(week, index) in analytics.weeks" :key="week.weekStart" :class="{ 'registration-current-week': index === analytics.weeks.length - 1 }">
          <span class="registration-week-label">Week of <time :datetime="week.weekStart">{{ shortDate.format(new Date(week.weekStart)) }}</time><small v-if="index === analytics.weeks.length - 1">This week · so far</small></span>
          <div class="registration-track" aria-hidden="true"><span :style="{ width: `${week.newUsers / maximum * 100}%` }"></span></div>
          <strong class="registration-count">{{ count(week.newUsers) }}<span class="visually-hidden"> new users</span></strong>
        </li>
      </ol>
      <p class="small text-secondary mt-3 mb-0">As of <time :datetime="analytics.generatedAt">{{ fullDate.format(new Date(analytics.generatedAt)) }}</time> (SGT). Accounts registered before this snapshot; weeks with no registrations appear as zero.</p>
    </template>
  </section>
</template>

<style scoped>
.registration-heading { display: flex; align-items: start; flex-wrap: wrap; justify-content: space-between; gap: 16px; }
.registration-heading > div { flex: 1 1 300px; }
.registration-heading h2 { letter-spacing: -0.02em; }
.registration-heading h2::before { display: inline-block; content: ""; width: 4px; height: 14px; margin-right: 9px; border-radius: 3px; background: var(--admin-accent); vertical-align: -1px; }
.registration-heading .btn { font-size: 12px; }
.registration-totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0 28px; }
.registration-totals > div { padding: 20px; border: 1px solid #e9ecf0; border-radius: 12px; background: #fafbfc; }
.registration-totals > div:first-child { background: #fffbec; border-color: #f0e6c3; }
.registration-totals dt { font-size: 13px; font-weight: 500; color: var(--admin-muted); }
.registration-totals dd { margin: 10px 0 0; font-size: 36px; line-height: 1.2; font-weight: 650; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.registration-partial { display: inline-block; font-size: 10px; padding: 2px 6px; border: 1px solid #eee2b2; border-radius: 20px; background: #fff5d1; color: #705700; }
.registration-weeks { display: grid; gap: 4px; list-style: none; padding: 0; margin: 20px 0 0; }
.registration-weeks li { display: grid; grid-template-columns: 110px minmax(0, 1fr) 56px; align-items: center; gap: 12px; padding: 10px 8px; border-radius: 8px; font-size: 12px; }
.registration-weeks .registration-current-week { background: #fffbeb; }
.registration-week-label small { display: block; color: var(--admin-muted); font-size: 11px; }
.registration-track { height: 12px; border-radius: 6px; background: #f0f2f5; overflow: hidden; }
.registration-track > span { display: block; height: 100%; background: #6675ae; border-radius: 6px; }
.registration-current-week .registration-track > span { background: #d9b437; }
.registration-count { text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
@media (max-width: 575.98px) {
  .registration-totals { grid-template-columns: minmax(0, 1fr); }
  .registration-weeks li { grid-template-columns: 100px minmax(0, 1fr) 48px; gap: 8px; }
}
</style>
