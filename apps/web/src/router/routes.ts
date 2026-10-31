import LoginPanel from '@web/modules/account/LoginPanel.vue'
import ProfilePanel from '@web/modules/account/ProfilePanel.vue'
import RegisterPanel from '@web/modules/account/RegisterPanel.vue'
// import AddDealPanel from '@web/modules/add-deal/AddDealPanel.vue'
import BrowseListPanel from '@web/modules/browse-map/BrowseListPanel.vue'
import DealPanel from '@web/modules/browse-map/DealPanel.vue'
import LobbiePanel from '@web/modules/lobbie/LobbiePanel.vue'
import VenuePanel from '@web/modules/venues-feed/VenuePanel.vue'
import AdminAuditPage from '@web/pages/AdminAuditPage.vue'
import AdminCataloguePage from '@web/pages/AdminCataloguePage.vue'
import AdminDealsPage from '@web/pages/AdminDealsPage.vue'
import AdminModerationPage from '@web/pages/AdminModerationPage.vue'
import AdminOverviewPage from '@web/pages/AdminOverviewPage.vue'
import ForgotPasswordPage from '@web/pages/ForgotPasswordPage.vue'
import GettingStartedPage from '@web/pages/GettingStartedPage.vue'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import LandingPage from '@web/pages/LandingPage.vue'
import MapShell from '@web/pages/MapShell.vue'
import MerchantAccessPage from '@web/pages/MerchantAccessPage.vue'
import MerchantDashboardPage from '@web/pages/MerchantDashboardPage.vue'
import MySubmissionsPage from '@web/pages/MySubmissionsPage.vue'
import NotFoundPage from '@web/pages/NotFoundPage.vue'
import PlatformAdminPage from '@web/pages/PlatformAdminPage.vue'
import ResetPasswordPage from '@web/pages/ResetPasswordPage.vue'
import SubmissionForm from '@web/pages/SubmissionForm.vue'
import type { RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible name of the panel aside while this child route is shown. */
    panelLabel?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    // The map is always mounted; each feature is a child panel over it, so the URL decides
    // what the panel shows without ever reloading the map. The map itself lives at /browse
    // (the landing page has /). Panel paths start with / so they keep their short URLs.
    path: '/browse',
    component: MapShell,
    meta: { layout: 'canvas' },
    children: [
      { path: '', name: 'browse', component: BrowseListPanel, meta: { panelLabel: 'Results' } },
      { path: '/deals/:dealId', name: 'deal', component: DealPanel, meta: { panelLabel: 'Deal' } },
      {
        path: '/venues/:venueId',
        name: 'venue',
        component: VenuePanel,
        meta: { panelLabel: 'Venue' },
      },
      {
        path: '/ask-lobbie',
        name: 'lobbie',
        component: LobbiePanel,
        meta: { panelLabel: 'Ask Lobbie' },
      },
      // The "Add a deal" map overlay is commented out; adding a deal is the full /add page.
      // {
      //   path: '/add',
      //   name: 'add-deal',
      //   component: AddDealPanel,
      //   meta: { requiresAuth: true, panelLabel: 'Add a deal' },
      // },
      {
        path: '/login',
        name: 'login',
        component: LoginPanel,
        meta: { guestOnly: true, panelLabel: 'Log in' },
      },
      {
        path: '/register',
        name: 'register',
        component: RegisterPanel,
        meta: { guestOnly: true, panelLabel: 'Sign up' },
      },
      {
        path: '/me/profile',
        name: 'profile',
        component: ProfilePanel,
        meta: { requiresAuth: true, panelLabel: 'Your account' },
      },
      {
        path: '/saved',
        name: 'saved',
        component: ProfilePanel,
        meta: { requiresAuth: true, panelLabel: 'Saved deals' },
      },
    ],
  },
  { path: '/', name: 'landing', component: LandingPage, meta: { layout: 'landing' } },
  // The feed without a map is now the shell's list mode; old links keep working.
  { path: '/deals', redirect: (to) => ({ name: 'browse', query: { ...to.query, view: 'list' } }) },
  { path: '/getting-started', name: 'getting-started', component: GettingStartedPage },
  { path: '/admin', name: 'admin-overview', component: AdminOverviewPage },
  { path: '/admin/deals', name: 'admin-deals', component: AdminDealsPage },
  { path: '/admin/catalogue', name: 'admin-catalogue', component: AdminCataloguePage },
  { path: '/admin/moderation', name: 'admin-moderation', component: AdminModerationPage },
  { path: '/admin/audit', name: 'admin-audit', component: AdminAuditPage },
  { path: '/admin/ingestion', name: 'ingestion-admin', component: IngestionAdminPage },
  { path: '/admin/accounts', name: 'platform-admin', component: PlatformAdminPage },
  {
    path: '/me/submissions',
    name: 'my-submissions',
    component: MySubmissionsPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/merchant',
    name: 'merchant',
    component: MerchantDashboardPage,
    // Only merchants can open it; the API must still check each outlet belongs to them.
    meta: { requiresAuth: true, roles: ['MERCHANT'] },
  },
  {
    path: '/me/merchant-access',
    name: 'merchant-access',
    component: MerchantAccessPage,
    // Staff can't request merchant access; the API enforces this too.
    meta: { requiresAuth: true, roles: ['USER', 'MERCHANT'] },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: ForgotPasswordPage,
    meta: { guestOnly: true },
  },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordPage },
  {
    path: '/add',
    name: 'submit-deal',
    component: SubmissionForm,
    meta: { requiresAuth: true },
  },
  // The form used to live at /submit-deal; keep old links working.
  { path: '/submit-deal', redirect: '/add' },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
]

export default routes
