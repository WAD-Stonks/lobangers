# LoBangers

**IS216 Web Application Development 2 | G9 Team 2 | Team Stonkers**

LoBangers helps students in Singapore find discounted food near them. It brings scattered food promotions into one map and searchable feed, lets the community submit and verify deals, and gives stall owners their own dashboard for promotions.

## Live application

The app is hosted on the cloud (Vercel) at:

**https://lobangers.vercel.app**

## Test accounts

| Role     | Email                       | Password                                   |
| -------- | --------------------------- | ------------------------------------------ |
| Admin    | `noah.moehtet@gmail.com`    | `pKTTHL83AdM7TrkksHWe8xufCd3cczGIGe2Zue2g` |
| Customer | `damienlaw0601@gmail.com`   | `12345678`                                 |
| Merchant |                             |                                            |

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
Open two terminals, both opened at the repository root.

**Terminal 1: start the local database**

```sh
pnpm run db:local
```

This starts a local MongoDB replica set on port 27017.

**Terminal 2: create the schema and start the app**

```sh
pnpm run db:push
pnpm run dev
```

Then open:

- Frontend: http://localhost:5173
- API: http://localhost:3000 

### Optional: load demo data

You can seed the database with fake data. First register an account in the app at http://localhost:5173/register, then run:

```sh
pnpm --dir apps/api run seed:local-demo -- --admin you@example.com --merchant you@example.com
```

Replace `you@example.com` with the email you registered. `--admin` gives that account the Admin role and `--merchant` makes it a merchant who owns a demo stall. Both flags are optional and can be repeated.

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
| `pnpm run test:e2e`                             | End-to-end tests (Playwright). Ensure application is already running and the above command as been ran.                       |
| `pnpm run check:all`                            | Everything above, including integration and end-to-end tests          |
