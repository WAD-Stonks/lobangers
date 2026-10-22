# ADR 0002: separate outlet evidence from campaign scope

Date: 21 October 2026
Status: Design accepted, integrated implementation under code review. Verification is revision-specific. The separately applied metadata backfill, unresolved global snapshot verification, pending lookup index and deployment are distinct gates.
Owners: Noah (platform administration and ingestion), with existing feature ownership preserved.

## Context

One canonical promotion can apply at several physical outlets. The existing Merchant, Venue, Deal and DealVenue models already represent this without copying the promotion per branch. However, merchant membership alone caused ALL_MERCHANT_OUTLETS readers to include every current and newly inserted branch. A geographical lookup proves neither current merchant occupancy nor campaign participation. Historical source text can also contain partial branch lists, exclusions or unknown validity.

The migration must preserve current moderation, versions, source citations, hosted images and concurrent legitimate changes. It must not turn unresolved research into publication or silently expand an old campaign when the catalogue grows.

## Integration decision and separate rollout gates

Retain existing models and applicability modes. Add four optional Venue fields and one optional Deal field, using two typed embedded MongoDB composites and a nonunique catalogue-key lookup index. Missing/null metadata has unknown semantics, never a positive default.

Keep three independent facts:

1. Geography: the exact stored physical tuple has compatible coordinate evidence and declared precision.
2. Occupancy: independent official merchant/property or explicit administrator evidence supports the merchant at that outlet.
3. Campaign scope: a server-owned receipt supports the exact content version, applicability, merchant and complete selected-edge set.

Domain-separated subject hashes invalidate outlet evidence after relevant identity/location edits. Scope hashes include all selected IDs before any deleted/unverified display filtering, while the content version is checked separately. Receipt authority is a guarded server-writer responsibility, not a client checkbox or something a pure hash can establish.

Source-confirmed physical projection requires geography and occupancy verification plus campaign inclusion. Explicit unconditional SOURCE_ALL can remain dynamic; exception-bearing or qualified campaigns require a separately reviewed selected snapshot. Nonspatial confirmation never creates a marker. Unknown source scope stays held even when the record is APPROVED.

LEGACY_RETAINED is a separate compatibility basis. Only exact pre-change records and associations with bound receipts may retain their historical projection. Physical legacy receipts contain an explicit retained venue-ID roster, so they cannot automatically include a newly added branch or lend legacy-only proof to a new source-confirmed campaign. Legacy evidence is not relabelled VERIFIED.

Apply the same projection rules to map/landing results, direct venue current/history feeds, category options and public bookmark content. Private submission, request and grant history remains accessible under its existing authorization. New claim/grant/association mutations require current selectable occupancy within the existing transactional fences; a filtered picker is not sufficient to protect a direct-ID write. Existing capability checks and revocation must not globally depend on new catalogue proofs.

The initial data backfill is metadata-only. It creates no brands/outlets, changes no associations or moderation decisions, and preserves business fields, versions and immutable source/media data. An exact input manifest, fresh current-role/source checks, before-state CAS, deterministic replay and durable before/after receipts fence the operation. Unknown outcomes stop for reconciliation rather than automatic retry. Legitimate canonical fence timestamp changes are recorded separately from immutable evidence.

## Alternatives considered

- Duplicate each deal per branch: rejected because votes, reviews, source citations and edits would diverge across copies of the same campaign.
- Treat a geocoder point or Google Places discovery as participation proof: rejected because geography, merchant occupancy and offer eligibility are different claims.
- Leave ALL dependent only on merchant equality: rejected because catalogue expansion silently changes old campaigns, including campaigns with unknown terms or exclusions.
- Add one boolean verified flag: rejected because it cannot bind the subject/version or distinguish the three facts, and stale flags survive location/content changes.
- Automatically merge matching names/postcodes/coordinates: rejected because several legitimate outlets can share these values and conflicting units remain material.
- Add new campaign/outlet collections or applicability modes: deferred because the existing relationships plus embedded evidence meet this scope without another independent source of truth.

## Consequences and approval gates

The schema remains additive and compatible with absent legacy fields. Some approved records can be suppressed by guarded public readers without changing APPROVED, because unknown scope and unknown dates are not publication evidence. New claims and associations can remain unavailable until official occupancy is established; historical grants and revocation remain intact.

Prisma client generation and disposable schema tests do not apply the schema or backfill to the live database. Optional MongoDB field additions require an explicit reviewed data operation; only the new nonunique catalogue-key index is in scope for narrow index application. Do not run a whole-database schema push or destructive flags for this migration.

Old deployed readers ignore evidence. Catalogue expansion must wait until guarded readers are deployed under separate authorization. This decision does not authorize deployment, source activation, scheduled ingestion, a preview/Tailscale restart, blanket approval or a new public confirmation endpoint. See [database schema](../database-schema.md#outlet-evidence-foundation-21-october-2026) for stored fields and policy details.

## Rollout status, 22 October 2026

The approved additive metadata writes completed in 83 batches for 1,626 existing targets. Independent receipt and native metadata checks confirm their exact metadata; they do not establish a successful historical whole-database verification. Subsequent live account/community activity and a Deal timestamp difference remain explicit verification findings. Preserve those records and the original receipts rather than replaying the backfill or overwriting current timestamps. The catalogue-key lookup index, final operational verification and any deployment remain separately gated. This PR contains maintained source and documentation, not private database snapshots or operational journals.
