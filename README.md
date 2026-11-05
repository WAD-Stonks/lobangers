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

Sign in at https://lobangers.vercel.app/sign-in.

| Role | Email | Password |
| --- | --- | --- |
| Customer | `professor-customer@demo.example.test` | `IBkjrZGzuT0C3fpWgnoH93ong4S4FmqY` |
| Admin | `professor-admin@demo.example.test` | `pJ6_5RqQlrQ9xF1jGUqXVz3NUUJsqYIY` |
| Merchant | `Isaacfromisaac@gmail.com` | `1234567890`|

## 1. How to Run
From the repository root, install dependencies and create local configuration by running the following commands:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup
```
Fill in the .env file. Then, open two terminals at the repository root.

**Terminal 1: start the local database**

```sh
pnpm run db:local
```


**Terminal 2: create the schema and start the app**

```sh
pnpm run db:push
pnpm run dev
```

Then open:

- Frontend: http://localhost:5173
- API: http://localhost:3000

### Optional: load demo data

The local database can be seeded with fake data. First register two  accounts at http://localhost:5173/register, then run this command:

```sh
pnpm --dir apps/api run seed:local-demo 
```


## 2. Testing the application

The tests cover the customer journey (finding, opening, saving and discussing deals, Squad rooms, Lobbie recommendations, flash deals, signing in) plus the merchant and admin flash-deal tools. On an Apple M4 laptop the three suites together take about **8 minutes**:

| Suite | Command | Tests | Time (Apple M4) |
| --- | --- | --- | --- |
| Unit | `pnpm run test:unit` | ~2,800 | ~1 min |
| End-to-end (browser) | `pnpm run test:e2e` | 103 | ~2–3 min |

Run every command from the repository root, after the install and `pnpm run setup` steps in section 1.

### Unit testing

```sh
pnpm run test:unit
```


### End-to-end testing

The end-to-end tests drive a Chromium browser through the app with [Playwright](https://playwright.dev).

**1. Install the browser (once):**

```sh
pnpm exec playwright install chromium
```

**2. Run the tests:**

```sh
pnpm run test:e2e
```

You do **not** need to start the app, the API or the database first. Playwright starts its own copy of the frontend on port 5180 and the tests supply fake API responses, so results don't depend on live data. Port 5180 must be free; the normal dev server (port 5173) can stay running.

**What you should see:** Playwright prints one line per test as it runs, using several browsers in parallel, and ends with a summary like:

```
  103 passed (2.2m)
```

**To see the results in detail:**

```sh
pnpm exec playwright show-report
```

This opens an HTML report with every test, its steps and, for any failure, a screenshot and a trace you can step through. Failure artifacts are also saved under `test-results/`.

To run a single file, pass its path, for example `pnpm exec playwright test e2e/squad-room.spec.ts`.

**What the end-to-end tests cover:**

| File | What it checks |
| --- | --- |
| `starter.spec.ts` | Landing page into the deal map, the site menu, the not-found page |
| `landing-usability.spec.ts` | Landing page navigation, deal cards and controls, retrying after a failed load |
| `map-shell.spec.ts` | Browsing the map: quick filters, pins to deal details, the filters sheet, venues, denied location, keyboard-only use, Ask Lobbie |
| `responsive.spec.ts` | Every main page fits phone, tablet and desktop widths with no sideways scrolling; sticky bars, filter popup and the map tutorial |
| `community.spec.ts` | Voting a deal still on or expired, commenting, deleting and reporting |
| `squad-lobby.spec.ts` | Starting a Squad room, joining with a code, wrong code, full room, joining while signed out |
| `squad-room.spec.ts` | Voting on deals together, matches, the host's controls, late joiners, leaving and rejoining |
| `flash-drop.spec.ts` | Flash deal banners on the map, claiming a code, viewing it in My codes, sold-out drops |
| `hungry-nearby.spec.ts` | "Lobangers nearby": seeing other diners, sharing and hiding your own spot |
| `shared-login.spec.ts` | Log in with a password, an email code or Google, and password recovery |
| `photo-upload.spec.ts` | Uploading a deal photo, and the message shown when storage is unavailable |
| `merchant-flash-drops.spec.ts` | A merchant drafts, launches, edits, ends and deletes a flash deal |
| `admin-flash-drops.spec.ts` | An admin reviews and removes live flash deals, including edit conflicts |
