# Administrator-managed ingestion sources

Telegram preview URLs are stored in `ImportSource`, not environment variables.
No schema change, delete, rename or arbitrary-provider endpoint is introduced.
Source configuration never fetches a provider or proves that a channel exists.
Actual scraping must independently validate the provider's preview identity.

## Browser-safe public contract

Import from `@broke-oclock/contracts/ingestion-sources`:

- `telegramPreviewUrlSchema`, `TELEGRAM_RESERVED_PREVIEW_NAMES`
- `ingestionSourceIdSchema`, `ingestionSourceSchema`
- `ingestionSourcesQuerySchema`, `ingestionSourcesResponseSchema`
- `ingestionAddSourceRequestSchema`, `ingestionSourceParamsSchema`
- `ingestionSetSourceEnabledRequestSchema`
- Types: `IngestionSource`, `IngestionSourcesQuery`, `IngestionSourcesResponse`,
  `IngestionAddSourceRequest`, `IngestionSetSourceEnabledRequest`.

`IngestionSource` exposes only `{ id, name, provider, externalId, url, enabled,
updatedAt }`. `updatedAt` is an ISO timestamp; cursors and leases stay private.

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| GET / HEAD | `/api/ingestion/sources` | `limit` 1–50 (default 20), optional lowercase ObjectId `cursor` | `{ items, nextCursor }` |
| POST | `/api/ingestion/sources` | `{ name, previewUrl }` | 201 and source DTO, always disabled |
| PATCH | `/api/ingestion/sources/:sourceId` | `{ enabled, expectedUpdatedAt, reuseConfirmed? }` | source DTO |

All operations require a real session and current database-backed ADMIN access.
Both writes require the exact trusted Origin. Writes use `accessTransaction` and
`requireCurrentAdmin`, including the actual actor write fence. Unknown body/query
keys are rejected with 400. Unsupported methods return 405. Missing source is 404;
stale timestamps, concurrent writes and duplicate channels return 409. Enabling
requires `reuseConfirmed:true`; disabling does not. No mutation is automatically
retried. GET/HEAD do not bootstrap sources or mutate sessions/leases/identity.

List pages are ordered by ascending ObjectId and scan at most `limit+1` records.
Only the fixed MoneyDigest WordPress identity and valid registered Telegram
identity/URL pairs are projected. Invalid legacy Telegram rows can produce a
short/empty page with a continuation; clients must honor `nextCursor`. WordPress
is visible but read-only here. No arbitrary outlet or source provider is accepted.

## Literal URL and identity rules

Accept only exact `https://t.me/s/<candidate>`, with 1–32 ASCII letters, digits or
underscores. Reject credentials, ports (including explicit 443), other hosts,
HTTP, queries, fragments, trailing slashes, whitespace/newlines, percent escapes,
extra path segments, private/invite paths and reserved Telegram route names.
Reserved names are case-insensitive and listed in the shared constant.

These are **syntax bounds, not a username-availability check**. Telegram's basic
username minimum must not reject shorter collectible candidates. A valid-looking
URL alone neither proves a public channel exists nor grants permission to reuse it.

Store the accepted URL literally, preserving username case, and use lowercase
username for new `externalId`. Creation checks existing case-insensitive Telegram
external IDs/URLs within the access transaction; it preserves mixed-case legacy
records, IDs, posts and history. New IDs use the first 24 hex characters of
SHA256(`telegram-source:` + lowercase username), in addition to the existing
provider/externalId unique constraint, so concurrent case variants cannot create
two records.

Toggle compares `expectedUpdatedAt` and advances the timestamp monotonically,
even with a frozen clock. Disabling preserves cursor and foreign lease ownership.
The ingestion worker must recheck **enabled AND owned lease** at every persistence
boundary; this management API does not silently cancel another worker's lease.

## Admin UI

`SourcesPanel.vue` is mounted only inside the authorized ingestion page. It has
labelled fields, literal URL validation, disabled-on-create feedback, bounded
pagination, read-only WordPress rows and a per-source reuse confirmation checkbox.
A shared pending guard prevents double submission and read/write overlap. On409
it removes cached rows, fetches authoritative pages through the affected source,
resets confirmations and never replays the mutation. Uncertain source-toggle
outcomes require an explicit fresh read; failed adds retain the form and advise
refreshing before a manual retry. On401/403 it clears protected state and closes
the parent admin access. Late responses cannot restore an unmounted panel.

## Verification

Use a disposable local validation URL, never a production dotenv/database:

```sh
DATABASE_URL=mongodb://127.0.0.1:1/validation_only pnpm run db:generate
DATABASE_URL=mongodb://127.0.0.1:1/validation_only pnpm run lint
DATABASE_URL=mongodb://127.0.0.1:1/validation_only pnpm run typecheck
DATABASE_URL=mongodb://127.0.0.1:1/validation_only pnpm run test:unit
DATABASE_URL=mongodb://127.0.0.1:1/validation_only pnpm run build
pnpm --dir apps/api exec vitest run --config vitest.config.ts --no-file-parallelism tests/integration/ingestion-sources.test.ts
pnpm exec playwright test e2e/ingestion-sources.spec.ts
```

HTTP integration exercises Express, Better Auth cookies, the public typed Axios
client and Prisma against a disposable Mongo replica. It covers fresh demotion,
hostile/missing Origin, read-only methods, case duplicates/concurrency, stale CAS,
concurrent actor/source changes, safe projection and no provider fetches. Vue and
Playwright boundaries are explicitly synthetic and do not replace backend access
proof. Browser cases exercise native keyboard submission, source toggles, DOM
accessibility snapshots and zero horizontal overflow at 320/768/1024/1440px.
