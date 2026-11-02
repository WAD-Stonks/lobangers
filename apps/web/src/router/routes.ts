import type { RouteRecordRaw } from 'vue-router'

// Fetch only the matched destination. In particular, administration must not load
// the map, landing animation and every other workspace before it can start.
const AuthPrompt = () => import('@web/modules/account/AuthPrompt.vue')
const LoginPanel = () => import('@web/modules/account/LoginPanel.vue')
const ProfilePanel = () => import('@web/modules/account/ProfilePanel.vue')
const RegisterPanel = () => import('@web/modules/account/RegisterPanel.vue')
const BrowseListPanel = () => import('@web/modules/browse-map/BrowseListPanel.vue')
const DealPanel = () => import('@web/modules/browse-map/DealPanel.vue')
const LobbiePanel = () => import('@web/modules/lobbie/LobbiePanel.vue')
const VenuePanel = () => import('@web/modules/venues-feed/VenuePanel.vue')
const AdminAuditPage = () => import('@web/pages/AdminAuditPage.vue')
const AdminCataloguePage = () => import('@web/pages/AdminCataloguePage.vue')
const AdminDealsPage = () => import('@web/pages/AdminDealsPage.vue')
const AdminModerationPage = () => import('@web/pages/AdminModerationPage.vue')
const AdminOverviewPage = () => import('@web/pages/AdminOverviewPage.vue')
const AuthPage = () => import('@web/pages/AuthPage.vue')
const ForgotPasswordPage = () => import('@web/pages/ForgotPasswordPage.vue')
const GettingStartedPage = () => import('@web/pages/GettingStartedPage.vue')
const IngestionAdminPage = () => import('@web/pages/IngestionAdminPage.vue')
const LandingPage = () => import('@web/pages/LandingPage.vue')
const MapShell = () => import('@web/pages/MapShell.vue')
const MerchantAccessPage = () => import('@web/pages/MerchantAccessPage.vue')
const MerchantDashboardPage = () => import('@web/pages/MerchantDashboardPage.vue')
const MySubmissionsPage = () => import('@web/pages/MySubmissionsPage.vue')
const NotFoundPage = () => import('@web/pages/NotFoundPage.vue')
const PlatformAdminPage = () => import('@web/pages/PlatformAdminPage.vue')
const ResetPasswordPage = () => import('@web/pages/ResetPasswordPage.vue')
const SubmissionForm = () => import('@web/pages/SubmissionForm.vue')

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
      {
        path: '/account-required',
        name: 'auth-required',
        component: AuthPrompt,
        meta: { panelLabel: 'Log in or sign up' },
      },
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
        component: BrowseListPanel,
        meta: { requiresAuth: true, panelLabel: 'Saved deals' },
      },
    ],
  },
  { path: '/', name: 'landing', component: LandingPage, meta: { layout: 'landing' } },
  { path: '/about', name: 'about', component: LandingPage, meta: { layout: 'landing' } },
  {
    path: '/sign-in',
    name: 'sign-in',
    component: AuthPage,
    props: { mode: 'login' },
    meta: { layout: 'auth', guestOnly: true },
  },
  {
    path: '/sign-up',
    name: 'sign-up',
    component: AuthPage,
    props: { mode: 'register' },
    meta: { layout: 'auth', guestOnly: true },
  },
  // The feed without a map is now the shell's list mode; old links keep working.
  {
    path: '/deals',
    redirect: (to) => ({ name: 'browse', query: { ...to.query, view: 'list', discovery: '1' } }),
  },
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
