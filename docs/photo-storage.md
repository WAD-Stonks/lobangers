# Photo storage — UploadThing

## Implemented infrastructure

- `packages/storage/src/server.ts`: reusable UploadThing adapter, file policy and `photoUploader` contract. The package accepts explicit SDK options and a request-identity resolver; it does not import apps or read environment variables.
- `apps/api/src/uploads.ts`: mounts the adapter at `/api/uploadthing` with app-specific Better Auth/origin checks and callback configuration.
- `apps/api/src/config.ts`: consumes PHOTO_STORAGE_PROVIDER and server-only UPLOADTHING_TOKEN. Without a real configured value, uploads return 503; the rest of the starter still starts.
- `packages/storage/src/client.ts`: typed `uploadPhoto(file, options)` helper, re-exported by `apps/web/src/lib/photo-upload.ts` for existing app-local callers, using the same-origin `/api/uploadthing` route. Supports AbortSignal and the SDK progress callback. No VITE_* secret or extra public API URL needed.
- `@broke-oclock/storage/types` exports **types only** for SDK inference. `/client` is browser-safe and `/server` explicitly rejects browser resolution. There is no root barrel mixing client/server exports and no web-to-API package dependency.
- UploadThing 7.7.4 is pinned once in the storage package. Root `effect: 3.21.0` override fixes GHSA-38f7-945m-qr2g; do not remove until the SDK ships a patched compatible dependency. The pre-existing Prisma CLI advisory exception is separate and unchanged.

## Configuration

1. Create an app on [UploadThing](https://uploadthing.com/dashboard), and copy its SDK token from API Keys.
2. When enabling production uploads, enter UPLOADTHING_TOKEN directly in **Vercel → broke-oclock-api → Settings → Environment Variables → Production**. PHOTO_STORAGE_PROVIDER is `uploadthing`. Do not add the token to the web project.
3. For local development, set the same two keys in ignored root `.env`. Existing `.env` is deliberately not overwritten by setup. Never commit or paste the token into chat.
4. Restart the local API after local environment changes. Vercel environment changes apply to a subsequent deployment, which still requires explicit approval. GitHub secrets do not automatically reach either environment; secret synchronization is not planned. Both Vercel projects remain Git-connected with automatic deployments disabled; see [Vercel setup](vercel-setup.md).
5. In production, the configured BETTER_AUTH_URL origin plus `/api/uploadthing` is the callback URL. The checked-in web rewrite forwards this path; verify its query string/body and UploadThing signature headers reach Express during an approved deployment. UploadThing must be able to reach the endpoint without a login wall or Vercel deployment protection challenge. Only the browser upload initiation needs a session; provider callbacks are authenticated by SDK signatures.

The free plan includes 2 GB shared across apps. It lists private files and region selection as paid features. Use this setup only for public deal photos, never confidential documents. Monitor usage and remove orphaned uploads before expanding beyond a demonstration.

## Client usage

```ts
import { uploadPhoto } from '@broke-oclock/storage/client'

// Call from the student-owned form after selecting/compressing an image.
const photo = await uploadPhoto(file, {
  signal: abortController.signal,
  onUploadProgress: ({ progress }) => updateProgress(progress),
})
// photo: { key, url, uploadedBy }
```

Existing app-local callers can also use the thin `apps/web/src/lib/photo-upload.ts` re-export. `file`, `abortController` and `updateProgress` above are caller-owned values, not implemented application state. Supply an actual File and handle promise rejection. A browser login/session cookie is required. The helper is not yet attached to the assessed deal form.

## Security boundaries and remaining work

- Browser upload initiation requires the exact WEB_ORIGIN and Better Auth session. Identity is resolved before entering the Effect SDK and kept in a request-keyed WeakMap, not ambient AsyncLocalStorage. Client input cannot choose uploadedBy.
- Server route policy permits exactly one JPEG, PNG or WebP, nonempty and at most 4 MB. The control-plane JSON request is limited to 16 KB. Uploaded binary goes directly to UploadThing rather than through Vercel's function body.
- These checks validate declared metadata, not file magic bytes or content safety. Image decoding/re-encoding, moderation and EXIF privacy handling are not implemented; do not describe this as content scanning.
- The SDK authenticates provider callbacks. Do not add a browser-session requirement to callbacks or disable signature verification to make deployment work.
- Returning key/url/uploadedBy to the browser does **not** prove ownership in a later deal request: the browser can alter them. The team must persist verified completion metadata server-side, verify ownership before attaching/deleting, and implement idempotent callbacks/cleanup before shipping the deal-photo feature. No unauthenticated delete endpoint or arbitrary URL importer is included.
- No per-user persistent upload quota/rate limiter is implemented. Add one before broad public use; an authenticated account must not be allowed to consume the shared free quota without bounds.

## Verification scope

Unit tests cover configuration; real local HTTP tests use actual Better Auth/Prisma/MongoDB and the real SDK with explicitly synthetic UploadThing network responses. Chromium exercises the actual browser helper against a stubbed unavailable-storage response. These checks prove their tested wiring, not hosted delivery. Server-side archive uploads require separate actual provider receipts and remote-byte readback; a successful archive does not establish the browser-initiated user-upload/callback/ownership/deletion journey.

## Imported promotion media

Imported images use a separate server-owned path from `photoUploader` and `UploadedFile`:

- File bytes stay on UploadThing. MongoDB stores the actual hosted URL/native file key, byte SHA-256, MIME type, size and upload state in `ImportedImage`, never binary/base64 image content.
- `DealSourceImage` links those verified bytes to immutable source citations, retaining the original attribution URL, actual final fetch URL and optional original alt text. The same bytes can support several citations without inventing a user owner or uploading another copy.
- Browser-initiated user uploads retain their existing authentication, policy and ownership requirements. Imported-image attachment does not grant a user permission to attach or delete arbitrary files.
- Bounded recurring downloads use the provider adapter's format, size, DNS, redirect and deadline limits. Read-side metadata is separate: already verified hosted JPEG/PNG/WebP/GIF archives retain their real MIME and byte size, even when larger than the recurring downloader's limit.
- Admin draft review shows available images with source/hash/status evidence. Public browse/detail and venue projections expose only usable hosted image URLs and alt text for otherwise visible deals; they do not expose private citation bodies, hashes or storage keys. Venue cards retain user-upload precedence.
- Missing, unhosted or failed media has an explicit fallback. Source URLs never become automatic image fallbacks. A late error from a replaced image node must not hide its successful replacement.
- An archive attachment operation binds frozen upload and per-post maps to existing source identities/citation evidence, revalidates complete reviewed image receipts in each link transaction, and reads back exact metadata and links. Preserve mismatched or changed-evidence references as explicit omissions rather than rewriting reviewed citations.
- Media-only activation may add the two media collections and their reviewed indexes. It is not permission for a blanket schema push, new source enablement, scheduler activation, cloud deletion or deployment.

## Current gallery and legacy compatibility

- Public map DTOs retain `cuisine` and the bounded `images` gallery alongside legacy `imageUrl`/`imageAltText`. The legacy thumbnail is the first safe gallery image, including upstream article-hero ordering; the internal selector reads at most five sources and five image links per source and emits at most six distinct gallery images. Source HTML and attribution are used internally only, never returned publicly.
- Both shapes reject non-hosted media, non-raster MIME types, malformed/non-HTTPS URLs and credential-bearing URLs. Existing hosted GIF metadata remains readable independently of downloader size/format limits. Current map photos, row thumbnails and venue cards use no-referrer requests and fail to placeholders/category art instead of fetching original sources.
- `DealSourceImage.finalUrl` remains nullable for historical links that predate redirect capture. A missing final URL does not manufacture a fetch receipt: new captures still require their actual final URL, and archive attachment still validates its own complete receipt. Original HTTP attribution stays literal; public reads do not rewrite provenance or data.
- Optional native `Deal.cuisine`, upload reservation/token/expiry/error fields, UNKNOWN reconciliation, user-upload ownership, outlet proof composites and campaign-scope confirmation remain separate contracts. Schema/client generation is not permission for data rewrites, schema application or deployment.

See [multi-source ingestion](multisource-ingestion.md) for the shared manual/scheduled service, upload reservations and uncertain-outcome policy.

## References

- [Express adapter and Vue example](https://docs.uploadthing.com/backend-adapters/express)
- [File routes and policies](https://docs.uploadthing.com/file-routes)
- [Client helper API](https://docs.uploadthing.com/api-reference/client)
- [Pricing](https://uploadthing.com/pricing)
- [Effect advisory](https://github.com/advisories/GHSA-38f7-945m-qr2g)
