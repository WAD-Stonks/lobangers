# Platform administration

Owner: Noah. Accounts remain at `/admin/accounts` within the seven-page [admin operations workspace](admin-operations.md). Its API uses explicit same-origin REST resources and named Axios client functions; app-local account-access services are in `apps/api/src/modules/platform-admin`.

## Scope

- Account search, role filtering, cursor pagination and account details.
- Versioned role changes, with self-role changes blocked and concurrent administrator changes serialized.
- Review of existing merchant-access requests, with approval limited to the named active stall and merchant.
- Explicit account-to-stall grants, revocation and two-stall isolation.
- Atomic account-action history with actor, target, stall, note, time and before/after role snapshots.
- Approved account-security detail, non-bearer session revocation and indefinite suspension/reinstatement. Sensitive account actions require reason, explicit confirmation and a genuine primary sign-in within five minutes, not MFA or renewed-session age. See [the approved policy and native boundaries](admin-operations.md#approved-account-security-policy).

Account deletion is unavailable until the team agrees retention and anonymisation. No deletion endpoint, production account provisioning, schema application, source activation, deployment or scheduler is included. Kang En owns user-facing request screens and account lifecycle; Isaac owns merchant promotion management. This module does not implement those screens or promotion endpoints.

## Authorization and versions

`User.role` remains a single server-owned field: `USER`, `MERCHANT`, `MODERATOR` or `ADMIN`. Better Auth defaults to `USER` and rejects client control of this field. `MERCHANT` alone grants no stall capability.

Every administration query checks the current database-backed ADMIN role. Mutations additionally retain the trusted-origin guard, recheck the actor inside the write transaction, validate strict bounded inputs and compare the expected version. A shared `PlatformAccessFence` write prevents snapshot-isolation write skew between role, request and grant actions. Conflicting transactions return `CONFLICT`, not a silent retry or partial success. Identity and venue/merchant timestamp writes also conflict with concurrent changes to those records.

- `changeRole` requires `expectedVersion`; own-role changes and no-op changes are refused. Leaving MERCHANT revokes its active grants. Role changes invalidate pending requests so old requests cannot silently restore permissions.
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

No real account is automatically promoted and no demonstration records are inserted into a configured database. Arrange an explicitly approved isolated demo setup before a live walkthrough. Tests contain synthetic fixtures for review.

See [database schema](database-schema.md) and [security notes](security.md).
