import AuthPrompt from '@web/modules/account/AuthPrompt.vue'
import LoginPanel from '@web/modules/account/LoginPanel.vue'
import ProfilePanel from '@web/modules/account/ProfilePanel.vue'
import RegisterPanel from '@web/modules/account/RegisterPanel.vue'
import BrowseListPanel from '@web/modules/browse-map/BrowseListPanel.vue'
import DealPanel from '@web/modules/browse-map/DealPanel.vue'
import MyCodesPanel from '@web/modules/flash-drop/MyCodesPanel.vue'
import LobbiePanel from '@web/modules/lobbie/LobbiePanel.vue'
import SquadCreatePanel from '@web/modules/squad/SquadCreatePanel.vue'
import SquadJoinPanel from '@web/modules/squad/SquadJoinPanel.vue'
import SquadRoomPanel from '@web/modules/squad/SquadRoomPanel.vue'
import VenuePanel from '@web/modules/venues-feed/VenuePanel.vue'
import AuthPage from '@web/pages/AuthPage.vue'
import LandingPage from '@web/pages/LandingPage.vue'
import MapShell from '@web/pages/MapShell.vue'
import NotFoundPage from '@web/pages/NotFoundPage.vue'
import SubmissionForm from '@web/pages/SubmissionForm.vue'
import { merchantRoutes } from '@web/router/merchant-routes'
import type { RouteRecordRaw } from 'vue-router'

// Pages most visitors never open (admin, merchant, own submissions, password reset) load on
// demand, so the map and landing page do not pay for them in the first download.
const AdminAuditPage = () => import('@web/pages/AdminAuditPage.vue')
const AdminCataloguePage = () => import('@web/pages/AdminCataloguePage.vue')
const AdminDealsPage = () => import('@web/pages/AdminDealsPage.vue')
const AdminFlashDropsPage = () => import('@web/pages/AdminFlashDropsPage.vue')
const AdminModerationPage = () => import('@web/pages/AdminModerationPage.vue')
const AdminOverviewPage = () => import('@web/pages/AdminOverviewPage.vue')
const IngestionAdminPage = () => import('@web/pages/IngestionAdminPage.vue')
const PlatformAdminPage = () => import('@web/pages/PlatformAdminPage.vue')
const MerchantAccessPage = () => import('@web/pages/MerchantAccessPage.vue')
const MySubmissionsPage = () => import('@web/pages/MySubmissionsPage.vue')
const ForgotPasswordPage = () => import('@web/pages/ForgotPasswordPage.vue')
const ResetPasswordPage = () => import('@web/pages/ResetPasswordPage.vue')
const GettingStartedPage = () => import('@web/pages/GettingStartedPage.vue')

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible name of the panel aside while this child route is shown. */
    panelLabel?: string
    /** Tab title for the route; map panels fall back to their panel label. */
    title?: string
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
      {
        path: '',
        name: 'browse',
        component: BrowseListPanel,
        meta: { title: 'Food deals', panelLabel: 'Results' },
      },
      { path: '/deals/:dealId', name: 'deal', component: DealPanel, meta: { panelLabel: 'Deal' } },
      {
        path: '/venues/:venueId',
        name: 'venue',
        component: VenuePanel,
        meta: { panelLabel: 'Venue' },
      },
      {
        // Several outlets in one building, opened from a stack on the map.
        path: '/places/:venueIds',
        name: 'place',
        component: VenuePanel,
        meta: { panelLabel: 'Place' },
      },
      {
        path: '/ask-lobbie',
        name: 'lobbie',
        component: LobbiePanel,
        meta: { panelLabel: 'Ask Lobbie' },
      },
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
      // Signed-out visitors see a prompt to log in rather than a redirect, so the menu link
      // always lands somewhere that explains what codes are.
      { path: '/codes', name: 'codes', component: MyCodesPanel, meta: { panelLabel: 'My codes' } },
      // Static Squad paths come first: "join" is four letters, so it would also fit a code.
      {
        path: '/squad/new',
        name: 'squad-new',
        component: SquadCreatePanel,
        meta: { requiresAuth: true, panelLabel: 'Start a Squad room' },
      },
      {
        path: '/squad/join',
        name: 'squad-join',
        component: SquadJoinPanel,
        meta: { panelLabel: 'Join a Squad room' },
      },
      {
        path: '/squad/:code([A-Za-z]{4})',
        name: 'squad-room',
        component: SquadRoomPanel,
        meta: { panelLabel: 'Squad room' },
      },
    ],
  },
  { path: '/', name: 'landing', component: LandingPage, meta: { layout: 'landing' } },
  {
    path: '/about',
    name: 'about',
    component: LandingPage,
    meta: { layout: 'landing', title: 'About' },
  },
  {
    path: '/sign-in',
    name: 'sign-in',
    component: AuthPage,
    props: { mode: 'login' },
    meta: { layout: 'auth', guestOnly: true, title: 'Log in' },
  },
  {
    path: '/sign-up',
    name: 'sign-up',
    component: AuthPage,
    props: { mode: 'register' },
    meta: { layout: 'auth', guestOnly: true, title: 'Sign up' },
  },
  // The feed without a map is now the shell's list mode; old links keep working.
  {
    path: '/deals',
    redirect: (to) => ({ name: 'browse', query: { ...to.query, view: 'list', discovery: '1' } }),
  },
  {
    path: '/getting-started',
    name: 'getting-started',
    component: GettingStartedPage,
    meta: { title: 'Getting started' },
  },
  { path: '/admin', name: 'admin-overview', component: AdminOverviewPage },
  { path: '/admin/deals', name: 'admin-deals', component: AdminDealsPage },
  { path: '/admin/flash-drops', name: 'admin-flash-drops', component: AdminFlashDropsPage },
  { path: '/admin/catalogue', name: 'admin-catalogue', component: AdminCataloguePage },
  { path: '/admin/moderation', name: 'admin-moderation', component: AdminModerationPage },
  { path: '/admin/audit', name: 'admin-audit', component: AdminAuditPage },
  { path: '/admin/ingestion', name: 'ingestion-admin', component: IngestionAdminPage },
  { path: '/admin/accounts', name: 'platform-admin', component: PlatformAdminPage },
  {
    path: '/me/submissions',
    name: 'my-submissions',
    component: MySubmissionsPage,
    meta: { requiresAuth: true, title: 'My deal submissions' },
  },
  ...merchantRoutes,
  {
    path: '/me/merchant-access',
    name: 'merchant-access',
    component: MerchantAccessPage,
    // Staff can't request merchant access; the API enforces this too.
    meta: { requiresAuth: true, roles: ['USER', 'MERCHANT'], title: 'Merchant access' },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: ForgotPasswordPage,
    meta: { layout: 'auth', guestOnly: true, title: 'Forgot password' },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: ResetPasswordPage,
    meta: { layout: 'auth', title: 'Reset password' },
  },
  {
    path: '/add',
    name: 'submit-deal',
    component: SubmissionForm,
    // Merchants add and edit their deals from the merchant dashboard.
    meta: { requiresAuth: true, roleRedirects: { MERCHANT: '/merchant' }, title: 'Add a deal' },
  },
  // The form used to live at /submit-deal; keep old links working.
  { path: '/submit-deal', redirect: '/add' },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
    meta: { title: 'Page not found' },
  },
]

export default routes
