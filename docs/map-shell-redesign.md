# Map shell redesign: implementation plan

This is the build plan for the map-first redesign. It says what we are building in `apps/web`, how each piece should behave, and which tests must pass before a piece counts as done.

The approved design lives in the Claude Design canvas: https://claude.ai/artifact/5jDMEXRHzHVyJJWky3ccb5. The **Prototype** board is clickable. Use the **Phone**, **Tablet portrait** and **Tablet landscape** boards as the reference for each breakpoint. If the doc and the canvas disagree, raise it in the group chat rather than guessing.

## Contents

1. [Ground rules](#1-ground-rules)
2. [Layout and breakpoints](#2-layout-and-breakpoints)
3. [Routes](#3-routes)
4. [Component tree and files](#4-component-tree-and-files)
5. [Feature specs](#5-feature-specs)
6. [Motion](#6-motion)
7. [No overflow, no cut-offs](#7-no-overflow-no-cut-offs)
8. [Accessibility](#8-accessibility)
9. [Tests](#9-tests)
10. [Build order](#10-build-order)
11. [Open questions](#11-open-questions)
12. [Definition of done](#12-definition-of-done)

---

## 1. Ground rules

| Rule | Detail |
| --- | --- |
| **Vue only** | Vue 3 single-file components with `<script setup lang="ts">`. Use Vue Router 5 for navigation. No React, no web components, and no new UI framework. |
| **Bootstrap where it helps** | `bootstrap@5.3.8` is already installed (plain Bootstrap, not BootstrapVueNext). Use its utilities for layout and spacing (`d-flex`, `gap-2`, `text-truncate`, `visually-hidden`, `d-none d-lg-block`). Don't use Bootstrap's JS components (modal, dropdown, offcanvas): they fight Vue over the DOM. Build those as Vue components instead. |
| **Inline styles only for dynamic values** | Bind runtime numbers through `:style`, for example `:style="{ '--progress': pct }"` or a pin's position. Inline styles can't hold `:hover`, `@media`, `@keyframes` or `prefers-reduced-motion`. So anything static goes in a scoped `<style>` block that reads the tokens in `src/assets/main.css`. |
| **Tokens, not hex codes** | Colours, radii, spacing and shadows come from `main.css` (`--paper`, `--ink`, `--coral`, `--sunny`, `--radius-card`, `--space-*` and so on). New motion tokens are listed in [section 6](#6-motion). |
| **Immutable state** | Filter and selection updates return new objects. Follow `updateFilters()` in `modules/browse-map/filters.ts`. |
| **Small files** | Aim for 200 to 400 lines per file, with a hard limit of 800. If a component grows past that, split it. |
| **No new dependencies without a group decision** | Everything below is achievable with Vue, Vue Router, Bootstrap, Leaflet and the markercluster plugin we already ship. |

---

## 2. Layout and breakpoints

The map is always mounted. Every feature is a panel or sheet on top of it, so moving between features never reloads the map. Admin pages are the exception: they keep their own dashboard layout (`AdminShell.vue`).

The breakpoints match Bootstrap's, so `d-lg-*` utilities line up with our media queries.

| Name | Width | Bootstrap | Panel | Filters sheet | Header |
| --- | --- | --- | --- | --- | --- |
| Phone | < 768px | `xs`, `sm` | Bottom sheet with peek, half and full heights | Full screen | Menu button and search on row 1, chips on row 2. "Ending today" is hidden. |
| Tablet | 768 to 991px | `md` | Bottom sheet, half height by default | Centred dialog | Menu button and search on row 1, all chips on row 2 |
| Desktop | ≥ 992px | `lg` and up | Left side panel, 400px wide | Popover anchored under the chips | Same as tablet, inside the panel column |

`BrowsePage.vue` already switches to the side panel at 992px. Keep that number.

Map controls sit in a vertical stack on the right: list/map toggle, then Near me, then zoom. Zoom is hidden on phones because pinch-zoom covers it. The "Hot right now" card sits at the bottom left, above the bottom sheet's peek height on phones.

---

## 3. Routes

Feature routes become **children of a canvas route**. The URL decides what the panel shows, while the map stays mounted in the parent.

```ts
// router/routes.ts (sketch)
{
  path: '/',
  component: MapShell,            // owns the map, header, controls, Hot card
  meta: { layout: 'canvas' },
  children: [
    { path: '', name: 'browse', component: BrowseListPanel },
    { path: 'deals/:dealId', name: 'deal', component: DealPanel },
    { path: 'venues/:venueId', name: 'venue', component: VenuePanel },
    { path: 'add', name: 'add-deal', component: AddDealPanel, meta: { requiresAuth: true } },
    { path: 'login', name: 'login', component: LoginPanel, meta: { guestOnly: true } },
    { path: 'register', name: 'register', component: RegisterPanel, meta: { guestOnly: true } },
    { path: 'me/profile', name: 'profile', component: ProfilePanel, meta: { requiresAuth: true } },
    { path: 'saved', name: 'saved', component: SavedPanel, meta: { requiresAuth: true } },
    { path: 'merchant', name: 'merchant', component: MerchantPanel, meta: { requiresAuth: true, roles: ['MERCHANT'] } },
  ],
}
```

- Route names stay the same where they already exist (`browse`, `venue`, `login`, `register`, `profile`, `saved`), so existing `RouterLink`s keep working.
- `/deals` (the feed without a map) becomes the **list mode** of the shell: `?view=list`. Keep a redirect from `/deals` to `{ name: 'browse', query: { view: 'list' } }` so old links still work.
- `/browse` keeps redirecting to `/`.
- Admin routes (`/admin`, `/admin/accounts`, `/admin/ingestion`) and password reset stay outside the shell.
- Active filters live in the query string (`?q=laksa&cat=food&max=5&now=1`). This lets a shared link reproduce the same view, and lets the back button undo a filter change.
- The guards in `router/guards.ts` already understand `requiresAuth`, `guestOnly` and `roles`. A guarded child that redirects to `login` should pass `?redirect=` so the user lands back where they started.

---

## 4. Component tree and files

```
MapShell.vue                       pages/ (replaces BrowsePage.vue)
├── ShellHeader.vue                modules/map-shell/
│   ├── BrandMenu.vue              logo button → dropdown nav (replaces the floating Log in)
│   ├── SearchField.vue            search with clear button
│   └── QuickChips.vue             Halal · Under $5 · Ending today · All filters (badge)
├── DealMap.vue                    modules/browse-map/ (existing, extended)
├── MapControls.vue                list/map toggle · Near me · zoom
├── HotCard.vue                    rotating "Hot right now" card
├── FilterSheet.vue                popover / dialog / full screen by breakpoint
├── ShellPanel.vue                 side panel ≥992px, bottom sheet below
│   └── <RouterView v-slot>        child panels from section 3
└── ShellToast.vue                 one toast at a time, aria-live
```

Shared building blocks go in `modules/map-shell/`:

| File | Purpose |
| --- | --- |
| `use-breakpoint.ts` | Returns `'phone' \| 'tablet' \| 'desktop'` from `matchMedia`. It cleans up its listeners on unmount. |
| `use-panel-scroll.ts` | Resets the panel's scroll position when its content changes ([5.9](#59-panel-scroll-reset)). |
| `use-hot-rotation.ts` | Runs the Hot card's timer, with pause and resume. |
| `use-toast.ts` | A single queue for toasts. A new toast replaces the current one. |
| `filter-query.ts` | Converts filters to and from the route query. These are pure functions. |
| `nav-direction.ts` | Decides whether a panel slides forward or back by comparing route depth. |
| `motion.css` | Keyframes and reduced-motion rules, imported once by `MapShell.vue`. |

Existing files to keep and extend: `DealMap.vue`, `category-style.ts` (pin icons already exist), `filters.ts`, `load-deals.ts`, `distance.ts`, `use-geolocation.ts`, `DealDetail.vue`, `DealRowList.vue`, `BookmarkButton.vue`.

Each teammate's feature is one **child panel**. To keep the panels consistent, every panel uses the same `PanelFrame.vue` slots:

```vue
<PanelFrame title="Venue name" :back="{ name: 'browse' }">
  <template #default>…scrolling content…</template>
  <template #actions>…optional sticky action bar…</template>
</PanelFrame>
```

---

## 5. Feature specs

Each spec ends with **Done when**: what a reviewer should be able to see before approving the PR.

### 5.1 Header and brand menu

- The logo is a button with `aria-expanded` and `aria-controls="site-menu"`. Opening it morphs the three-line icon into an X and drops down the nav.
- The menu shows the user's name and avatar plus a saved-deals count when signed in. When signed out, it shows **Log in** and **Sign up**. Below that come **Add a deal**, the existing nav links (`site-nav-links.ts`), and **Log out** when signed in.
- The menu closes on Escape, on a click outside, and on route change. Focus returns to the logo button when it closes.
- The search field has a clear (×) button that only appears when there is text. Pressing Enter applies the search. Typing applies it after a 250ms pause.
- Quick chips are toggle buttons with `aria-pressed`. **All filters** shows a count badge of active filters that aren't covered by the chips.

**Done when:** the menu works by keyboard alone, and nothing floats loose at any width from 320px to 1440px.

### 5.2 Filters

- The sheet has two columns on tablet and desktop and one column on phone. **It must not scroll internally on tablet or desktop**: size the content to fit. On phone it is full screen, and the page scrolls normally.
- Controls: Valid now, Fresh in last 24h, Budget (price cap), Walking distance, Categories (multi-select), Deal type, When (now / today / this week). Halal and Vegetarian are included only if the data supports them (see [section 11](#11-open-questions)).
- The footer shows **Clear all** and **Show N deals**. N updates live as the user changes filters.
- Extend the `BrowseFilters` type, and keep `updateFilters()` as the only way to change it.

**Done when:** applying a filter changes the pins, the list and the URL together, and Back undoes it.

### 5.3 Map and pins

- Each pin shows its category icon from `category-style.ts`. Pins carry small badges for **verified** and **ending soon**.
- Hovering a list row highlights its pin, and hovering a pin highlights its row. Hover effects only apply on devices with a real pointer (`(hover: hover) and (pointer: fine)`).
- Selecting a deal flies the map there with `map.flyTo(latlng, zoom, { duration: 0.65 })`. Moving from one nearby deal to another should use `panTo` instead.
- After the user drags the map, show a **Search this area** pill. Don't reload results on every drag.
- Keep the existing CARTO basemap with the OneMap fallback (`basemap.ts`).

**Done when:** a pin and its row highlight each other, and the map never re-mounts when moving between panels.

### 5.4 Map controls

- The **list/map toggle** is an icon button. The icon crossfades between list and map, and `aria-label` switches between "Show list" and "Show map".
- **Near me** reuses `use-geolocation.ts`. The button is disabled while locating, and the existing denied or unavailable messages still show.
- **Zoom** shows + and − on tablet and desktop only.

**Done when:** all three controls work by keyboard and touch, and each has a visible focus ring.

### 5.5 Hot right now

- A card at the bottom left rotates through the top deals every **4.5 seconds**. It has dots for each deal, a progress bar, and a pause button.
- Rotation pauses on hover, on keyboard focus, when the tab is hidden (`document.visibilitychange`), and when the user prefers reduced motion. With reduced motion, the user moves between deals manually.
- Clicking the card opens that deal.
- On phones the card sits above the bottom sheet's peek height and never covers the sheet's handle.

**Done when:** the card pauses and resumes correctly, and opening a deal from it reuses the same deal panel as everywhere else.

### 5.6 Panel and bottom sheet

- At 992px and wider, the panel is a 400px column on the left. Below 992px it is a bottom sheet with three snap heights: peek (about 120px), half (50dvh) and full (calc(100dvh − header)).
- Dragging the sheet snaps to the nearest height. A quick flick (velocity above 0.11 px/ms) moves it one height in the flick's direction. While dragging, use pointer capture.
- The panel's content is the only thing that scrolls. Use `overflow-y: auto; overscroll-behavior: contain;` so scrolling inside the panel doesn't drag the map.
- The deal panel has a sticky action bar at the bottom with **Save** and **Get directions**.

**Done when:** on a phone, the sheet can be dragged between all three heights and its content scrolls without moving the map.

### 5.7 Teammate panels

These are the panels each teammate owns. Each one fills `PanelFrame`.

| Panel | Owner workstream | Must show |
| --- | --- | --- |
| `BrowseListPanel` | 1. Browse and map | Sort (nearest / ending soon / newest), result count, rows, empty state with a **Clear filters** button |
| `DealPanel` | 1 and 3 | Deal details, verify vote, report, comments, and the sticky action bar |
| `VenuePanel` | 6. Venue and feed | Tabs for **Now**, **Past** and **About**. Links back to each deal. |
| `AddDealPanel` | 2. Add deal | Stepped form (details → where → when → photo → review), duplicate warning, step indicator |
| `LoginPanel` / `RegisterPanel` | 4. Accounts | The existing `LoginForm.vue` and `RegisterForm.vue` inside a panel. After signing in, return to `?redirect=`. |
| `ProfilePanel` / `SavedPanel` | 4. Accounts | Tabs for **Saved**, **Submitted** and **Settings**. Empty states. |
| `MerchantPanel` | 6 | The merchant's outlets and deals, plus request access |

### 5.8 Feedback

- **Toasts:** one at a time, in an `aria-live="polite"` region. Each fades out after 4.2 seconds, and a new toast replaces the old one.
- **Save:** the heart pops, the saved count in the brand menu updates, and phones that support it get a short `navigator.vibrate(10)`. Wrap the vibrate call in a feature check.
- **Votes** update optimistically. If the request fails, roll the vote back and show an error toast. Never fail silently.

### 5.9 Panel scroll reset

When the panel's content changes, its scroll position resets to the top **instantly**, without smooth scrolling. The slide-in animation hides the jump.

Content changes when any of these change: the route name, route params (deal or venue), the add-deal step, the profile or venue tab, sort, filters or search.

The scroll position stays put for changes within the same content: votes, saves, opening the report menu, and hover.

```ts
// modules/map-shell/use-panel-scroll.ts
import { type Ref, type WatchSource, watch } from 'vue'

export const usePanelScrollReset = (el: Ref<HTMLElement | null>, sources: WatchSource[]) => {
  watch(sources, () => {
    if (el.value) el.value.scrollTop = 0
  }, { flush: 'post' })
}
```

Don't use Vue Router's `scrollBehavior` for this. The page itself never scrolls; only the panel does.

---

## 6. Motion

Add these tokens to `main.css`:

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);     /* things entering */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* things moving on screen */
  --dur-press: 140ms;
  --dur-small: 180ms;   /* chips, menu, toggles */
  --dur-panel: 260ms;   /* panel slides, sheet snaps */
}
```

| Element | Animation | Duration | Easing |
| --- | --- | --- | --- |
| Any button press | `scale(0.97)` on `:active` | 140ms | ease-out |
| Brand menu | fade in, `scale(0.96 → 1)`, grows from the logo (`transform-origin: top left`) | 180ms | `--ease-out` |
| Panel change | slides 24px forward or back (direction from `nav-direction.ts`) and fades in | 260ms | `--ease-out` |
| Filter sheet | Desktop popover grows from the chips. The tablet dialog grows from the centre. On phones it slides up. | 220ms | `--ease-out` |
| Pin select | badge bounces once | 220ms | `--ease-out` |
| Map fly-to | Leaflet `flyTo` | 650ms | Leaflet default |
| Hot card swap | crossfade with `blur(2px)` between cards | 240ms | ease |
| Toast | slides up and fades in, then fades out | 200ms | `--ease-out` |

Rules:

- **No UI animation longer than 300ms**, except the map flight.
- Animate only `transform` and `opacity`. Never `height`, `width`, `top` or `margin`.
- Never use `transition: all`. Name the properties.
- Nothing scales up from `scale(0)`. Start from 0.95 or above.
- Wrap panel children in Vue `<Transition mode="out-in">` with a `:name` bound to the direction.
- Nothing animates in response to a keyboard shortcut.
- **Reduced motion** (`prefers-reduced-motion: reduce`) keeps opacity fades. It removes all movement, scaling, blur and loops, stops the Hot card's auto-rotation, and passes `animate: false` to Leaflet.

---

## 7. No overflow, no cut-offs

This is the most common way a page looks broken on a phone. Every panel must follow these rules.

**Page level**

- The shell is `height: 100dvh`, with a `100vh` fallback first. `dvh` accounts for mobile browser toolbars that `vh` ignores.
- `html` and `body` get `overflow: hidden` on the canvas layout only. The panel scrolls; the page never does.
- Add padding for the iPhone notch and home bar: `padding-bottom: max(var(--space-4), env(safe-area-inset-bottom))` on the bottom sheet and the action bar. Add `viewport-fit=cover` to the viewport meta tag in `index.html`.
- **No horizontal scroll at any width from 320px up.** The Playwright suite checks this ([9.3](#93-responsive-and-overflow-suite)).

**Inside components**

- Every flex or grid child that holds text gets `min-width: 0`. Without it, long text pushes the parent wider than the screen.
- Long user text (deal titles, venue names, addresses, comments) gets `overflow-wrap: anywhere`.
- When a single line is truncated with `text-truncate`, the full text must still be available, either through `title` or an expanded view. Never truncate prices, times or validity.
- Images use `max-width: 100%; height: auto; object-fit: cover` with a fixed `aspect-ratio`, so loading an image doesn't shift the layout.
- Chip rows wrap onto a second line on narrow screens. They never scroll sideways off-screen. If they don't fit, hide the least important chip (as "Ending today" is hidden on phones).
- Popovers and menus are clamped to the viewport: `max-width: calc(100vw - 2rem)` and `max-height: calc(100dvh - <header>)`.
- The sticky action bar must not cover the last item in the panel. Give the scroll area `padding-bottom` equal to the bar's height.
- Inputs use at least 16px text so iOS Safari doesn't zoom in on focus.
- Touch targets are at least 44 × 44px, even when the visible icon is smaller. Use padding to reach that size.

**Test widths:** 320, 360, 390, 768, 834, 1024, 1194, 1280 and 1440px, with both short (667px) and tall (1194px) heights.

---

## 8. Accessibility

- Every icon-only button has an `aria-label`.
- Use landmarks: `<header>`, `<nav aria-label="Site">`, `<main>` for the map region, and `<aside aria-label="Results">` for the panel.
- The filter sheet on tablet and phone is a dialog (`role="dialog" aria-modal="true"`). It traps focus, closes on Escape, and returns focus to the **All filters** chip.
- When the route changes, move focus to the new panel's heading. A screen reader user should hear where they landed.
- The map has a keyboard alternative: the list panel. Every deal reachable from a pin is also reachable from the list.
- Text contrast is at least 4.5:1. Coral on paper is fine for prices at 15px bold, but check any new combination.
- The Hot card's pause button and its dots work by keyboard.

---

## 9. Tests

The repo already uses **Vitest + @vue/test-utils (jsdom)** for unit tests in `apps/web/tests/`, and **Playwright** for end-to-end tests in `e2e/`. Keep that split. jsdom has no layout engine, so it can't measure overflow or sizes. **All layout and overflow checks belong in Playwright.**

| Kind | Tool | Lives in | Command |
| --- | --- | --- | --- |
| Unit | Vitest (jsdom) | `apps/web/tests/*.test.ts` | `pnpm run test:unit` |
| End-to-end and layout | Playwright (Chromium) | `e2e/*.spec.ts` | `pnpm run test:e2e` |

Both run in CI on pull requests to `main` through `pnpm run check:all`. No new test dependencies are needed.

Write each test before its feature (red, then green). Follow the conventions in [testing.md](testing.md):

- Select elements by role and label, and fall back to `data-testid` only when there's no accessible name.
- Never use hard sleeps or retries. Use fake timers or `expect.poll`.
- Mock the API at the client boundary with labelled synthetic fixtures.

Coverage target: **80%** for `modules/map-shell/` and every new panel.

### 9.1 Unit tests (Vitest)

| File | Cases |
| --- | --- |
| `filter-query.test.ts` | Filters → query → filters round-trips exactly. Unknown or malformed query values fall back to the defaults. Empty filters produce an empty query. The input object is never mutated. |
| `filters.test.ts` (extend) | Each new field has a default. `updateFilters` returns a new object for each field. Active-filter count ignores fields covered by the chips. |
| `nav-direction.test.ts` | browse → deal is forward, deal → browse is back, deal → deal is forward, and the same route is no change. |
| `use-breakpoint.test.ts` | Mock `matchMedia` at 767, 768, 991 and 992px and check the right breakpoint comes back. Listeners are removed on unmount. |
| `use-panel-scroll.test.ts` | `scrollTop` resets on a route param change, a tab change, a step change and a filter change. It doesn't reset on a vote or save. |
| `use-hot-rotation.test.ts` | With `vi.useFakeTimers()`: advancing 4500ms moves to the next deal and wraps at the end. It pauses on hover and focus, pauses when `document.hidden` is true, and never starts with reduced motion. Its timer is cleared on unmount. |
| `use-toast.test.ts` | A new toast replaces the current one. The toast is removed after 4.2s. Timers are cleared on unmount. |
| `brand-menu.test.ts` | It toggles `aria-expanded`, closes on Escape and on a click outside, and returns focus to the button. Signed-out shows Log in and Sign up; signed-in shows the name, saved count and Log out. |
| `quick-chips.test.ts` | Each chip toggles `aria-pressed` and emits new filters. The **All filters** badge count is correct. |
| `filter-sheet.test.ts` | **Show N deals** reflects the live count. **Clear all** resets to the defaults. The dialog role and focus trap apply on tablet and phone. |
| `map-controls.test.ts` | The toggle's label switches. Near me is disabled while locating. Zoom isn't rendered on phone. |
| `hot-card.test.ts` | The dots and pause button work. Clicking the card routes to `deal` with the right `dealId`. |
| `shell-panel.test.ts` | Desktop renders a side panel; phone renders a sheet. A flick above the velocity threshold snaps one height. A slow drag snaps to the nearest height. |
| `deal-panel.test.ts` | A vote updates optimistically and rolls back with an error toast if the request fails. Save updates the saved count. `navigator.vibrate` is only called when it exists. |
| `router-shell.test.ts` | Each child route renders inside `MapShell`. `/deals` redirects to list mode. Guarded children redirect to `login` with `?redirect=`. Admin routes are outside the shell. |
| Each teammate panel | Renders loading, empty, error and loaded states. Long text has `overflow-wrap` applied (check the class). Every icon button has an accessible name. |

Example: the scroll-reset test.

```ts
it('returns to the top when the deal changes', async () => {
  const wrapper = await mountShellAt('/deals/d1')
  const body = wrapper.get('[data-testid="panel-body"]').element as HTMLElement
  body.scrollTop = 400
  await router.push('/deals/d2')
  await flushPromises()
  expect(body.scrollTop).toBe(0)
})
```

### 9.2 End-to-end journeys (Playwright)

Add these to `e2e/map-shell.spec.ts` (one file per journey is fine). Each journey runs at **390px and 1280px**.

1. **Browse:** load `/`, apply the **Under $5** chip, and check that the pins and list both update and the URL contains `max=5`. Open a deal from the list. Press Back and check the filter is still applied.
2. **Pin to deal:** click a pin and check the deal panel opens with the panel scrolled to the top. Click another pin and check it is still at the top.
3. **Filters sheet:** open **All filters**, pick a category, check the **Show N deals** count changes, apply, and check the badge count. Press Escape and check focus is back on the chip.
4. **Hot card:** check the card advances within 6 seconds (use `expect.poll`, not a sleep), pause it, and check it stays put. Click it and check the matching deal opens.
5. **Account:** while signed out, open the menu, choose Log in, sign in, and land back where you started. Save a deal and check the menu's saved count goes up. Log out.
6. **Add deal:** sign in, go through every step, and submit. Check the deal shows as pending in Profile → Submitted.
7. **Venue:** open a venue, switch tabs (the panel resets to the top each time), and open a past deal.
8. **Geolocation denied:** with `context.grantPermissions([])`, press Near me and check the fallback message shows and the list still renders.
9. **Keyboard only:** Tab to the logo, open the menu, go to Add a deal, then Escape back. Every focused element has a visible focus ring.

The existing `starter.spec.ts` checks `toHaveText('Show list')` on `panel-toggle`. When the toggle becomes an icon button, change that check to `toHaveAttribute('aria-label', 'Show list')`.

### 9.3 Responsive and overflow suite

`e2e/responsive.spec.ts` visits every shell route at every test width from [section 7](#7-no-overflow-no-cut-offs). It asserts:

```ts
const WIDTHS = [320, 360, 390, 768, 834, 1024, 1194, 1280, 1440]
const ROUTES = ['/', '/?view=list', '/deals/seed-1', '/venues/seed-venue', '/login', '/add']

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    test(`${route} fits ${width}px`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize({ width, height: 800 })
      await page.goto(route)

      // 1. No horizontal page scroll.
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      // 2. No visible element sticks out past the viewport edge.
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => el.offsetParent !== null && !el.closest('.leaflet-container'))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)
          })
          .map((el) => el.dataset.testid ?? el.className))
      expect(offenders).toEqual([])

      // 3. Every button and link is at least 44px on touch widths.
      if (width < 992) {
        const small = await page.getByRole('button').evaluateAll((els) =>
          els.filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && (r.width < 44 || r.height < 44)
          }).map((el) => el.getAttribute('aria-label') ?? el.textContent))
        expect(small).toEqual([])
      }

      expect(errors).toEqual([])
    })
  }
}
```

The suite also covers:

- **Long-text fixture:** a deal with an 80-character unbroken title, and a venue with a three-line address. Check the panel's `scrollWidth` is no larger than its `clientWidth`.
- **Sticky bar:** scroll the deal panel to the bottom and check the last element is not covered by the action bar. Compare its `getBoundingClientRect().bottom` with the bar's `top`.
- **Filter sheet fits:** at 768, 1024 and 1280px, check the sheet body's `scrollHeight` is no larger than its `clientHeight` (no internal scroll).
- **Header layout:** at every width, check the chip row's top is below the search field's bottom, and that no chip is clipped.
- **Reduced motion:** `page.emulateMedia({ reducedMotion: 'reduce' })`, then check the Hot card doesn't advance after 6 seconds and the panel still changes.
- **Screenshots:** take full-page screenshots at 390, 834 and 1280px for PR review. These are review artefacts, not pixel-diff assertions.

### 9.4 Manual check before each PR

- Real iPhone Safari (or the iOS simulator): the bottom sheet drags, nothing hides behind the home bar, and inputs don't zoom on focus.
- Real Android Chrome: vibration on save, and the back gesture closes the sheet before leaving the page.
- Desktop with the browser zoomed to 200%: nothing is clipped, and the panel stays usable.

---

## 10. Build order

Each phase merges on its own. Teammates can start their panels as soon as phase 2 lands.

| Phase | Scope | Unblocks |
| --- | --- | --- |
| **1. Foundations** | Motion tokens, `use-breakpoint`, `filter-query`, `nav-direction`, `use-panel-scroll`, `PanelFrame`, the overflow suite skeleton | Everything |
| **2. Shell** | `MapShell`, nested routes, `ShellPanel` (side panel and sheet), `ShellHeader` with the brand menu and search, `MapControls`, redirects | All teammate panels |
| **3. Browse** | Quick chips, `FilterSheet`, pin icons and badges, hover linking, Search this area, `BrowseListPanel`, `DealPanel` | Hot card, journeys 1 to 3 |
| **4. Teammate panels** | Venue, Add deal, Login and Register, Profile and Saved, Merchant (in parallel) | Journeys 5 to 7 |
| **5. Delight** | Hot card, toasts, save pop, sheet flick physics, Hot card blur crossfade | Journey 4 |
| **6. Hardening** | Full responsive suite green, accessibility pass, manual device checks, remove `BrowsePage.vue` and `DealsPage.vue` | Release |

---

## 11. Open questions

These need a group decision before the related feature is built.

1. **Halal and Vegetarian filters:** the deal schema has no field for these yet. Either add them to the contract or leave the chips out. Don't show filters that do nothing.
2. **Hot right now ranking:** there's no view count today. Options: record panel opens as views, or rank by recent confirmations. Until we decide, use the soonest-ending verified deals and label the card "Ending soon" rather than claiming popularity.
3. **Walking distance filter:** this needs the user's location. When location is denied, hide the filter rather than disabling it with no explanation.
4. **Search scope:** should search cover only deal titles, or venues and areas too? This decides whether search is one API call or two.

---

## 12. Definition of done

A panel or feature is done when:

- [ ] It matches the canvas board at phone, tablet and desktop widths.
- [ ] Unit tests are written first and pass, with 80% or higher coverage on new files.
- [ ] Its Playwright journey passes at 390px and 1280px.
- [ ] Its routes are in the responsive suite, and the suite passes at every width.
- [ ] There's no horizontal scroll and no clipped text, and touch targets are at least 44px.
- [ ] It works by keyboard alone, every icon button has a label, and focus moves to the new heading.
- [ ] Reduced motion keeps the fades and drops all movement.
- [ ] Loading, empty and error states are designed, not blank.
- [ ] `pnpm run check` passes locally.
