# Community verification, comments and reports

Implemented in `apps/api/src/modules/community`, `apps/api/src/rest/routers/community` and `apps/web/src/modules/community`. The real deal panel at `/deals/:dealId` uses this feature. The landing-page hawker scene remains an explicitly fictional explanation; its sample votes never enter the database or the live counts.

## Approved evidence policy

Damien approved **3 distinct positive voters, at least 80% positive votes, within 24 hours** on 22 October 2026.

- One current ALIVE/DEAD vote per authenticated user/deal, enforced by the existing unique index. A vote can be changed or removed. Repeating the same current vote is idempotent and does not refresh its timestamp; an expired vote can be renewed. Votes preceding the latest approval/publication do not verify a newly approved revision and can be renewed against that revision.
- Only votes newer than the freshness cutoff, no later than the server clock, and at/after the current approval/publication count. Reads derive counts without a scheduler or cached database totals.
- At least 3 ALIVE votes and `alive * 100 >= (alive + dead) * 80` produce `LIKELY_STILL_ON`. Three alive plus one dead is uncertain; four alive plus one dead qualifies.
- No recent votes produces `NO_RECENT_REPORTS`; insufficient or conflicting evidence produces `UNCERTAIN`. An exclusive validity end at or before now produces `EXPIRED` regardless of votes. Voting before a known start or after a known end is rejected. Unknown commercial dates remain unknown; community evidence does not invent dates or guarantee redemption.
- Scope remains **deal-wide**, matching the approved existing database model. The UI explicitly explains that availability can vary between outlets and asks contributors to name the outlet in comments. A negative vote does not end a chain-wide promotion or change moderation/publication state.

Server policy is configurable with `DEAL_CONFIRM_THRESHOLD` (default 3, range 1–100), `DEAL_POSITIVE_PERCENT` (default 80, range 1–100) and `DEAL_VOTE_WINDOW_HOURS` (default 24, range 1–168). Missing/blank/UNCONFIGURED values use these approved defaults. Other supplied values must be bounded positive integer strings. Public summaries return the active policy; clients do not choose it. Changing server environment configuration requires restarting/redeploying the API normally.

`DEAL_DEAD_REPORT_THRESHOLD` and `CONTENT_REPORT_THRESHOLD` remain unused reserved decisions. No automatic ended/hide policy has been approved or added.

## REST resources

| Method | Resource | Behavior |
| --- | --- | --- |
| GET | `/api/deals/:dealId/community` | Recent counts, status, last report, comment count, active policy and current visitor's own vote |
| PUT | `/api/deals/:dealId/vote` | Set/change `{value: 'ALIVE' | 'DEAD'}`; return authoritative summary |
| DELETE | `/api/deals/:dealId/vote` | Remove own vote; return summary |
| GET | `/api/deals/:dealId/comments?limit=20&cursor=…` | Bounded newest-first ObjectId pagination, up to 50 rows |
| POST | `/api/deals/:dealId/comments` | Create `{body}`; trimmed, 1–2000 characters |
| DELETE | `/api/comments/:commentId` | Author-only soft deletion |
| POST | `/api/deals/:dealId/reports` | Report a deal with `{reason, details?}` |
| POST | `/api/comments/:commentId/reports` | Report a visible comment with `{reason, details?}` |

Reasons are SPAM, MISLEADING, INAPPROPRIATE or OTHER. Details are limited to 500 characters. Reports are unique per reporter/target; repeating a report does not duplicate or reopen it. They retain OPEN status for staff review. This slice does not add a moderator queue/resolution UI or auto-hide content. Existing hidden/deleted comments stay out of lists/counts. Owners cannot delete another user's comment, including by supplying a different user ID.

Anonymous visitors can read public information. Session-dependent summaries/comment ownership projections use `Cache-Control: private, no-store`. Comments expose name, body, date, ID and a server-derived canDelete flag; no email, author ID, session or account fields are returned. Identity always comes from the existing Better Auth cookie session. Every mutation enforces the exact trusted Origin. All routes enforce strict inputs and method allowlists; unknown, hidden, deleted, unpublished and stale-review deal revisions return 404.

## Concurrency and abuse bounds

Typed Prisma interactive transactions preserve validation and writes together. Meaningful writes to the acting user and target deal serialize per-user budgets and conflict with concurrent deal changes. Known duplicate/write-conflict errors become HTTP 409 without automatic mutation replay. The existing unique user/deal index prevents duplicate evidence under concurrent requests.

Comment budgets are 5 per minute and 30 per hour per account across deals; soft-deleted comments still consume their creation budget. New reports are limited to 10 per hour per account across both report types. Budgets are computed from persisted records within the same serialized transaction, so they are not process-local/serverless counters. Repeated votes cannot inflate totals. These controls limit authenticated contribution abuse; they are not identity proof or a complete distributed denial-of-service defense.

## Frontend behavior

The deal panel supports anonymous reads/login return links, selected vote states, optimistic vote counts with rollback, duplicate-submit prevention, comments with plain-text rendering, draft preservation after failed submissions, pagination, confirmation before own deletion and bounded report forms. After a successful write it refreshes community state and asks the shared map shell to reload counts/badges. Switching deal or account invalidates stale responses and private ownership state. Accepted initial reads, manual refreshes and minute polls also reload the shared deal state when public counts, status or comment count change, so headers, browse rows and map flags age out together. Unchanged polls do not reload the deal list. Summary reads refresh once per minute while the tab is visible; Refresh is available for immediate updates. A comment failure never silently resubmits the mutation.

The deal panel previews the three newest comments. “View all comments (N)” opens a dedicated discussion within the same panel, initially fetching five comments and loading five more per cursor request. The composer stays above the list, and its draft survives switching views. “Back to deal” restores the preview's scroll position and entry-button focus. Long comments collapse to three lines with accessible Read more/Show less controls; resizing recalculates which comments need expansion.

Browse lists and map flags now use the server's community status and fresh counts instead of treating one positive vote as verification. The public deals contract retains backward-compatible optional status metadata for existing fixtures/consumers; the fallback uses the same approved default count/ratio rather than the retired one-vote rule.

## Verification and rollout

- Pure policy/config tests cover the count/ratio and exclusive expiry boundaries.
- `apps/api/tests/integration/community.test.ts` uses real Express, native Better Auth cookies, the shared Axios client and a disposable MongoDB replica. It covers strict input/origin/methods, current vote uniqueness and concurrent writes, renewal, revision freshness, comments, ownership, reports, limits and private deal visibility. It also checks the installed pagination index through print-only introspection of a temporary schema and pages a target deal among 6,000 synthetic comments.
- `apps/web/tests/deal-community.test.ts` uses explicitly synthetic API fixtures to exercise UI actions, rollback, draft recovery, pagination, plain text, stale-response isolation and shared-state notifications after manual refresh/polling.
- `e2e/community.spec.ts` runs the original SPA/client at 320, 390 and 1280 pixels with synthetic API boundaries. It covers the three-comment preview, five-comment pagination, expansion, navigation/focus restoration and contribution actions. Additional manual-refresh and minute-poll regressions check expiry across the panel header, map flag and browse rows. This proves browser interaction and responsive presentation, not live database persistence; the real database boundary is covered separately above.

No new dependencies or persistence models are required. No live schema push, production seed records, role provisioning, deployment or external provider changes are included. The schema includes a compound `Comment(dealId, id DESC)` index matching deal-scoped ObjectId pagination, alongside the existing unique vote/report indexes. During normal database rollout, run `pnpm db:push` against the intended database to apply these indexes before serving traffic. `pnpm db:generate` only regenerates the client and does not install indexes. This change validates schema application against disposable MongoDB only; applying it to a live database remains a separate deliberate operation.
