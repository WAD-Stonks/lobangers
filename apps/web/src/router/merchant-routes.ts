import type { RouteRecordRaw } from 'vue-router'

const MerchantDashboardPage = () => import('@web/pages/MerchantDashboardPage.vue')
const MerchantDealFormPage = () => import('@web/pages/MerchantDealFormPage.vue')

export const merchantRoutes: RouteRecordRaw[] = [
  {
    path: '/merchant',
    name: 'merchant',
    component: MerchantDashboardPage,
    meta: { requiresAuth: true, roles: ['MERCHANT'], title: 'Merchant dashboard' },
  },
  {
    path: '/merchant/deals/new',
    name: 'merchant-deal-new',
    component: MerchantDealFormPage,
    props: { mode: 'new' },
    meta: { requiresAuth: true, roles: ['MERCHANT'], title: 'New deal' },
  },
  {
    path: '/merchant/deals/:id/edit',
    name: 'merchant-deal-edit',
    component: MerchantDealFormPage,
    props: (to) => ({ mode: 'edit', id: String(to.params.id) }),
    meta: { requiresAuth: true, roles: ['MERCHANT'], title: 'Edit deal' },
  },
  {
    path: '/merchant/deals/:id/run-again',
    name: 'merchant-deal-run-again',
    component: MerchantDealFormPage,
    props: (to) => ({ mode: 'run-again', id: String(to.params.id) }),
    meta: { requiresAuth: true, roles: ['MERCHANT'], title: 'Run a deal again' },
  },
  {
    path: '/merchant/flash/new',
    name: 'merchant-flash-new',
    component: MerchantDealFormPage,
    props: { mode: 'flash-new' },
    meta: { requiresAuth: true, roles: ['MERCHANT'], title: 'New flash deal' },
  },
  {
    path: '/merchant/flash/:id/edit',
    name: 'merchant-flash-edit',
    component: MerchantDealFormPage,
    props: (to) => ({ mode: 'flash-edit', id: String(to.params.id) }),
    meta: { requiresAuth: true, roles: ['MERCHANT'], title: 'Edit flash deal draft' },
  },
]
