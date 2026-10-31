# Broke O'Clock web starter

Minimal Vue frontend shell for the parent pnpm monorepo. This is intentionally not a finished deals app: it contains the app shell, honest starter copy, developer setup route, 404 handling, Bootstrap baseline, and generic BetterAuth Vue client wiring.

## Run

```sh
cd ../..
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup
pnpm run dev:web
```

The Vite dev server binds to `localhost:5173` and proxies same-origin `/api` requests to `http://localhost:3000`. No frontend secrets or API implementation belong here.

## Scripts

- `pnpm run dev` - Vite on localhost:5173 with strict port checking
- `pnpm run build` - production build
- `pnpm run typecheck` - `vue-tsc --noEmit`
- `pnpm run test:unit` - Vitest + Vue Test Utils + jsdom

## Routes

- `/` — browse map landing page: full-bleed Leaflet map fitted to Singapore with floating filters and a list panel. Uses the `canvas` route layout from `src/router/layouts.ts`.
- `/browse` — redirects to `/` so older links keep working
- `/getting-started` — six-module ownership notes and folder path
- `/:pathMatch(.*)*` — accessible 404 page

## Shared sign-in UI

Normal login and the admin sign-in entry points use `components/auth/SharedSignIn.vue`. The layout follows the Go Labs GOSH sign-in and `AccountShell` hierarchy: labelled fields, one primary action and a separate Google alternative. Admin entry points use a focused card; the `/login` map panel embeds the same flow without a second card, heading or registration link and forwards its safe return destination. It uses Lobangers paper, ink and sunny tokens with the existing Plus Jakarta Sans and Fredoka fonts; no Go Labs runtime package, guest identity flow or new asset is included.

Email-code sign-in is the default when configured: the first screen asks only for email, and `Use password instead` explicitly reveals the password field. `Use an email code instead` switches back without sending mail; switching methods clears secrets while preserving the mailbox and resend cooldown. Sending a code opens a dedicated six-digit text input with paste/autofill, resend, Change email and a password alternative. Optional methods come from `api.infrastructure.authMethods()`; password remains the fallback when code sign-in is disabled or the projection fails. Purpose-bound code recovery keeps native SDK semantics and locks return while a request is pending. Code-sign-in account effects remain disclosed in the expandable method note.

Account callbacks allow safe same-site paths including query/hash, with OAuth errors returning to `/login` while preserving its redirect. Admin callbacks retain their exact destination allowlist. SDK-boundary tests are synthetic and do not establish live email delivery, Google authentication or server authorization.

## Conventions

Use two-space indentation, single quotes, and semicolons only as needed to match the parent Biome configuration. Keep workstream behavior in `src/modules/<module>/`; these folders currently contain ownership notes only. `src/components/DealCard.vue` is deliberately absent until the team agrees on its contract.

References: [Vue quick start](https://vuejs.org/guide/quick-start.html), [Bootstrap with Vite](https://getbootstrap.com/docs/5.3/getting-started/vite/), and [BetterAuth client](https://better-auth.com/docs/concepts/client).
