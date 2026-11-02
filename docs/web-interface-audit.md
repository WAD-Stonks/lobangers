# Web interface audit and responsiveness fixes

This report covers an audit of `apps/web` (November 2026) and the fixes that followed. The audit checked the app against [Vercel's Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), and then reviewed every module for responsiveness from 320px phones to 1920px desktops.

## Summary

- The audit covered about 190 Vue and CSS files. About 180 findings came back, and every high and medium item is fixed.
- About 128 source files changed. There are three new shared helpers in `src/lib/`, two new test files, and some intentional assertion updates to existing tests (listed below).
- Every check passes. `vue-tsc` is clean, and 98 test files with 994 tests pass (the run was 986 tests before this work). `vite build` succeeds, and Biome is clean on every changed file.
- No layout changes on purpose apart from the responsive fixes listed here. The colours, fonts, brand and copy tone are unchanged.

## Measured results

We swept 18 routes at 10 widths (320, 360, 375, 414, 600, 768, 1024, 1280, 1440 and 1920px) in Chromium with touch emulation below 1024px, before and after the fixes.

| Check | Before | After |
| --- | --- | --- |
| Routes that scroll sideways (any width) | 0 / 180 | 0 / 180 |
| Tap targets under 44px, all routes at 320px | 47 | 24 |
| Tap targets under 44px, all routes at 375px | 47 | 25 |
| Tap targets under 44px, all routes at 768px | 51 | 33 |
| Readable text under 11px (samples) | 121 | 57 |
| Route × width cases with text under 11px | 28 | 12 |

The app already avoided page-level horizontal overflow. The remaining small targets are inline links inside sentences, which the target-size rule exempts (WCAG 2.5.8), plus card links that are 25px and so above the 24px minimum, and two decorative easter-egg buttons in the hero. The remaining small text is the illustrated map's 6px pin labels, which would cover the island at a readable size.

## Breakpoints

The fixes use the breakpoints already in the codebase, not a new scale:

| Range | Where it is used |
| --- | --- |
| ≤ 360px / 399.98px | Smallest phones: tighter padding, stacked buttons, smaller logo |
| ≤ 480px / 599.98px / 600px | Phones: one-column forms, full-width submit buttons, icon-only controls |
| ≤ 767.98px / 800px | Phones and small tablets: bottom-sheet panels, scrolling chip rows, mobile menu |
| ≤ 991.98px / 1100px / 1150px | Tablets and small laptops: two-column grids, the side panel narrows |
| ≥ 1200px / 1680px | Desktop: wider panels, capped content width |
| `(pointer: coarse)` | Any touch screen: 44px targets and 16px inputs (stops iOS zoom) |
| `(hover: hover) and (pointer: fine)` | Mouse and trackpad only: hover styles, so they don't stick on touch |

## How the fixes help responsiveness

### Phones (320–414px)
- **Touch targets are 44px on touch screens.** This covers map zoom buttons, sheet close buttons, chips, squad code tiles, admin header buttons, logo links, comment menus and merchant outlet chips. It uses a `(pointer: coarse)` media query, so desktop density is unchanged.
- **Map zoom buttons now show on phones.** Before, zooming on a phone was pinch-only. The buttons sit clear of the safe area, and on short landscape phones they form a row so they don't reach the header.
- **Notches and home indicators.** `env(safe-area-inset-*)` padding is on the shell header, bottom sheets, filter sheet, deal dialog, photo viewer, map tutorial, toasts, squad dock and sheets, auth prompt, landing navbar and the "Skip to content" link. `index.html` already sets `viewport-fit=cover`.
- **Keyboard-safe composers.** `interactive-widget=resizes-content` in the viewport meta, together with `dvh` sheet heights, keeps the Lobbie and comment composers above the on-screen keyboard. Inputs are 16px on touch so iOS Safari doesn't zoom on focus.
- **No overflow from long content.** Deal titles, venue names, comment authors, URLs, emails, IDs and outlet names wrap with `overflow-wrap: anywhere`, and flex and grid children get `min-width: 0`. Squad code tiles shrink to fit at 320px. Long button labels such as "Go with the top pick: …" wrap.
- **Chip rows scroll inside their own row** (with scroll-snap), so a long set of filter chips never makes the whole page scroll sideways.
- **Readable text.** 54 landing rules and several badges and labels went from 7–10px up to at least 11px.
- **The hero motion control on phones is a 44px icon button,** so it doesn't cover the map pins. Its label stays available to screen readers.

### Tablets (600–1024px)
- **Scrolling sheets and dialogs** (filter popover, brand menu, map tutorial, outlet dialog, report dialog, squad sheets, nearby popover, landing mobile menu) have a `max-height` that fits short screens, scroll inside themselves, and use `overscroll-behavior: contain`, so scrolling to the end doesn't drag the map or page behind.
- **Admin record lists and tables** scroll inside their own container instead of stretching the page.
- **Landing cuisine grid:** the column count is now CSS-only: four columns above 1100px, and 2×2 at 1100px and below. The JavaScript resize listener is gone, so there's no re-render on resize.

### Desktop (1280–1920px)
- **Comfortable reading widths.** Forms and account pages are capped at 52–64rem, the deals grid at 1600px, and not-found at 40rem, so lines don't stretch across a 1920px screen.
- **The flash-drop edge banner** is clamped in CSS against the map's real width, so it stays inside the map when the side panel narrows it. Before, it read `window.innerWidth` once and went stale on resize.
- **Faster long lists.** Deal rows and cards use `content-visibility: auto`, so the browser skips rendering off-screen results. Keyboard focus and find-in-page still work.

## What else was fixed

### Focus and keyboard
- **Visible focus ring.** The global ring moved from pale yellow (about 1.4:1, nearly invisible) to `--focus-ring: #9a6f00` (4.0–4.5:1 on paper). The dark theme uses `#ffda45`. Bootstrap and admin form fields use a two-tone ring, and checkboxes only show it for keyboard focus.
- **Squad sheets.** The confirm and leave sheets keep Tab inside the sheet, close on Escape, and return focus to the button that opened them (`squad/use-sheet-focus.ts`).
- **Squad join code.** A wrong code no longer rebuilds the input, which used to drop focus. The shake animation replays in place.
- **Lobbie composer.** It stays focusable while a reply is sending (`readonly` with `aria-disabled` instead of `disabled`).
- **Hero featured deal.** The rotation pauses on hover and while it holds focus, stops under reduced motion, and has a Pause/Play motion button that also pauses the waterfront loops. If the card changes, focus stays on the same control.
- **Tabs.** The venue and profile tabs support Arrow keys, Home and End. The venue tab is kept in `?tab=`, so it can be linked.
- **Landmarks and skip link.** The map shell has a `<main>` and a "Skip to content" link. The landing page has its own `<main>`, and its header and footer are no longer nested inside one.

### Forms
- **Wrong submit target (bug).** Pressing Enter in the merchant-access stall search submitted the access request. It now runs the search.
- **Errors tied to fields.** Submission, merchant dashboard, merchant access, flash drop, login, register, forgot and reset password, and profile forms set `aria-invalid` and point to their error text with `aria-describedby`. An invalid submit moves focus to the first problem (`focusFirstInvalid`).
- **Unsaved changes.** The submission form, merchant deal editor, flash drop form and squad creation ask before you leave with unsaved changes, by closing the tab or by navigating away (`useUnsavedChanges`).
- **Autofill and mobile keyboards.** Fields have `name`, `autocomplete`, `spellcheck="false"` and `autocapitalize="none"` on emails and IDs, and `inputmode="decimal"` on prices. Placeholders end in "…".

### Destructive actions
- **Undo.** Removing a saved deal and unsaving from the deal panel both offer Undo. The shell toast gained an optional action button.
- **Confirmation.** Disabling an ingestion source, rejecting a draft (a checkbox, like the other admin panels) and leaving a squad lobby now ask first.

### Navigation
- **Real links.** Squad buttons that only navigated ("Browse deals", "Open the deal", "Start a new room", deal cards) are now `RouterLink`s, so Cmd- and middle-click open them in a new tab.

### Screen readers
- **The deals map is a named region.**
- **Fixed ARIA.** Removed invalid ARIA: `aria-expanded` on a `div`, `aria-selected` on a table row, and `aria-pressed` combined with labels that also changed.
- **Accessible names include the visible text.** Repeated buttons ("Edit", "Remove", "Inspect") carry the item's name in visually hidden text.
- **Live regions stay mounted**, so updates such as the result count are announced reliably. Empty error regions draw nothing.

### Formatting
- **One shared formatter.** Prices, distances, dates and relative times go through `@web/lib/format` using `Intl` (`en-SG`, Singapore time). That replaces about 13 hand-built `$` plus `toFixed` strings and about 15 raw ISO timestamps in admin views. The output matches the old text ("$5.00", "350 m", "1.3 km", "5 min ago").

### Performance and stability
- **Image sizes.** Logos and images have `width` and `height`, so they don't shift the layout as they load. Only the hero map is fetched at high priority; the story map lazy-loads.
- **Layout measurement.** It's throttled to once per animation frame in the hero, map tutorial and nearby layer. The landing nav underline and story bars animate `transform` instead of `width`.
- **Dead code removed.** The commented-out legacy prototype in `SubmissionForm.vue` (about 490 lines) is deleted.
- **Dead landing CSS removed.** 296 rules and 2 unused `@keyframes` came out of the landing stylesheets. They styled markup that no longer exists, such as the old receipt, voting, final-section, story-hint, scanner and live-deal-list designs. The landing CSS went from 8,033 to 6,464 lines.
  - **How rules were chosen.** A rule was removed only if every selector in it needs a class that appears in no `.vue`, `.ts` or `index.html` file. Classes built at runtime, such as `` `hero-${x}` `` and Vue `<Transition>` names, count as used.
  - **How it was checked.** We compared the computed style of every element on the landing page before and after, at 320, 768 and 1440px and at five scroll positions each. There were no differences.

### Map shell logo
- At tablet widths (600–1023px), the ticket mark and wordmark now sit side by side inside the pill. Before, the wordmark dropped onto a new line and spilled out of the pill. The link's flex rule had only applied in `--compact` mode, where the link is hidden anyway.

## Shared helpers added

| File | Purpose |
| --- | --- |
| `apps/web/src/lib/format.ts` | `formatMoneyMinor`, `formatMoneyMajor`, `formatDistance`, `formatDate`, `formatDateTime`, `formatRelativeTime`, `formatCount` |
| `apps/web/src/lib/form-focus.ts` | `focusFirstInvalid`, `trapTabKey`, `focusableWithin` |
| `apps/web/src/lib/use-unsaved-changes.ts` | `useUnsavedChanges(isDirty)` → `{ confirmDiscard }` |
| `apps/web/src/modules/squad/use-sheet-focus.ts` | Focus trap, Escape and focus return for squad sheets |

New tests are `tests/format.test.ts` and `tests/form-focus.test.ts`. There are also new cases for the squad leave confirm, flash-drop field errors, `radiusText` and `distanceText`, the hero pause control, and focus retention when the card changes.

## Tests changed on purpose

Each of these assertions followed markup or text that changed deliberately:
- **Lobbie composer:** `readonly` and `aria-disabled` instead of `disabled`.
- **Landing:**
  - Rotation pauses on hover, and starts paused under reduced motion.
  - The playback toggle no longer uses `aria-pressed`.
  - "Lobangers · Sample stall" text is uppercased by CSS instead of hardcoded capitals.
  - The column count is now CSS-only.
- **App layout:** `.landing-canvas` is a `div`.
- **Ingestion:** the Reject confirmation checkbox, and a `window.confirm` stub for Disable source.
- **Admin catalogue and recovery:** select `data-open-row` instead of `aria-label`.
- **Admin session:** select `.admin-account-trigger`.
- **Splash screen:** logo `alt=""`.
- **Admin deals:** `$12.90` instead of `SGD 12.90`.
- **Platform security:** formatted SGT timestamps in `<time datetime>`.

## How to verify

From the repo root:

```sh
pnpm run lint        # see note below
pnpm run typecheck
pnpm run test:unit
pnpm run build
```

To check responsiveness by hand, open the dev server in browser devtools' device mode at 320, 375, 768, 1024 and 1440px, with touch emulation on below 1024px. Things to check:
- Nothing scrolls sideways.
- Bottom sheets and dialogs scroll inside themselves.
- Zoom buttons show on phones.
- Keyboard Tab order reaches "Skip to content" first on `/browse`.

## Known follow-ups

- **Two lint findings that pre-date this work.**
  - `apps/web/src/modules/squad/squad-forms.ts:103` uses non-null assertions. It was not touched here.
  - Biome also flags the untracked `apps/web/.impeccable/` tool cache. Add it to `.gitignore` or Biome's ignore list.
- **Small text and loops left on purpose.**
  - The 6px illustrated pin labels and the mock social-post contents stay small because they are decorative illustration.
  - The story-map pin pulse still loops with no user pause, although it does stop under reduced motion.
- **Behaviour still to change.**
  - The landing cuisine filters are not in the URL yet.
  - SquadCreatePanel and DealCommunity still disable Submit before a request; their labels explain why.
  - After removing a squad member, focus has no trigger to return to.
- **Saved-deal Undo order.** Undo re-saves the deal, so after a reload it can move to the top of the saved list.
