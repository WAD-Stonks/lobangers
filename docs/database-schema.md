# Database schema: approved foundation

## Scope and decisions

The original schema change supplied persistence structure. Ingestion and platform-administration workflows have since been added; see [ingestion](ingestion.md) and [platform administration](platform-admin.md) for their implemented boundaries. Source: [team plan](https://docs.google.com/document/d/1Tj4s3xBzRgj3255Rf8mGqqgy_3idha1lteUk-BQzPFw/edit), plus Noah's confirmed decisions in this discussion:

- Keep Prisma 6.19.3, MongoDB and Better Auth 1.7.5; no dependency upgrade or provider change.
- One `User.role`: `USER`, `MERCHANT`, `MODERATOR`, `ADMIN`; default `USER`. MERCHANT requires an explicit active stall grant and is not a brand-wide capability. No MEMBER or role array. Store it on Better Auth's existing User model, register it as a server-owned additional field, and forbid client input on signup/profile updates.
- USER submissions require review before public publication. Staff policy: MODERATOR reviews submissions/reports; ADMIN also manages roles/import administration. The database alone does not enforce the hierarchy. Current ADMIN enforcement lives in the ingestion and platform-admin REST handlers; future moderation and merchant endpoints must enforce their own scope.
- Promotions support selected outlets, all outlets of a merchant, online, or other no-fixed-location use. Votes remain deal-wide, as in the team plan.
- The original schema-only slice did not include feature endpoints. Current platform-admin endpoints and persistence are documented below; ingestion is documented separately. No voting thresholds, scheduler, production seed data or production database writes are introduced.

## Implementation plan and acceptance

1. Add auth role mapping and its real HTTP regression tests. Prove signup and profile updates cannot escalate privileges; legitimate profile changes still work.
2. Add the domain schema and regenerate the existing Prisma client. Exercise typed relations, defaults, uniqueness and transactions against a fresh disposable MongoDB replica set.
3. Update schema/ownership documentation. Run `pnpm run format`, `pnpm run db:generate`, `pnpm run check:all`, `pnpm run audit` and `git diff --check`; inspect the full diff before publication.

The canonical schema stays at `packages/db/prisma/schema.prisma`. Auth mapping is in `packages/auth/src/server.ts`; browser inference is in `packages/auth/src/client.ts`. Tests live under `apps/api/tests/integration/` and are permanent regression coverage for this repository. Use named arrow functions, extensionless aliases and public workspace exports, as documented in [coding standards](coding-standards.md).

## Model map

- **User / Session / Account / Verification:** existing Better Auth records; User gains a single defaulted role and domain back-relations. Account/session identifiers, password handling and cookie behaviour remain Better Auth-owned.
- **Merchant:** brand/business identity. Names are searchable, not unique identity proofs.
- **Venue:** a physical merchant outlet, address, area, latitude and longitude, plus an optional `imageUrl`. Omit the image or store null when no verified venue image is available; existing records need no fabricated placeholder or backfill. This single venue image reference is separate from `Deal.images` and does not add upload ownership, callbacks, URL validation, image fetching or a new public API/UI. Only resolved physical locations belong here; ambiguous imported addresses stay in ImportedPost. Coordinates are not deduplication keys.
- **Deal:** promotion text, category, offer type, terms, optional exact price in minor units/discount percentage, validity timestamps plus original wording, merchant/submitter, applicability, review metadata, publication time and soft deletion.
- **DealVenue:** explicit many-to-many outlet association, unique per deal/venue. Stores no votes: evidence is deal-wide.
- **DealVote:** one current ALIVE/DEAD vote per user/deal; update that record to change a vote. Timestamps allow freshness calculation. No cached vote totals or hardcoded thresholds.
- **Comment / Bookmark:** deal comments with soft deletion and unique user/deal bookmarks.
- **DealReport / CommentReport:** separate typed report targets with one report per reporter/target. Resolution metadata is independent of deal expiry or public visibility. Separate models avoid nullable polymorphic unique-index traps in MongoDB.
- **UploadedFile:** unique UploadThing file key, URL, MIME type, size, uploader and optional attached deal. Unattached uploads can be tracked without a fake deal; provider callbacks/ownership checks and cleanup are not implemented by this schema.
- **ImportSource:** unique provider/external source identity, original URL, disabled-by-default setting, optional cursor and lease metadata. Manual and scheduled ingestion read this registry; Telegram registration and enablement remain explicit administrator operations.
- **ImportedPost:** unique source/external post ID, original URL/title/raw content, provider timestamps, fetch time, parse/review state and safe error classification. A source post may contain several deals. Store a content hash and the last successfully processed hash/time to distinguish changed content from completed processing; reset processing state when content changes.
- **DealSource:** unique deal/imported-post association. One deal can retain several source posts, and one source post can describe several deals. Each association pins the source content hash, raw-content snapshot and original URL used for that deal. Reimports update ImportedPost but must not silently overwrite these citations or moderator-approved deal content. Snapshot text is untrusted and subject to the same size/reuse limits as ImportedPost.
- **ImportedImage:** actual byte SHA-256 as a native string `_id`, MIME type, byte count, hosted-state/UploadThing key and URL, plus bounded upload-reservation/error metadata. Image binary/base64 content is not stored in MongoDB. This record does not create a fake uploader or user-owned upload.
- **DealSourceImage:** immutable image provenance linked to an existing DealSource, unique per citation/image hash. Original attribution and actual final fetch URLs remain distinct. Shared bytes can support several citations without duplicating the hosted file or changing the cited promotion.
- **PromotionIdentity:** a deterministic strong-evidence key in MongoDB's native unique `_id` index, committed with the canonical deal/citation. This is conservative evidence-based duplicate protection, not semantic similarity or OCR.
- **IngestionRun:** source, lifecycle timestamps/state, counters and safe error code. Lease fields and a run record do not themselves implement exclusivity, retries or idempotency. The shared service and activation boundaries are documented in [multi-source ingestion](multisource-ingestion.md).

## Distinct states

- `Deal.reviewStatus`: PENDING, APPROVED, REJECTED, HIDDEN. New records default PENDING. `publishedAt` is unset until publication. `contentVersion` starts at 1; `reviewedVersion` is unset until approval. A future browse query must require APPROVED, matching content/review versions, a publication timestamp and a non-deleted record. Owner changes to text, price, terms, dates, merchant, applicability or images must atomically increment contentVersion, reset to PENDING and clear reviewer/reviewedVersion/reviewedAt/publishedAt. Approval must compare-and-set the version that staff actually reviewed; a stale review must fail. These transitions still need API implementation.
- Commercial validity comes from `validFrom`/`validUntil`, not review status. Unknown dates remain unknown; preserve `rawValidityText`. Define dates as UTC instants with an exclusive `validUntil`; future parsing must interpret Singapore date-only terms deliberately, not invent years.
- Community verification is derived from DealVote plus explicit configurable policy. Approval is not proof that a promotion is still redeemable. No combined "verified/expired/hidden" status field.
- Report resolution is OPEN, RESOLVED or DISMISSED; filing a report does not automatically hide content.

## Invariants the schema cannot enforce

MongoDB has no foreign keys/check constraints here. Prisma relation metadata is not an authorization system and does not guarantee existence when raw IDs are assigned. Future API mutations must validate and use checked connects/transactions where needed:

- SELECTED_OUTLETS requires at least one DealVenue, all belonging to the deal's merchant. ALL_MERCHANT_OUTLETS requires a merchant and no selected-outlet rows. ONLINE/NO_FIXED_LOCATION have no outlet rows and must not create fabricated markers. Applicability alone does not confirm eligibility: the outlet-evidence policy below also requires a current, server-owned scope receipt and usable outlet proofs. Only explicitly confirmed unconditional SOURCE_ALL may expand dynamically to other verified branches. Qualified or exclusion-bearing campaigns need an explicitly reviewed selected roster; unknown and legacy scopes must not automatically enrol new branches.
- Coordinates must be real and within latitude/longitude ranges. Venue matching needs review, not a unique name/proximity heuristic.
- USER_SUBMITTED deals require a real submitter; imported deals retain DealSource provenance. Staff sets review status/reviewer/publication fields, never client payloads.
- Validate date order, category vocabulary, numeric bounds and offer-type/amount consistency. Prices use integer minor units (default currency SGD); MongoDB's Prisma connector does not support Decimal. Percentage discounts are integers; display terms remain available for nonstandard offers.
- Attach only confirmed uploads owned by the acting user. Derive uploader identity and provider metadata server-side, not from a submitted URL. The existing uploader still permits one photo per upload request; this schema does not change that policy or persist callbacks automatically.
- Only authors delete their own comments/submissions; staff actions require server-side checks using the current database-backed session role. Never authorize using browser state or user-provided role values. Role changes use the versioned, transactionally audited platform-admin workflow; other feature ownership checks remain the responsibility of their endpoints.
- Report targets, reviewer IDs and role eligibility must be checked at write time. Do not treat index uniqueness as permission to mutate someone else's record.
- Import leases require atomic acquisition, ownership-token comparison, bounded expiry and matching release. Cursors advance only under an agreed successful-processing policy; no scheduler is wired here. Per-post status and processedContentHash support resuming the latest snapshot. Historical per-run/post attempt logs and a complete immutable revision archive are deferred; aggregate run counters must not be presented as full replay/audit evidence.

## Deletion and privacy

Domain relations use explicit NoAction on delete/update to avoid cyclic/multiple-path cascades and accidental destruction of submitted content/evidence. This does **not** block dangling references at the database level. Use the supplied soft-delete fields for deals/comments/venues/merchants. Before enabling user deletion or physical purges, implement a reviewed transaction that deletes private bookmarks/uploads as appropriate and anonymizes retained contributions/review history; simply calling `user.delete` is not a safe account-deletion workflow. Existing Better Auth Session/Account cascade behaviour is preserved.

Raw imported text may contain HTML: treat it as untrusted, apply size limits and reuse permissions before storing, and never render it directly. Source URLs are attribution, not permission to fetch arbitrary hosts. Store safe error codes, not provider bodies, tokens or stack traces. Prisma models remain server-only; API DTOs must explicitly project allowed fields.

## Index and query strategy

Unique indexes enforce current user/deal votes and bookmarks, report target uniqueness, outlet associations, upload keys, source identities, imported external IDs and source/deal links. Supporting indexes cover public feed/review queues, owner submissions, merchant history, venue lookup, comment chronology, vote freshness and import review/run status. These are an initial query-oriented design, not a benchmark claim.

Geocoding reuse initially means finding an already-reviewed canonical Venue. There is no request-level geocoding cache, negative-cache policy or selected geocoding-provider adapter yet. The older plan mentions OneMap, but OSM/Leaflet is the confirmed map renderer, not a geocoder selection. Settle provider/retention/expiry rules before adding a cache.

Numeric latitude/longitude fields support bounded typed bbox filtering. They are **not** a MongoDB `2dsphere` index and do not provide scalable exact-radius search. Case-insensitive substring name search and vote-count sorting can still be expensive; measure and design a bounded query before shipping. No raw commands, direct-driver shortcuts or pretend geospatial support are introduced.

## Rollout

- Generate/validate locally without applying the configured application database. Integration tests push only to their own disposable replica set, never the existing DATABASE_URL.
- MongoDB uses `prisma db push`, not Prisma Migrate. No migrations directory or destructive push flags.
- `role @default(USER)` is additive. Prisma supplies the default when reading a missing field, but `db push` does not backfill old documents; filters can distinguish missing/null fields. Before a real deployment, inventory existing User documents with typed Prisma, confirm missing-role behaviour and explicitly approve any required backfill. Never overwrite an existing MODERATOR/ADMIN role. Explicit null/invalid stored roles require remediation rather than silent promotion.
- No existing user is automatically promoted. Role-management endpoints are implemented in platform administration. Initial admin provisioning, deployment and application of this schema to Atlas remain separately approved operations.

## Platform-administration additions

`User.platformVersion` tracks access changes. `MerchantAccessRequest` records versioned requests and review snapshots; `StallGrant` is unique per user/venue and preserves revoked rows; `PlatformAudit` is application-level append-only action history; `PlatformAccessFence` serializes permission writes. Existing missing/null account versions are treated as zero. These records do not authorize merchant endpoints unless those endpoints adopt the transactional capability helper.

See [platform administration](platform-admin.md) for invariants, API contracts, audit limitations and the `submitMerchantAccessRequest` / `requireMerchantStall` handoffs. Account deletion remains unavailable. Schema generation and test-owned schema pushes do not apply these changes to a live database.

## Outlet evidence foundation, 21 October 2026

This branch integrates the additive schema, shared policy, public readers and guarded writers. Test evidence is revision-specific; historical focused checks do not establish acceptance of a newer merged tree. Code review, data verification, index application and deployment remain separate stages.

### Stored evidence

`Venue` adds optional `catalogueKey`, `geographyPrecision`, `geographyEvidence` and `occupancyEvidence`. `Deal` adds optional `scopeConfirmation`. These use two embedded MongoDB types, not additional collections. No positive defaults are defined. Missing fields, explicit null, UNVERIFIED and UNCONFIRMED never count as confirmation. `catalogueKey` has a nonunique lookup index: a repeated key, brand name, postcode or coordinate is not sufficient reason to merge outlets.

`OutletVerificationEvidence` stores a required state, provider, receipt reference and subject hash, plus optional source URL/content hash and observed/verified timestamps. The states are UNVERIFIED, VERIFIED and LEGACY_RETAINED. Providers distinguish database snapshots, OneMap, Google Places, official merchants, official properties and explicit administrator evidence. Precision is UNKNOWN, PROPERTY or OUTLET; a mall/property point must not be relabelled as a shop entrance.

Geography and occupancy have separate versioned SHA-256 domains over the exact venue ID, merchant ID, name, address, postcode, coordinates, catalogue key and precision. Changing any tuple member invalidates the matching proof. Permission-fence timestamps and proof fields are excluded from these subject hashes. Null and absent optional tuple values have the same unknown semantics; identifiers are never case-folded or repaired.

VERIFIED geography needs a compatible geographic provider, current subject hash, receipt, valid verification timestamp and usable coordinates/precision. VERIFIED occupancy separately needs official merchant/property or explicit administrator evidence with its occupancy-domain hash. A geocoder discovery or verified point cannot establish occupancy, merchant access or campaign participation. LEGACY_RETAINED records preserve exactly reviewed historical bindings; they are not fresh VERIFIED occupancy.

`OutletScopeConfirmation` records basis, content version, scope hash, evidence reference and an explicit native-ObjectId `retainedVenueIds` array, plus optional source fields, confirmation time and bounded reason code. The bases are UNCONFIRMED, SOURCE_SELECTED, SOURCE_ALL, SOURCE_NONSPATIAL and LEGACY_RETAINED. The hash binds applicability, merchant and the complete sorted unique selected-edge set, including edges to deleted or unverified venues before display filtering. Version equality is checked separately. An absent confirmation timestamp is not invented; the receipt's authority and campaign provenance remain server-writer responsibilities.

### Projection and mutation policy

The server-only `apps/api/src/modules/deals/outlet-eligibility.ts` owns the shared pure policy. Callers must load the complete tuple, proofs, selected edges and current merchant state. General public approval, reviewed-version, publication, deletion and time rules remain separate conditions.

- Source-confirmed physical campaigns require current VERIFIED geography and occupancy for each active same-merchant outlet. SELECTED intersects the complete selected edge set. SOURCE_ALL can represent explicitly unconditional ALL or a separately reviewed selected snapshot, not a qualified campaign inferred from a brand label.
- Legacy physical projection also intersects the exact `retainedVenueIds` captured by the approved pre-change receipt. A new branch remains excluded even when it has independently verified geography and occupancy. A new source-confirmed campaign cannot borrow legacy-only proof.
- Explicitly confirmed nonspatial campaigns have no outlet edges or map points. A parser's NO_FIXED_LOCATION default is not that confirmation.
- New claim/grant/association paths must check current selectable occupancy inside existing authorization/venue/merchant write fences. Filtering a picker alone cannot protect a direct-ID mutation. Existing grant history, revocation and current scoped capability are not globally withdrawn because outlet evidence needs review.
- Association, applicability, merchant, campaign content and selected-edge edits use normal content-version increments and review invalidation. An administrator choosing an outlet from search does not itself establish campaign participation or authorise client-supplied positive proof.
- Imported `validNow` and ongoing claims require supported known bounds, `validFrom <= now < validUntil`. Approval or a geographical point cannot fill missing dates. Genuine user-submitted open-ended validity remains a separate existing policy.

### Additive backfill boundary

The initial backfill only annotates existing Venue and Deal records. It must preserve core business fields, current IDs/associations, content and review versions, moderation/publication decisions, immutable citations, raw source content, hosted media, source enablement and grant history. Exact pre-updater full-record/source/merchant/venue/link fingerprints, not creation times or a free-text review note, establish any permitted legacy retention. All other cases receive durable UNVERIFIED/UNCONFIRMED dispositions. Foreign-country addresses, possible duplicate listings and unmatched geographic evidence stay held, not silently deleted, merged or assigned to a campaign.

Generate the client from the pinned schema without connecting to the application database. Optional field expansion does not backfill MongoDB documents. Inventory existing native fields and indexes, then apply only a reviewed metadata manifest and the one nonunique catalogue-key index. Do not run a whole-database push, reset or data-loss flags for this operation. Tests must establish native missing/null behavior, ObjectId arrays/dates, exact before-state CAS, role/source fences, rollback, no-op replay and uncertainty handling on an owned disposable replica. Live application requires fresh readback and durable per-batch receipts; canonical fencing timestamp changes must be tracked separately from immutable evidence preservation.

Readers that predate these guards ignore this metadata. Do not expand the live catalogue until guarded readers are deployed under separate authorization. Local schema generation and tests do not authorize publication, deployment, source activation or a preview restart.

### Operational status, 22 October 2026

The separately approved metadata backfill applied 83 bounded batches covering 1,101 existing Deals and 525 existing Venues. Retained batch readbacks and subsequent native metadata checks match the reviewed metadata. The original final whole-database verification did not retain a successful result or its underlying exception. Later read-only checks found account/community activity and a Deal timestamp difference, so global snapshot verification remains open. Do not rerun completed metadata writes or restore application timestamps to force an old snapshot to match.

The nonunique catalogue-key index has not been applied to the live database. Its fresh baseline, approval and narrow application remain separate from this code PR. Ingestion and deployment are not activated by the backfill or by this branch. Private operational snapshots, auth records and execution journals are not part of the repository.

## Sources

Reviewed Prisma database-setup (MongoDB reference), Prisma Client API/CLI, Better Auth, repository-architecture and security guidance. Postgres/Supabase-specific schema advice does not apply to this MongoDB project. Earlier package-owned tRPC guidance described the prior API transport and is superseded by [the REST API guide](rest-api.md).

- [Prisma MongoDB connector and limitations](https://www.prisma.io/docs/orm/overview/databases/mongodb)
- [Better Auth additional fields and input ownership](https://better-auth.com/docs/concepts/database#extending-core-schema)
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)

