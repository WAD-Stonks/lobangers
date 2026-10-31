# Platform administration

Owner: Noah. Accounts remain at `/admin/accounts` within the seven-page [admin operations workspace](admin-operations.md). Its API uses explicit same-origin REST resources and named Axios client functions; app-local account-access services are in `apps/api/src/modules/platform-admin`.

## Scope

- Account search, role filtering, cursor pagination and account details.
- Versioned role changes, with self-role changes blocked and concurrent administrator changes serialized.
- Review of existing merchant-access requests, with approval limited to the named active stall and merchant.
- Explicit account-to-stall grants, revocation and two-stall isolation.
- Atomic account-action history with actor, target, stall, note, time and before/after role snapshots.
- Approved account-security detail, non-bearer session revocation and indefinite suspension/reinstatement. Sensitive account actions require reason, explicit confirmation and a genuine primary sign-in within five minutes, not MFA or renewed-session age. See [the approved policy and native boundaries](admin-operations.md#approved-account-security-policy).
- ADMIN-only email preapproval, claimed only by a verified active USER through successful native authentication. Operator actions record intent; the existing Accounts UI remains the only supported manual role writer.

Account deletion is unavailable until the team agrees retention and anonymisation. No deletion endpoint, production account provisioning, schema application, source activation, deployment or scheduler is included. Kang En owns user-facing request screens and account lifecycle; Isaac owns merchant promotion management. This module does not implement those screens or promotion endpoints.

## Authorization and versions

`User.role` remains a single server-owned field: `USER`, `MERCHANT`, `MODERATOR` or `ADMIN`. Better Auth defaults to `USER` and rejects client control of this field. `MERCHANT` alone grants no stall capability.

Every administration query checks the current database-backed ADMIN role. Mutations additionally retain the trusted-origin guard, recheck the actor inside the write transaction, validate strict bounded inputs and compare the expected version. A shared `PlatformAccessFence` write prevents snapshot-isolation write skew between role, request and grant actions. Conflicting transactions return `CONFLICT`, not a silent retry or partial success. Identity and venue/merchant timestamp writes also conflict with concurrent changes to those records.

- `changeRole` requires `expectedVersion`; own-role changes and no-op changes are refused. Leaving MERCHANT revokes its active grants. Role changes invalidate pending requests so old requests cannot silently restore permissions.
- Assigning ADMIN requires verified email ownership and atomically creates/reactivates its preapproval. Every non-ADMIN assignment retires any active matching preapproval, even USER -> MERCHANT, so a later login cannot undo the deliberate change.
- `reviewRequest` requires the request's `expectedVersion`. Approving promotes a USER to MERCHANT, grants only the request's stall and records the review atomically. Staff identities are not silently downgraded. Repeat or stale decisions are refused.
- `grantStall` requires `expectedUserVersion`, an existing MERCHANT and an active venue/merchant. Duplicate active grants are refused without duplicate audit events.
- `revokeStall` requires the grant's `expectedVersion`, revokes only that grant, increments account access state and invalidates pending requests for that stall. Regrant is deliberate and uses a new grant version.

Account responses project allowed fields rather than exposing Better Auth Account/Session records. Reads return ISO timestamps. Account, request, venue and audit lists use bounded cursor pagination. Administrative notes are required and limited to 500 characters.

## Persistence and audit

- `User.platformVersion` is the optimistic account-access version; an unset/null legacy value is interpreted as zero by the service.
- `MerchantAccessRequest` stores identity/stall display snapshots, PENDING/APPROVED/REJECTED status, version and review metadata.
- `StallGrant` uniquely identifies a user/venue pair. Revocation retains the row; reactivation advances its version.
- `PlatformAudit` stores action, actor-name snapshot, target user, optional venue, note and optional before/after role snapshots. Requests, grants, role changes and their audit events commit or roll back together.
- `PlatformAccessFence` serializes permission writers. It is a correctness mechanism, not a scalability benchmark.

The public API has no audit update/delete operations. This is application-level append-only history, not a tamper-proof database archive. Direct database administrators can still change records. Audit retention and user erasure require a separate agreed policy.

## Handoff to Kang En

The internal server function `submitMerchantAccessRequest(db, actor, { venueId, message })` in `requests.ts` creates a versioned request with an audit event. The verified actor is `{ userId, sessionId }`, not a body-supplied identity or user ID alone. Message length is 1 to 1000 trimmed characters. It rejects unknown input keys, staff requests, duplicate pending requests, already-active grants and inactive/missing venues or merchants.

The protected, trusted-origin REST handler derives both actor identifiers from the verified cookie session, never from the request body. Request status and role are server-owned. User-facing request/status screens remain in Kang En's module. Do not bypass the service with unchecked Prisma request inserts.

## Handoff to Isaac

`requireMerchantStall(tx, actor, venueId)` in `capability.ts` checks the current persisted actor/session, fresh MERCHANT role, active grant and active venue/merchant. The actor is `{ userId, sessionId }` from the verified session. It acquires the permission fence and must run **inside the same interactive transaction as the protected promotion write**, before that write. Verify that the promotion really belongs to the authorized stall. This helper is not a read-only lookup and must not be called outside a transaction then trusted later.

Future merchant mutations should use `accessTransaction` so known concurrency conflicts receive the same safe error mapping. Multi-outlet promotion scope still needs an explicit authorization design; permission for one venue must not imply permission for a whole brand. No merchant promotion endpoint is protected merely because this helper exists.

## Verification and local use

Run from the repository root after dependency installation and Prisma generation:

```sh
pnpm run db:generate
pnpm run format
pnpm run check:all
pnpm run audit
git diff --check
```

For a fresh worktree without `.env`, schema validation can use the deliberately non-connecting `DATABASE_URL=mongodb://127.0.0.1:1/platform_admin_validation_only`. Integration suites replace it with their own disposable replica-set URI before applying the schema. Never point these checks or a blind `db:push` at Atlas or an existing application database.

- API integration tests use real HTTP, Better Auth cookies, Prisma and disposable MongoDB. They exercise authorization, client role escalation, current roles, stale versions, concurrency, atomic rollback and grant capabilities.
- Vue tests use explicitly synthetic REST response fixtures. Playwright runs the real SPA and Axios transport against synthetic API interceptions, including 320/390/1280px layouts. These are not claims of live merchant accounts or an end-to-end browser-to-database journey.
- Existing ingestion, authentication, upload, REST and isolated Vercel-packaging tests remain in the full gate.

No preapproval or demonstration records are seeded by this change. Applying a preapproval to a live database requires separate authorization. Once deliberately configured, verified native sign-in/ownership verification may claim that specific intent; there is no broad first-user bootstrap. Tests contain synthetic fixtures for review.

## Admin-email operator runbook

The command imports no ambient database singleton and defaults to **dry-run**. Supply the intended `DATABASE_URL` through an approved environment/secret mechanism, not a command-line URI or committed `.env`. From the repository root:

```sh
pnpm --dir apps/api admin:emails show --email owner@example.test
pnpm --dir apps/api admin:emails history --email owner@example.test --limit 20
pnpm --dir apps/api admin:emails preapprove --email owner@example.test
# Separately authorized write only: NAME must exactly match DATABASE_URL's database.
# Expected version is the show result, or 0 for an absent approval.
pnpm --dir apps/api admin:emails preapprove --email owner@example.test \
  --apply --database NAME --expected-version 0 \
  --operator 'reviewed operator label' --reason 'Reviewed reason for this exact email'
pnpm --dir apps/api admin:emails revoke --email owner@example.test \
  --apply --database NAME --expected-version 1 \
  --operator 'reviewed operator label' --reason 'Cancel pending future grant'
```

- `show`, bounded `history` (1–100), and dry-run never acquire the writing fence. Writes require the explicit database-name confirmation, captured approval version, operator label (1–80 characters) and reason (1–500); duplicate/unknown flags and malformed inputs fail closed. Output omits database credentials and auth records. No conflict is silently retried. On an uncertain result, inspect `show` and `history` before a deliberate new action.
- Emails are validated, trimmed and lowercased only on operator input. Dots, plus suffixes and domains are not rewritten. Ambiguous case-colliding User identities are refused rather than selecting one. Canonical native identity must match exactly. Raw Studio/database writes bypass these safeguards and are unsupported; Studio is inspection-only for these records.
- `preapprove` creates/reactivates only `AdminEmail` and its event, never a User, provider account, password, session or direct ADMIN role. It works before signup and for an existing USER. MERCHANT/MODERATOR require an explicit Accounts UI role change. Suspended USER preapproval is intent only; reinstatement and a new successful native login/verification are still necessary.
- `revoke` cancels future grants only; it never demotes a current ADMIN. For an existing ADMIN it refuses and directs to Accounts UI, preserving self/final-active-admin and recent-login guards. Inactive/missing intent never automatically removes a role. Retained rows advance versions on reactivation/revocation; no-op writes produce no duplicate event.
- First administrator: an authorized operator preapproves one exact address; its owner completes native signup plus ownership verification, OTP sign-in or Google sign-in. Password signup alone stays unverified USER. When standalone link/verification-OTP proves an unverified preapproved USER's mailbox, the server first retires **all prior passwords/provider links and sessions** and advances the authentication generation. The signup-era password cannot subsequently authenticate as ADMIN. Continue through native OTP sign-in or native password recovery to establish a new password, then perform a genuine primary login before sensitive actions. Standalone verification issues neither a session nor administrative write freshness. Established already-verified accounts keep their credentials, and existing unlisted ADMINs remain unchanged.

`AdminEmailEvent` records APPROVED/REVOKED/PROVISIONED with the approval version, actual nullable human actor, operator label when applicable, verified target, bounded reason and role facts. Automatic policy execution has source NATIVE_AUTH and a null actor, never a fabricated self-promoting administrator. Automatic invalidation of pending merchant requests has a null reviewer and explicit policy reason. Use the command's history for this audit; manual role changes also retain `/admin/audit`. Both histories are application-level append-only, not database-admin tamper resistance.

For standalone verification, the native handler validates the actual ownership proof before invoking server-only preparation. Preparation uses the existing platform transaction fence plus an exact User timestamp/generation condition: account-link deletion, session deletion and one auth-generation advance commit together **before** native `emailVerified=true`. Cleanup failure/conflict aborts verification; consumed OTPs require a newly requested code. A committed retirement is intentionally not restored if the later native write or grant fails: retry ownership verification or use OTP/recovery, never resurrect unproven access. Suspended preapproved unverified USERs cannot complete this transition before reinstatement. Invalid/expired proofs and already-verified/replayed paths do not retire access. A Request-local prepared generation must match the native updated User and the later grant snapshot, so suspend/reinstate or revocation between stages cannot launder stale proof into a fresh generation. Already-admitted old sessions are deleted; native admission fences refuse password sign-ins that read credentials before retirement but try issuing sessions afterward.

Authentication commits before the awaited, separate fenced grant transaction. Only active verified USER -> ADMIN is automatic; competing revocation, demotion, suspension/generation changes and exact-session deletion defeat stale evidence. Role/version, approval synchronization and their event audits commit or roll back together. Grant failure does not undo ordinary authentication or retry escalation: a sanitized `admin-email-provisioning-not-confirmed` diagnostic indicates reconciliation is needed. Fresh native session reads remain authoritative and read-only.

Rollout requires separately reviewed schema/index application (including the unique canonical email index), deployment and actual operator authorization. Local generation and disposable tests authorize none of those actions. Do not backfill approvals for every current ADMIN or directly edit User.role to bootstrap.

See [database schema](database-schema.md) and [security notes](security.md).
