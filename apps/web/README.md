# LoBangers web application

Vue application for deal discovery, map browsing, community verification, accounts, merchant promotions, Flash Drops, Squad rooms and administration. It uses the shared typed API client and native Better Auth sessions.

## Run

Follow the repository [setup instructions](../../README.md) for Node/pnpm prerequisites, dependency installation, root `.env`, Prisma Client generation and the local database. Run `pnpm run dev` from the repository root to start both apps, or `pnpm run dev:web` when the API is already running.

The Vite dev server binds to `localhost:5173` and proxies same-origin `/api` requests to `http://127.0.0.1:3000`. Vite reads the repository-root `.env` and exposes only `VITE_*` settings to the browser. Keep auth, database and provider credentials server-side. The optional `VITE_CARTO_API_KEY` is a publishable basemap key; keyless OneMap tiles are the fallback.

## Scripts

- `pnpm run dev` - Vite on localhost:5173 with strict port checking
- `pnpm run build` - production build
- `pnpm run typecheck` - `vue-tsc --noEmit`
- `pnpm run test:unit` - Vitest + Vue Test Utils + jsdom

## Routes

- `/` — public landing page; signed-in visitors continue to deals
- `/browse` — map with feature panels; `/deals` redirects to its list view
- `/deals/:dealId` and `/venues/:venueId` — deal and outlet details
- `/sign-in`, `/sign-up`, `/me/profile` and `/saved` — account and saved deals
- `/add` — photo-backed deal submission for admin review
- `/merchant` — approved merchants' deals and Flash Drops
- `/codes`, `/squad/new`, `/squad/join` and `/ask-lobbie` — codes, group planning and assistant
- `/admin` and its child paths — staff operations with server-enforced access
- `/getting-started` — guide to using the application
- `/:pathMatch(.*)*` — accessible 404 page

## Shared sign-in UI

Normal login and the admin sign-in entry points use `components/auth/SharedSignIn.vue`. The layout follows the Go Labs GOSH sign-in and `AccountShell` hierarchy: labelled fields, one primary action and a separate Google alternative. Admin entry points use a focused card. The current `/sign-in` route uses `AuthPage.vue`, which embeds the shared flow without a second card, heading or registration link. The legacy `/login` address redirects to that route. Normal password, code and Google completion all open All Deals, following the current account-shell policy. It uses Lobangers paper, ink and sunny tokens with the existing Plus Jakarta Sans and Fredoka fonts; no Go Labs runtime package or guest identity flow is included.

Email-code sign-in is the default when configured: the first screen asks only for email, and `Use password instead` explicitly reveals the password field. `Use an email code instead` switches back without sending mail; switching methods clears secrets while preserving the mailbox and resend cooldown. Sending a code opens a dedicated six-digit text input with paste/autofill, resend, Change email and a password alternative. Optional methods come from `api.infrastructure.authMethods()`; password remains the fallback when code sign-in is disabled or the projection fails. Purpose-bound code recovery keeps native SDK semantics and locks return while a request is pending. Code-sign-in account effects remain disclosed in the expandable method note.

The shared account component accepts validated same-site callback paths including query/hash, rejecting protocol-relative paths, backslashes and URL control characters. The normal account entry supplies `/deals`; OAuth errors return through `/login` while preserving the validated redirect. Admin callbacks retain their exact destination allowlist. Recovery completion explicitly selects password mode, clears secrets and keeps its success notice until the next deliberate action. SDK-boundary tests are synthetic and do not establish live email delivery, Google authentication or server authorization.

## Conventions

Use two-space indentation, single quotes, and semicolons only as needed to match the parent Biome configuration. Feature behavior lives in `src/modules/<module>/`; shared pages and components compose these modules. Tests use synthetic data or disposable fixtures and do not establish production provider acceptance.

References: [Vue quick start](https://vuejs.org/guide/quick-start.html), [Bootstrap with Vite](https://getbootstrap.com/docs/5.3/getting-started/vite/), and [BetterAuth client](https://better-auth.com/docs/concepts/client).
