# Lobangers

**IS216 Web Application Development 2**
**G9 Team 2**

| # | Name | Email ID |
|---|------|----------|
| 1 | Allison Margaret Loo Li Houng | allison.loo.2025 |
| 2 | Ashley Tan Min Yee | ashley.t.2025 |
| 3 | Damien Law Yong Chung | damien.law.2025 |
| 4 | Leong Zhi Xin Isaac | isaac.leong.2025 |
| 5 | Lwin Moe Htet | mh.lwin.2025 |
| 6 | Wong Kang En | kangen.wong.2025 |

Lobangers helps students in Singapore find discounted food near them. It brings scattered food promotions into one map and searchable feed, lets the community submit and verify deals, and gives stall owners their own dashboard for promotions.

## Hosted application

https://lobangers.vercel.app

## Github Repo

https://github.com/WAD-Stonks/lobangers

## Test accounts

| Role     | Email                       | Password                                   |
| -------- | --------------------------- | ------------------------------------------ |
| Admin    | `noah.moehtet@gmail.com`    | `pKTTHL83AdM7TrkksHWe8xufCd3cczGIGe2Zue2g` |
| Customer | `damienlaw0601@gmail.com`   | `12345678`                                 |
| Merchant |                             |                                            |

Sign in at https://lobangers.vercel.app/sign-in.

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
pnpm --dir apps/api run seed:local-demo 
```


## 2. Testing the application

### Unit testing
Run the following command in repository root.
```sh
pnpm run test:unit
```

### End-to-end testing
Run the following command in repository root to download the chromium browser. You only need to run this command once.
```sh
pnpm exec playwright install chromium
```


Ensure the application is already running. In a separate terminal, run:
```sh
pnpm run test:e2e
```
