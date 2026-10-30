# Admin operations workspace

The workspace uses the existing native Better Auth identity and the shared admin shell. Every page requires current server-backed `ADMIN` access. `MODERATOR` does not receive these account, catalogue or ingestion powers automatically.

## Pages

- `/admin`: operational overview and queue links, not fabricated business analytics.
- `/admin/deals`: all-origin deal search, details, content/scope correction, source evidence, review, unpublish and deliberate reopen.
- `/admin/catalogue`: canonical merchants/outlets, corrections, manual evidence and non-cascading archive.
- `/admin/moderation`: separate deal/comment report queues and comment visibility controls.
- `/admin/accounts`: existing merchant requests, roles and stall grants, plus account security and session controls.
- `/admin/ingestion`: existing source/run/draft workflows, full citation evidence, failed-post investigation and bounded recovery.
- `/admin/audit`: protected, paginated business/security-action history with actor, action, subject and date filters.

Shared sign-in, native logout and recovery remain available from the same shell. Navigation does not grant authorization. Public responses are explicit projections, not raw auth/database records.

## Deal correction and publication

`api.adminDeals` uses `/api/admin/deals` for list/detail reads, `PATCH /:dealId/content`, `PATCH /:dealId/scope`, and confirmed `POST` actions for review, unpublish, reopen and scope evidence. Every write captures the displayed `expectedContentVersion` and `expectedOperationVersion` with a required reason.

- Content or scope corrections move eligible active content back to pending review and invalidate approval, publication and current scope confirmation. They retain origin, submitter, original source bytes, hashes, citations and images.
- Hidden/rejected content needs explicit reopen before editing/review. Reopen is a new pending review, not automatic restoration. Soft-deleted records are investigation-only.
- Approval is distinct from publication and commercial validity. The API returns actual state and blockers. Imported content retains existing source/evidence readiness rules; user submissions require their genuine submitter and consistent offer/date information, not a fabricated scraped source.
- Physical publication checks current authority for the complete outlet set. A paginated display subset cannot establish complete scope. ALL-outlet membership changes serialize against publication.
- Scope editing accepts at most 100 outlet IDs. Larger existing scopes remain readable, not silently truncated or rewritten.
- Scope evidence requires reviewed supporting reference and statement, explicit confirmation, and a server-computed current scope hash. Imported evidence pins the exact citation/hash. Submission evidence is labelled as reviewed submission evidence. Recording evidence does not publish.
- Unpublish is a global deal action. It is not an inferred outlet-specific sanction. Commercial expiry, hidden state and unpublished state remain distinct.

### Existing imported editors

Existing category, outlet and review calls also participate in the operation-version check and transactional audit. Omitted `expectedOperationVersion` means the legacy claim zero, never the current database version. New callers always submit the returned actual version. An older caller must adopt the version after the first operation, otherwise it receives a conflict. Material content/scope changes advance content and operation versions; review advances only the operation version. Existing review reasons retain their 1,000-character bound; new admin operation notes remain bounded at 500.

## Canonical merchants and outlets

`api.adminCatalogue` uses `/api/admin/catalogue/merchants` and `/venues` for bounded directories, details, creation, correction and explicit archive. Updates use the displayed `catalogueVersion`; missing/null legacy versions normalize to zero.

- Merchants support creation and name correction, not automatic merge, rebranding, reparenting or restore.
- A new outlet requires an existing active merchant and resolved location tuple. Missing coordinates are not replaced by zero. An outlet's merchant is immutable.
- Tuple corrections invalidate current geography and occupancy authority together. Old exact receipts and hashes remain in append-only evidence history; changing a tuple does not recertify old evidence.
- Explicit evidence recording/withdrawal supports GEOGRAPHY and OCCUPANCY. The server owns hashes, provider and verification timestamps. Staff must record a reviewed real supporting source and statement. OneMap establishes geography only, not merchant occupancy or promotion participation.
- Unverified outlets are visible in maintenance but are not selectable merely because they appear in a picker. Existing outlet-eligibility rules remain unchanged.
- Archive preserves deals, edges, requests, grants and historical evidence. Merchant archive is a parent tombstone, not a child deletion loop. It does not reactivate or rewrite grants. Impact warnings and explicit confirmation precede archive.
- Optional image URLs are safe credential-free HTTP(S) references. These controls do not fetch arbitrary URLs or add an upload feature.

## Reports and comment moderation

`api.adminModeration` uses `/api/admin/moderation/reports` and `/comments`. Deal and comment reports are separate queues with their own cursors, rather than a fabricated cross-collection order.

- An OPEN report can be resolved or dismissed once with its current `moderationVersion`, a reason and confirmation. The original report/uniqueness row remains.
- Resolution does not hide content and does not resolve sibling reports automatically.
- Comment visibility is a separate confirmed action. Hiding participates in the parent deal's existing community-write lock. Restore does not remove author deletion and refuses author-deleted comments.
- Hidden, unpublished or deleted targets remain investigable by staff. Reporter identity remains excluded from public DTOs.
- Existing voting/report budgets, uniqueness, expiry and hiding rules are unchanged. There is no automatic report-count ban, deletion, threshold change or outlet-wide interpretation.
- The page links to the deliberate global deal control for unpublication; a report alone does not establish chain-wide consequences.

## Ingestion evidence and recovery

`api.ingestionInvestigation` adds:

- `GET /api/ingestion/drafts/:dealId/evidence` and `/:citationId` for every member citation, pinned/current hash, source state, safe structured offer values and immutable snapshot detail.
- `GET /api/ingestion/posts`, `GET /posts/:postId` and `GET /recoveries/:recoveryId` for failed/current imported-post investigation and durable recovery outcomes.
- `POST /api/ingestion/posts/:postId/recoveries` with captured timestamp/hash, mode, reason and explicit confirmation.

Snapshot bytes, the latest complete transport envelope and display-only parser values are separate evidence. Prospective envelopes retain the validated original provider object, including unknown and nested fields, before display normalization or semantic/media failure. This is per-post JSON capture, not a replay of original HTTP-page whitespace. A bounded detail response can state that a snapshot is unavailable, invalid or too large, instead of inventing complete content. Display is escaped text, not unrestricted HTML rendering. Historical image final URLs can be null and are explicitly unavailable; source URLs never substitute for missing final-URL provenance.

Recovery modes have different guarantees:

- `REPROCESS_STORED` uses a validated, hash-verified stored complete envelope whose literal provider identity matches the confirmed post, through the same parser, deduplication and immutable citation path. The latest snapshot hash need not equal the last processed content hash. Legacy raw text is not reconstructed into a provider payload.
- `REFRESH_SOURCE_WINDOW` uses only the captured supported registered source, capped at two pages of 20. If the target is absent, the outcome is `NOT_OBSERVED`, not success. It is not an invented provider get-post API, arbitrary URL fetch or global run.

Admission atomically checks the current actor/session, post timestamp/hash, enabled opted-in source and lease, then records the request and audit. Provider work occurs outside that transaction; protected commits recheck actor and lease ownership. Existing 120-second lease, 30-second cooldown and 90-second budget remain bounded. No source is enabled, cursor rewound or processed hash pre-cleared as a shortcut. Approved/rejected/hidden canonical content and SOURCE_CHANGED remain protected. New citation attachment and material supersession fence and advance the parent deal's operation version.

Operation completion and target outcome are different. `PARTIAL`, `INTERRUPTED`, `NOT_OBSERVED`, `STILL_FAILED` and `UNKNOWN` are not interchangeable with recovery. Expired or owner-lost unfinished attempts project as `INTERRUPTED/UNKNOWN` using recorded ownership and the execution budget, without inventing a finish time. Legacy pending attempts also have the durable request-time budget fallback. Unknown interruption is not proof that no commit occurred. After an ambiguous submission, reconcile its exact durable recovery ID and fresh target evidence rather than automatically replaying the request. GET reconciliation never repairs or mutates records.

Manual source runs retain the initiating native-session actor at controlled post, media and cursor commit boundaries. Revocation, suspension or loss of the required role blocks subsequent protected local writes; outcome-only failure bookkeeping and release of the old owner's reservation remain permitted. Scheduled runs retain their separately authenticated system path. A later failure does not erase an existing `SOURCE_CHANGED` blocker or a prior successful processed hash/time.

## Approved account-security policy

These controls were approved on 28 October 2026. They use the existing native primary sign-in, not a second identity system or an MFA claim.

- Suspension is indefinite until deliberate reinstatement. It blocks new password, Google and OTP sessions and protected operations, revokes current sessions, and preserves content and grants.
- Reinstatement cannot revive an old cookie. The target must sign in again.
- No self-suspension or administrative self-session revocation. The final active administrator cannot be removed or suspended.
- Sensitive account actions, including existing role/grant/request decisions, require a genuine primary sign-in within five minutes, a required reason and explicit confirmation. Sliding renewal, replacement-session creation, signup, password reset or email verification cannot manufacture recent-login evidence.
- Revoke-one and revoke-all operate on another account using non-bearer session IDs. Session reads expose bounded dates/device labels, not tokens, raw sessions, provider credentials or passwords.
- Account detail shows email-verification state and supported method availability. Google linkage, configured password and OTP availability are not factor enrollment or MFA assurance.

`api.platformSecurity` uses `/api/admin/security-context`, account `/security` and `/sessions` reads, confirmed `/suspend` and `/reinstate` POSTs, and session DELETEs with current account version and reason. Sensitive refusal is `PRECONDITION_FAILED` with `Fresh sign-in required`. The UI clears consent, offers the existing native sign-out/sign-in path, and never automatically replays the mutation.

Optional legacy-compatible `User.suspendedAt/authVersion/platformVersion` and `Session.authVersion/loginAt` are server-owned. Native adapter transactions guard every session insertion/update with the current user/generation and applicable parent session. Request-owned single-use primary-authentication evidence composes with existing Google account admission. Current session/generation/suspension checks also guard protected application writes and native session-authorized operations. Normal deferred native GET/HEAD reads remain read-only; trusted POST renewal extends expiry without resetting primary-login freshness.

Session revocation cannot retract a remote upload URL already issued or cancel work already admitted by an external provider. Local admission and completion boundaries recheck current access where controlled by the application. These controls do not promise cancellation of capabilities the application no longer owns.

Hard account deletion, impersonation, automatic staff provisioning, MFA enrollment/recovery and new production rate-limit policy remain excluded. Existing native sign-out remains available. Independent sign-in to an active identity is not blocked solely because the previous cookie belongs to a suspended identity.

## Audit and concurrency

Privileged writes use strict input, exact trusted Origin, current persisted actor/session, resource version/CAS and transactional audit. Conflicts do not silently retry. Read-only GET and implicit HEAD must not acquire writing permission fences, update timestamps or renew native sessions.

`api.adminAudit.list` retains bounded cursor pagination and supports actor, action, subject type/ID and optional UTC date range. Provide both range endpoints, at most 90 days: inclusive `from`, exclusive `until`. Existing account-era rows remain readable without a backfill. Safe bounded audit details use an allowlist; invalid persisted detail is not exposed as arbitrary JSON.

The history is application-level append-only, not a tamper-proof database archive or a comprehensive login/access-failure log. No retention, export, credential management or audit-delete feature is added.

## Verification and rollout boundary

Use the repository's canonical format, schema validation, typecheck, unit/package, integration, browser, build and audit commands. In a fresh worktree, use a deliberately nonconnecting validation URL. Real HTTP/native-cookie tests apply copied schemas only to their owned disposable loopback replicas. Test-owned files respect `TMPDIR`; browser fixtures allocate loopback ports and must close their listeners.

Mounted UI and REST-intercepted browser fixtures test the original components/client but are labelled synthetic. Root-connected browser tests keep the original SPA, registered API routers, native cookies/session machinery and disposable database, controlling only external provider/mail boundaries. Neither boundary proves real Google/Resend/OneMap/publisher delivery or production readiness. Exact final check results belong in the PR, not an evergreen hardcoded passing total.

This source change requires a separately approved schema/index application and rollout plan before an existing deployment uses the added fields/collections. It does not apply a production schema, activate a source, provision an administrator, deploy, merge or alter production credentials. Keep the PR open for teammate review.
