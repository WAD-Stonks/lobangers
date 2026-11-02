# Vercel setup and release status

## Projects and safety boundary

Both projects exist in `noahmhs-projects` (`team_FRUcWuiMYuhmD9AYY8BStn20`) and are connected to `WAD-Stonks/broke-oclock`. Automatic Git deployment creation is disabled in each project's settings (`gitProviderOptions.createDeployments: "disabled"`); both checked-in Vercel configs also set `git.deploymentEnabled: false` as an additional guard. Git connection and local builds are not deployments. Do not enable automatic deployments, run bare `vercel` or `vercel deploy`, change protection, or apply the Atlas schema without explicit approval.

Release snapshot, 2 November 2026: the web deployment from main `8b82781` reached Ready. The API build from the same revision completed, but Vercel CLI 65.4 rejected its packaging with `duplicated_cron_job` for `/api/ingestion/scheduled-runs` at `0 0 * * *`. The correction below is awaiting PR review and merge; no corrected API deployment or live API readiness is claimed. No further deployment is authorized before merge. Automatic Git deployment and protection settings are unchanged, and ingestion remains disabled.

- Web: [broke-oclock-web](https://vercel.com/noahmhs-projects/broke-oclock-web), ID `prj_6U8UcFhnd4LDw97qaROzzuMRhkWq`, root `apps/web`, framework Vite, output `dist`.
- API: [broke-oclock-api](https://vercel.com/noahmhs-projects/broke-oclock-api), ID `prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk`, root `apps/api`, custom Build Output API (framework setting Other).
- Assigned domains: `broke-oclock-web.vercel.app` and `broke-oclock-api.vercel.app`. Domain assignment alone is not live application verification.
- Checked-in install command for both projects: `cd ../.. && pnpm install --frozen-lockfile --ignore-scripts`. Root `packageManager` pins pnpm 10.34.6. Node remains `22.x`; source outside each project root must be included.
- Checked-in web build: `pnpm run build`.
- Checked-in API build: `cd ../.. && pnpm run build:vercel:api`. This explicitly generates Prisma and runs pinned esbuild through Node/tsx. All install hooks remain disabled; no runtime bootstrap, global executable or lifecycle exception is needed.
- On 11 October 2026, Noah authorized updating the live setup. Both projects' install/build overrides were changed from Bun to the commands above and independently read back. Node `22.x`, roots/frameworks, shared-source inclusion, disabled Git deployments and deployment protection were also verified. Both deployment lists were empty; no Vercel build or deployment was performed.

## Why a custom API build

The native Express build succeeded but its generated Node handler still imported `@api/auth`; loading that artifact failed with ERR_MODULE_NOT_FOUND. It also selected the app factory rather than a ready default-exported HTTP app. A successful build alone was not a usable function.

`apps/api/src/vercel.ts` default-exports the existing Express factory result, without a listener or shutdown handlers. Local `src/server.ts` remains unchanged. The build script bundles TypeScript aliases and workspace dependencies into one ESM Node function. ESM preserves UploadThing's `import.meta`; a Node `createRequire`/filename/directory bridge supports bundled CommonJS dependencies and Prisma native loading. Local production uses the same bundling/engine-copy path.

The output is `apps/api/.vercel/output`, with an `api.func` handler and catch-all routing that retains the original request path for the Express `/api/*` routes. Vercel CLI collects this into its selected output directory. This is packaging, not new product endpoints.

`scripts/build-vercel-api.ts` is the sole cron declaration owner. It emits one daily job (`/api/ingestion/scheduled-runs`, `0 0 * * *`) into `.vercel/output/config.json`, as supported by the [Build Output API configuration](https://vercel.com/docs/build-output-api/configuration#crons). Do not repeat it in `apps/api/vercel.json`: source and output declarations together caused the duplicate-job rejection. The generated function retains `maxDuration: 300` for all API endpoints, Node 22, and the same catch-all routing. No web or GitHub scheduler is added. Artifact correctness does not prove production cron registration, authentication, plan compatibility or live ingestion acceptance.

Prisma generation includes `native` and `rhel-openssl-3.0.x`; the function explicitly targets Linux x86_64/Node22. The script copies schema and native-engine files beside the bundled client. No credentials are embedded. Never deploy a macOS-generated artifact to another architecture without checking its target engine; prefer a Linux build for the first approved release. Neither this script nor Vercel builds run `db push`.

## Routing

`apps/web/vercel.json` forwards `/api/:path*` to the API project first, then uses `/index.html` for SPA history-mode routes. Browser clients remain same-origin. This production upstream is not a preview-isolation strategy: do not enable previews until separate database/auth origins and a matching API upstream are designed. Git deployments are disabled meanwhile.

## Environment readiness

Historical setup snapshot, 11 October 2026: the API project's production configuration was verified with these non-secret settings:

- `WEB_ORIGIN=https://broke-oclock-web.vercel.app`
- `BETTER_AUTH_URL=https://broke-oclock-web.vercel.app`
- `PHOTO_STORAGE_PROVIDER=uploadthing`
- `NODE_ENV=production`
- `INGESTION_ENABLED=false`
- `MONEYDIGEST_REUSE_APPROVED=false`

At that time, `DATABASE_URL`, `BETTER_AUTH_SECRET` and provider credentials were absent. This historical snapshot is superseded by the authorized Production configuration update reported on 2 November 2026: API runtime settings from the main worktree's root `.env` were synchronized, including database/auth, Google, Resend, OneMap, UploadThing, Gemini and Groq configuration. The web has only `VITE_CARTO_API_KEY`. No secret values are recorded here. Configuration presence is not database, provider or inbox-delivery acceptance; `INGESTION_ENABLED=false` remains in effect.

Manage server runtime values directly in **broke-oclock-api → Settings → Environment Variables → Production**. Keep API credentials out of the web project; its CARTO key is publishable browser configuration. GitHub Environment secrets cannot be read back via GitHub CLI and are not automatically transferred by Vercel Git integration. GitHub-to-Vercel secret synchronization is not planned; existing GitHub settings are retained but are not the Vercel runtime source.

Keep the intended Atlas target and existing auth secret stable. Configured provider pairs still require separate acceptance: Google's exact frontend-origin callback `/api/auth/callback/google`, Resend's verified sender, OneMap lookup and UploadThing upload behavior. See [the environment inventory](environment-variables.md) for consumers and acceptance boundaries. Do not add VERCEL_TOKEN or unused legacy settings to app runtime. Environment entry does not authorize deployment, database schema application or administrator provisioning.

Vercel's default SSO protection is preserved (`all_except_custom_domains`). That protection can block unauthenticated requests to the assigned vercel.app domains, including the cross-project proxy. Decide approved public-production access/custom domains or a supported server-side bypass before deployment. Do not put a bypass token in frontend code or silently turn protection off.

## Build-only verification

Run each project block from the root of a separate clean checkout/build workspace. Do not share the same `.vercel` environment cache between API and web: this CLI preserves keys absent from the next project, which could carry API secrets into a web build. Pull changes `.vercel/project.json` and its cached environment. Keep `.vercel/` and `.env.local` ignored. `vercel link` may create `.env.local` containing a private OIDC token-never commit or print it.

```sh
# Web: settings and environment cache only, then local production-format build.
VERCEL_PROJECT_ID=prj_6U8UcFhnd4LDw97qaROzzuMRhkWq VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel pull --yes --environment production --scope noahmhs-projects
VERCEL_PROJECT_ID=prj_6U8UcFhnd4LDw97qaROzzuMRhkWq VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel build --prod --yes --scope noahmhs-projects

# API: same build-only commands, explicitly select the API project.
VERCEL_PROJECT_ID=prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel pull --yes --environment production --scope noahmhs-projects
VERCEL_PROJECT_ID=prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel build --prod --yes --scope noahmhs-projects
```

For setup validation, supply a disposable/non-connecting DATABASE_URL to generation rather than borrowing production credentials. The API integration suite builds the function, copies it outside the repository with no node_modules, and executes it under Node against a fresh MongoDB replica. It verifies health, DB readiness, real signup/session default role, hostile-origin rejection and disabled uploads. This runs the local native engine, not the Linux binary; cloud launcher/network/proxy/UploadThing validation still requires an explicitly approved deployment.

Run `pnpm run check:all`, `pnpm run audit`, and inspect both local Vercel outputs. Read back both projects' deployment lists to confirm setup did not deploy. The project IDs above are public configuration identifiers, not credentials.
