# LoBangers

**IS216 Web Application Development 2 | G9 Team 2 | Team Stonkers**

LoBangers helps students in Singapore find discounted food near them. It brings scattered food promotions into one map and searchable feed, lets the community submit and verify deals, and gives stall owners their own dashboard for promotions.

## Live application

The app is hosted on the cloud (Vercel) at:

**https://lobangers.vercel.app**

## Demo access

Create dedicated demo accounts with unique passwords and share access privately with intended reviewers. Keep account emails, passwords and production credentials out of repository files, issues and public documentation.

Use a separate disposable database and deployment for privileged demonstrations. Give an admin demo account only the permissions needed for the demonstration, and use a different account for the merchant role. Rotate any credentials previously published in this repository and revoke their existing sessions before sharing access again.

Sign in at https://lobangers.vercel.app/login.

## Technology

- **Frontend:** Vue 3, TypeScript, Vue Router, Vite, Bootstrap 5, Leaflet
- **Backend:** Express 5, TypeScript, Zod, Better Auth
- **Database:** MongoDB, Prisma
- **External services:** OneMap (address search), UploadThing (images), Resend (email), WordPress REST API (deal import)
- **Tooling:** pnpm workspaces, Biome, Vitest, Playwright

Repository layout:

- `apps/web`: Vue frontend
- `apps/api`: Express REST API
- `packages`: shared code (auth, database, contracts, API client, integrations, email, storage, UI)
- `e2e`: Playwright browser tests
- `scripts`: setup, development and build scripts

## 1. How to Run

Install Node.js 22.23.1 (the CI version; minimum 22.18.0) and pnpm 10.34.6. Confirm `node --version` and `pnpm --version` before continuing. Use the actual pinned pnpm executable; a newer launcher can handle configuration commands differently even when it reports the project's pinned version.

From the repository root, install dependencies and create local configuration:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup
```

Setup creates an ignored root `.env` with a random local auth secret and generates Prisma Client. Existing `.env` values are retained. The default database URL points to the local replica set below; keep it local before running schema or demo-data commands.

Open two terminals at the repository root.

**Terminal 1: start the local database**

```sh
pnpm run db:local
```

This starts a local MongoDB replica set on port 27017 and stores its data in ignored `.local/mongodb`. Keep the terminal open. The first run may download the MongoDB binary; an existing process on that port is left untouched.

**Terminal 2: create the schema and start the app**

```sh
pnpm run db:push
pnpm run dev
```

Then open:

- Frontend: http://localhost:5173
- API: http://localhost:3000

### Optional services

Configure the required server-side values in the root `.env` to exercise these features locally:

| Feature | Configuration |
| --- | --- |
| Submit a deal with its required photo; merchant photo uploads | `PHOTO_STORAGE_PROVIDER=uploadthing` and a real `UPLOADTHING_TOKEN` |
| Google sign-in | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; register the callback shown in `.env.example` |
| Email-code sign-in and password recovery | `RESEND_API_KEY` and `EMAIL_FROM` on a verified sender domain |
| Ask Lobbie | `GEMINI_API_KEY` or `GROQ_API_KEY` |
| Admin address lookup | `ONEMAP_EMAIL` and `ONEMAP_EMAIL_PASSWORD` |

Password sign-in, browsing and the keyless map do not require these provider credentials. External-service acceptance and delivery must be verified separately. Leave ingestion and publisher reuse flags disabled until the relevant approvals and source setup are complete. See `.env.example` and `apps/api/src/modules/ingestion/README.md` for the current settings.

### Optional: load demo data

You can seed your local database with clearly labelled fake data. First register two distinct accounts at http://localhost:5173/register, then run this root command so it loads the root `.env`:

```sh
pnpm run db:seed:demo -- --admin admin@example.test --merchant merchant@example.test
```

Replace the example addresses with the two accounts you registered. `--admin` gives one account the Admin role; `--merchant` gives the other the Merchant role and a demo stall. An account has one role, so the same address cannot be used for both flags. Both flags are optional and repeatable. The seeder does not create accounts and refuses nonlocal databases unless `--shared-db` is explicitly supplied; use a separate disposable environment for shared privileged demos.

### Other useful commands

```sh
pnpm run db:studio   # Browse the database in Prisma Studio (http://127.0.0.1:5555)
```

## 2. Testing the application

### Automated tests

Run these from the repository root.

| Command                                         | Purpose                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm run lint`                                 | Code style and lint rules (Biome)                                     |
| `pnpm run test:unit`                            | Unit tests (Vitest)          |
| `pnpm run test:integration`                     | HTTP, authentication and database tests against a temporary MongoDB |
| `pnpm exec playwright install chromium`         | One-time download of the browser used by end-to-end tests             |
| `pnpm run test:e2e`                             | Browser tests. Install Chromium first; Playwright starts its own frontend server on port 5180. |
| `pnpm run check:all`                            | Everything above, including integration and end-to-end tests          |
