# Persistent multi-source ingestion

## Entry points and activation

- Administrator `POST /api/ingestion/runs` keeps Better Auth cookie authentication, a fresh database ADMIN check, exact trusted Origin and an absent body.
- Machine-only `POST /api/ingestion/scheduled-runs` calls the **same** domain service. It accepts only a 32–256 character ASCII base64url-style `INGESTION_CRON_SECRET` bearer value. Missing/malformed configuration fails closed. Length is checked before a constant-time comparison. Browser cookies, Origin and Sec-Fetch-Site are refused. No session/role bypass was added to the browser route. GET and HEAD do not invoke scraping.
- `.github/workflows/ingestion-hourly.yml` invokes this POST at minute 17 hourly and supports manual workflow dispatch. `INGESTION_API_URL` is an HTTPS **origin**, not an endpoint path. Set the same secret in the API environment and GitHub's `INGESTION_CRON_SECRET` repository secret. No mutation retries, redirected authorization, provider bodies or secret logging. Missing configuration skips. Partial/failed application results fail the job for operator inspection.
- This is code configuration, not an activated/deployed scheduler. The workflow must reach the default branch; the API and its secrets must be configured/deployed separately. GitHub schedules can be delayed or dropped. This is not an exact-hour delivery guarantee.
- `INGESTION_ENABLED` remains false by default. MoneyDigest additionally requires `MONEYDIGEST_REUSE_APPROVED`; Scoobify requires `SCOOBIFY_REUSE_APPROVED`. Telegram approval is the administrator's explicit database registration/enable decision, not an environment URL.

## Registry, bounds and persistence

Every production invocation rereads enabled `ImportSource` records. Fixed WordPress identities are MoneyDigest (`moneydigest.sg`, `https://www.moneydigest.sg/`, category 285 in its existing adapter) and Scoobify (`scoobifydaily.wordpress.com`). Arbitrary WordPress hosts are refused. Telegram URLs come from each registered row, are validated with the real provider's strict public-preview URL validator, and must match its case-folded external channel identity. Case aliases are selected once. No automatic source enabling or remote source configuration happens here.

A bounded invocation examines the oldest-updated 50 enabled registry records and admits at most 10 supported sources. Lease/request writes advance their timestamp, rotating sources rather than always choosing the first registered channel. A shared soft 90-second budget stops new source/page/image admission; an already-running bounded external operation can finish afterward. The HTTP scheduler allows 180 seconds. Deployment/serverless request limits still require checking before activation.

Per source, fetch the latest page (20 maximum) and at most one historical page, advancing the persisted provider-specific cursor. Every next invocation still polls the latest page. Telegram cursors remain literal message IDs; its persisted external post IDs remain the provider's literal `channel/messageId`, not rewritten IDs. WordPress cursors are bounded page numbers. Each page request is separately fenced and records its request-start timestamp. The durable 30-second cooldown applies between invocations, including failed requests. Two pages within one owned bounded run are permitted.

Source leases last 120 seconds and owner-token releases cannot release a replacement's lease. Source enablement, URL, token and expiry are rechecked at page/image and transactional post boundaries. Post failures are isolated with safe per-post/run codes. A malformed post without a provable supported identity can only be counted at run level; no invented source record is persisted. No provider I/O occurs inside a business transaction.

## Duplicate protection and revisions

`ImportedPost` retains its existing native `(sourceId, externalId)` uniqueness and SHA-256 processed-content skip. Hashes cover the exact bounded JSON stored in immutable `DealSource` snapshots, not merely display text.

`PromotionIdentity` uses the deterministic promotion key as Mongo's native unique `_id`. Its creation, canonical Deal and citation commit in one transaction. Competing transactions retry only P2002/P2034, at most four retries, without repeating provider requests. Concurrent different-source imports converge on one canonical deal and append separate immutable citations.

**This is conservative exact-evidence deduplication, not universal semantic NLP or OCR.** Automatic cross-source linking requires an explicit complete validity window, an unambiguous offer amount/type, explicit outlet scope and explicit eligibility. Its version-2 key hashes the full literal title/body/excerpt together with offer values/window, preserving case-sensitive codes, URL paths, whitespace and conditions beyond display truncation. Do not automatically alias old lossy keys to the new identity. Differently worded/synonymous promotions may remain separate PENDING candidates. Matching a brand, image byte hash, perceptual image similarity or price alone never merges deals. Different dates, outlets and membership terms remain distinct. Every new deal remains PENDING, never automatically published.

A same-identity refresh of an already-linked source records the latest processed transport hash and timestamps without requeuing a rejected/hidden offer or rewriting a pending/approved deal, its pinned evidence hash, citation or images. Metadata-only and image-only changes do not authorize attaching replacement media to the old snapshot. Materially changed promotion evidence creates an unapproved revision and preserves approved content/review metadata and every old citation byte. Exclusive pending revisions may be superseded; a shared canonical draft is not rewritten for one changed source. `SOURCE_CHANGED` holds materially edited approved evidence for clarification. Canonical keys remain tied to their own offer revisions.

Queue readiness and the review mutation evaluate the same complete citation-evidence population. The bounded first attribution and five-image projections do not limit that consistency check: a stale later citation must make the draft unready.

## Imported media contract (for the independently authorized archive importer)

No `UploadedFile` ownership or key semantics were changed. UploadedFile still represents an actual user-owned UploadThing file.

New **`ImportedImage`** is the content-addressed blob record:

| Field | Meaning |
|---|---|
| `id` | Actual image-byte SHA-256, lowercase 64 hex, Mongo native `_id` |
| `mimeType`, `sizeBytes` | Verified actual downloaded MIME and byte count |
| `status` | `DOWNLOADED_ONLY`, `UPLOADING`, `UNKNOWN`, or `HOSTED` |
| `storageKey`, `hostedUrl` | Nullable **actual** UploadThing receipt key and HTTPS URL |
| `uploadToken`, `uploadExpiresAt` | Nullable durable upload reservation/owner |
| `errorCode` | Nullable safe operational code |

**`DealSourceImage`** is immutable per-citation provenance: `dealSourceId` (existing immutable DealSource ObjectId), `imageId` (ImportedImage byte hash), `sourceUrl` (literal original attribution URL), `finalUrl` (actual final fetch URL), nullable original `altText`. Historical HTTP attribution can remain literal while the actual fetch and hosted destination must be HTTPS. `(dealSourceId,imageId)` is unique. A single actual image blob can back multiple citations/deals without assigning a fake uploader or fake UploadThing key.

The provider downloader enforces provider URL/DNS/redirect, byte-count, deadline and image-type bounds. The service recomputes actual byte SHA and checks metadata before persisting it. Only actually downloaded images produce provenance records. Per post at most five source image URLs are handled.

The real UploadThing 7.7.4 server composition consumes the existing `PHOTO_STORAGE_PROVIDER`/`UPLOADTHING_TOKEN` configuration. It uploads `UTFile` bytes with custom ID **`lobangers-image-v1-<sha256>`**, checks the actual returned size, and stores the returned real key/ufsUrl. Uploads are outside business transactions. A native byte-hash record plus conditional claim prevents concurrent duplicate uploads. The custom ID is only a lookup namespace, not a claimed provider uniqueness guarantee.

An uncertain/expired upload must reconcile by custom ID before any resend. A missing lookup does **not** prove nonacceptance: it stays `UNKNOWN` and automatic ingestion does not upload again. An operator must resolve that state. With storage unconfigured, metadata is explicitly `DOWNLOADED_ONLY`: it does not claim durable byte storage or invent a hosted URL. Credentials present in another deployment are not a live-upload receipt from these tests.

An independently verified archive uploader can upsert `ImportedImage` by actual SHA with `status='HOSTED'`, actual `storageKey`/`hostedUrl`, actual MIME/byte count, and then create DealSourceImage links to the immutable citation in a short transaction. Preserve existing hosted receipts/reservations; never replace an active/unknown upload merely because another manifest lacks its result. The runtime and archive uploader must share the custom-ID namespace above.

The admin draft JSON includes optional `images` (always emitted by this server), at most five explicit projections: `{sha256,url,sourceUrl,altText,mimeType,sizeBytes,status}`. `url` is a real hosted URL only when status is HOSTED; otherwise null. Raw storage keys/tokens are not projected. Admin review renders these images with source/hash/status provenance and explicit unhosted/error states. Public browse/detail and venue reads project only usable hosted image URL and alt text for otherwise visible deals, preserving user-upload precedence and excluding private storage/citation metadata. Read-side archive metadata accepts real GIF MIME and sizes above the recurring downloader's cap without changing those download limits. No stock image or source-URL fallback is inserted.

Archive attachment and rendering are independent acceptance gates. Bind the uploader's actual receipts and per-post map to the immutable citation before writing; an image from an edited post is not automatically evidence for its older reviewed snapshot. Revalidate the full expected hosted receipt inside each link transaction, preserve existing business content, and require exact readback plus an empty second plan. Newly catalogued media does not enable a source, deploy an application, or activate the hourly workflow.

## Verification scope and sources

Implementation tests use real HTTP, native synthetic Better Auth sessions and disposable local Mongo replica sets. External publisher/image/storage boundaries and the clock use explicitly synthetic fixtures. Unit runtime composition exercises real provider clients with controlled HTTP and real UploadThing SDK composition. These checks do not read a real environment file or establish live database/upload acceptance, deployment or publication. Separately authorized operational archive attachment needs its own actual provider and database receipts.

Official references actually retrieved by the parent and available in the task's official-docs evidence directory, plus installed SDK 7.7.4 source/types inspected in this lane:

- GitHub scheduled events: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- UploadThing server SDK: https://docs.uploadthing.com/api-reference/ut-api
- Telegram public username syntax/collectibles references are pinned in the provider adapter comments.

Apply the additive application schema only to an explicitly authorized target as a separate deployment/activation decision. Implementation checks generate/validate the client and apply schema only to disposable test databases. A separately scoped media-only collection/index operation does not establish complete application-schema rollout.
