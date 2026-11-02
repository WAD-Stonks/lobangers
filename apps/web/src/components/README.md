# Components

Owns reusable app-shell UI shared across routes. `PageHeader.vue` is the All Deals header (logo, search, Room, account and menu) for pages outside the map; `auth/AuthLayout.vue` frames the sign-in, sign-up and password pages. `site-nav-links.ts` holds the menu destinations and `use-site-menu.ts` owns open/close, Escape, click-outside and focus behaviour. `AppShell.vue` in `@broke-oclock/ui` provides the page container.

Do not add `DealCard.vue` yet. Its props, content hierarchy, and states are a team contract decision for the browse-map and add-deal workstreams.
