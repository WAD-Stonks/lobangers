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
`pnpm run setup` creates a `.env` file at the repository root. Replace its contents with the contents of the `.env` file included in our submission.

Then open two terminals at the repository root.

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
  133 passed (1.2m)
```

**To see the results in detail:**

```sh
pnpm exec playwright show-report
```

This opens an HTML report with every test, its steps and, for any failure, a screenshot and a trace you can step through. Failure artifacts are also saved under `test-results/`.

To run a single file, pass its path, for example `pnpm exec playwright test e2e/squad-room.spec.ts`.

**End-to-end tests coverage:**

| File | What it checks |
| --- | --- |
| `starter.spec.ts` | Landing page into the deal map, the site menu, the not-found page |
| `landing-usability.spec.ts` | Landing page navigation, deal cards and controls, retrying after a failed load |
| `map-shell.spec.ts` | Browsing the map: quick filters, pins to deal details, the filters sheet, venues, denied location, keyboard-only use, Ask Lobbie |
| `responsive.spec.ts` | Every main page fits phone, tablet and desktop widths with no sideways scrolling; sticky bars, filter popup and the map tutorial |
| `deal-sharing.spec.ts` | Searching for a dish and clearing the search, sharing a deal and opening the shared link while signed out, a link to a deal that is gone |
| `auth.spec.ts` | Signing up, verifying the email and logging in; a wrong password, then logging in and out; logging in with an email code; resetting a forgotten password |
| `account.spec.ts` | Saving deals, finding them in Saved and undoing a removal; changing your display name; requesting merchant access for a stall |
| `add-deal.spec.ts` | Adding a deal step by step with a photo and finding it in My deal submissions; adding a stall that isn't listed yet; a failed photo upload; deleting a submission; being asked to log in first |
| `community.spec.ts` | Voting a deal still on or expired, commenting, deleting and reporting |
| `squad-lobby.spec.ts` | Starting a Squad room, joining with a code, wrong code, full room, joining while signed out |
| `squad-room.spec.ts` | Voting on deals together, matches, the host's controls, late joiners, leaving and rejoining |
| `flash-drop.spec.ts` | Flash deal banners on the map, claiming a code, viewing it in My codes, sold-out drops |
| `hungry-nearby.spec.ts` | Seeing other lobangers on map, sharing and hiding your own spot |
| `shared-login.spec.ts` | Log in with a password, an email code or Google, and password recovery |
| `photo-upload.spec.ts` | Uploading a deal photo, and the message shown when storage is unavailable |
| `merchant-deals.spec.ts` | A merchant logs in and opens the dashboard; adds a deal and ends it; schedules, edits and deletes a deal; runs an ended deal again |
| `merchant-flash-drops.spec.ts` | A merchant drafts, launches, edits, ends and deletes a flash deal |
| `admin-overview.spec.ts` | An admin logs in to the overview and reaches each workspace from it |
| `admin-deals.spec.ts` | An admin corrects and approves a community deal, and is stopped from overwriting a deal someone else changed |
| `admin-ingestion.spec.ts` | An admin opens an imported deal, approves it in Deals and sees it leave the pending imports |
| `admin-moderation.spec.ts` | A moderator hides a reported comment and resolves the report, or dismisses a report |
| `admin-catalogue.spec.ts` | An admin verifies an outlet until deals can use it, and corrects an outlet's name |
| `admin-accounts.spec.ts` | An admin approves a merchant request; changes an account's role, grants stall access and revokes it |
| `admin-audit.spec.ts` | An admin filters the audit history by action, dates and subject, and reads what an entry changed |
| `admin-flash-drops.spec.ts` | An admin reviews and removes live flash deals, including edit conflicts |

## 3. Data sources

Deals data were obtained from the following sources:
- MoneyDigest: https://www.moneydigest.sg/
- Scoobify Daily: https://scoobifydaily.wordpress.com/
- EverydayOnSales Singapore: https://sg.everydayonsales.com/sales-category/food-restaurant-pub/
- ThisCounted (Telegram, @ThisCounted): https://t.me/s/ThisCounted
- Kiasufoodies (Telegram, @kiasufoodies): https://t.me/s/kiasufoodies
- GoodLobang (Telegram, @GoodLobang): https://t.me/s/GoodLobang
