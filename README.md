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

## 1. How to Set Up
1. Ensure Node ≥ 22.18.0 and pnpm 10.34.6 are installed.

2. From the repository root, install dependencies and create local configuration by running the following commands:
```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup
```
3. `pnpm run setup` creates a `.env` file at the repository root. Replace its contents with the contents of the `.env` file included in our submission.

## 2. How to Run

1. Open a terminal at the repository root and run the following command:

```sh
pnpm run dev
```
You should see the following lines printed in the terminal: "Local:   http://localhost:5173/" and "Lobangers API listening on http://localhost:3000"

2. Open http://localhost:5173 in your browser to access the app.

## 3. Testing the application

The tests cover the customer journey (finding, opening, saving and discussing deals, Squad rooms, Lobbie recommendations, flash deals, signing in) plus the merchant and admin flash-deal tools. On an Apple M4 laptop the three suites together take about **8 minutes**:

| Suite | Command | Tests | Time (Apple M4) |
| --- | --- | --- | --- |
| Unit | `pnpm run test:unit` | ~2,800 | ~1 min |
| End-to-end (browser) | `pnpm run test:e2e` | 133 | ~2–3 min |

### Unit testing

Open a terminal at the repository root and run the following command:

```sh
pnpm run test:unit
```


### End-to-end testing

The end-to-end tests drive a Chromium browser through the app with [Playwright](https://playwright.dev).

1. Install the browser by running this command in a terminal in the repository root (once):

```sh
pnpm exec playwright install chromium
```

2. Run the tests using the following command:

```sh
pnpm run test:e2e
```


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

## 4. Data sources

Deals data were obtained from the following sources:
- MoneyDigest: https://www.moneydigest.sg/
- Scoobify Daily: https://scoobifydaily.wordpress.com/
- EverydayOnSales Singapore: https://sg.everydayonsales.com/sales-category/food-restaurant-pub/
- ThisCounted (Telegram, @ThisCounted): https://t.me/s/ThisCounted
- Kiasufoodies (Telegram, @kiasufoodies): https://t.me/s/kiasufoodies
- GoodLobang (Telegram, @GoodLobang): https://t.me/s/GoodLobang

## 5. Use of AI / LLMs
In line with the IS216 guidelines, this section states where we relied on AI tools. We used three kinds of AI: AI coding assistants, AI-processed content, and an AI feature inside the app.

### 5.1. AI coding assistants
Tools used: Claude Code; Codex GitHub Copilot 
#### How we worked: spec-driven development
We used AI as a coding partner throughout the project. For most features, the AI drafted the first version of the code from specifications we wrote, and we then reviewed, tested and refined it. We did not prompt it once and accept whatever comes back. Each feature went through these steps:
1. Specification. We wrote a prompt describing the problem, the user flow and the rules. For example, for Makan Room: a strict majority of "yay" votes is a match, 80% choosing "next" skips a deal, and people who join late can watch but not vote.
2. Draft and plan. The AI proposed a design and an implementation plan.
3. Review and iteration. The team questioned the plan, changed rules, asked about edge cases (what happens when someone disconnects mid-vote, or when two people claim the last flash code at once) and went back and forth until the design was right.
4. Implementation. The solution was developed with AI assistance.
5. Testing and revision. We ran the app, found problems and repeated the process. The higher-order thinking in this loop was ours: defining the problem, designing the rules, challenging the AI's plans, judging edge cases and deciding what to change after testing. 
6. Integration. As some group members were unfamiliar with TypeScript, we leveraged AI tools to assist with integrating TypeScript into our codebase, ensuring a smoother integration process and improving our team's understanding of its implementation.

#### Daily walkthroughs and usability fixes

We walked through the app as users on phones and desktops, looking for bugs and for places where navigation was confusing. This evaluation was higher-order work: we judged what felt wrong to a user, worked out why, and decided on the fix. What we found became the next round of specs. The commit history shows changes that came from these walkthroughs, including fixing:
- The on-screen keyboard blocked the Lobbie user input textbox on mobile.
- The navbar overlapped modals.
- Map of Singapore getting blocked by sidebar when set to take up 100% of screen area
- Back button behaviors on multiple screens
- Lack of feedback after submitting posts
- Lack of loading indicators when navigating to different screens
- The phone sheet hid Lobbie's suggested deals on the map, so the sheet now lowers when Lobbie answers.
- The flash deal circle wording implied only people inside it could claim, so it was reworded to show distance.
- The email-code login was made the default because it was the easiest path for users.
- Spacing, header and bottom-nav fixes on phones.
- At different viewports, the hero section of the landing page had some alignment issues.
- For the comments and replies, the order and indentation was inconsistent
- A customer-flow audit led to page titles for every route and accessibility fixes to navigation.
- Figuring our clustering zoom levels
- On mobile, merchants were unable to reach the dashboard as the header menu was unavailable for them due to the width of the screen being smaller. So we replaced the “share” button at the navigation bar with “dashboard”
- Merchants were still offered “Add a deal” which was meant for normal users. A separate add deal form was created for merchants and the button to the new form was placed within the merchant dashboard so it was more streamlined.

#### Lower-order tasks we gave to AI
These fall within the uses FAQ 20 allows:
- Boilerplate and configuration: the monorepo setup, build and CI scripts, lint and TypeScript config.
- Generating test cases, fixtures and mock data for user journeys we specified.
- Explaining error messages and suggesting debugging steps.
- Exploring layout and UI ideas before we chose a direction.
- Rewriting imported deal text into a consistent format.

#### Higher-order work the team did without AI
Problem and product:
- Chose the problem (scattered student food deals in Singapore), researched where students find deals today, and defined the features: the deal map, community submission and verification, Squad rooms, flash deals and the merchant dashboard.
- Designed the three user roles (customer, merchant, admin) and decided what each one can see and do.
- Designed the main user journeys: from opening the map to finding a deal, from deal to Squad
room, and from flash-deal banner to claimed code. Decided what each screen should show, and
what to leave out to keep it uncluttered.
- Delegated the features among team members and set priorities as the deadline approached, including cutting or postponing features that didn't serve the core problem.
- Design logo and determine the overall look, feel and theme of app.

#### Data
- Chose to use real Singapore deal data instead of dummy data and chose
the sources it is imported from.
- Set the data-quality rules for imported deals: an outlet is only marked verified if its address appears in the deal's source or the brand's official store list and OneMap matches it to the same postal code. Deals limited to certain days keep those limits in their terms text.

#### Business rules (designed manually by us; the code was then assisted with AI from these specs)
- Squad: a strict majority of "yay" votes is a match, 80% choosing "next" skips a deal, a host hand-over when the host leaves, and late joiners who can watch but not vote.
- Flash deals: one code per person, a fixed number of codes per drop, codes that stay valid for a set time after claiming closes, and readable codes with no 0/O or 1/I.
- Community verification: a deal counts as "verified" after at least 3 "still on" votes, at least 80% positive, within 24 hours. 
- Lobangers nearby: sharing is opt-in, your location is bluqerred before it is stored, and your spot disappears automatically 2 minutes after you stop sharing.
- Community submissions: users can submit deals they find. Submissions are reviewed by an admin before they appear on the map, and users can see and delete their own submissions.
- Community moderation: users can vote whether a deal is still on, comment, and report content. Admins resolve reports and can hide or restore comments, and every admin action is recorded in an audit log.
- Merchants: stall owners request merchant access and wait for approval. They then manage their own deals and flash deals from a dashboard, separate from the customer app.
- Merchant access: a merchant role alone does not grant access to any stall. Admins grant or revoke access to specific stalls, and changing an account away from the merchant role revokes its existing stall access.
- Admin account security: admins can suspend or reinstate accounts and revoke login sessions. They cannot change their own role or suspend themselves, and at least one active administrator must remain.
- Flash-deal oversight: admins can stop scheduled or live flash deals with a recorded reason. Stopping a flash deal also removes its linked deal from publication.
- Deal import: deals are imported from public sources and must pass an admin review, with their outlets verified, before they are published. Nothing imported goes live automatically.
- Lobbie AI chatbot: may only recommend deals that exist in our catalogue, stays on the topic of food deals, never asks for personal information, and cannot take actions such as voting or submitting for the user.
- Privacy and safety: decided which data each role may see. For example, nearby diners are shown anonymously, with no name or account details, and only admins can review reported content.
- Merchant deals: A deal is live, scheduled or ended depending on its date. A live deal is ended early, not deleted so it stays within the merchant’s history. Scheduled and ended deals can be deleted. An ended deal can be used as a template only at the outlets the merchant runs.
- Merchant flash deals: each flash deal runs at a single outlet, and two flash deals at the same outlet cannot overlap in time. Nothing is announced to customers until the merchant confirms it. It can start right away or at a scheduled time up to a week ahead, but never in the past. When a merchant ends one early, customers who already claimed a code can still use it.
- Merchants do not use the customers “Add-a-deal” Flow. They’re sent to their own dashboard instead to add a deal in their own “add-a-deal” form.

#### Technical decisions
- Chose the external APIs (OneMap, UploadThing, Resend, WordPress REST, Pusher, Gemini/Groq, Google Maps) and decided how they fit together.
- Chose MongoDB as the data store, deploying on Vercel, and using Pusher for live updates with polling as the fallback.

#### Review, testing and evaluation
- Reviewed every AI plan before implementation and challenged it on edge cases.
- Ran the daily walkthroughs and usability reviews described above, and decided what to fix.
- Worked through a pull-request process (91 merged PRs). Each PR used our template, which includes a check on mobile and keyboard use and a check for authorization edge cases. Team members reviewed and merged each other's work and resolved conflicts between features.
- Checked responsive layouts at phone, tablet and desktop widths in Chrome DevTools
- Decided which user journeys the end-to-end tests had to cover, and checked that the tests matched how the app should behave. When the suite grew too large, we trimmed it back to the core features.
- Assessed the limitations of our own app, such as the flash-deal radius not being enforced on claims, and decided which to fix and which to accept for this prototype.

#### We used Claude Code and GitHub Copilot to:
- Plan features: turn our specs into implementation plans, suggest libraries (for example Leaflet for the map and Pusher for live updates) and check feasibility on Vercel.
- Write the implementation: write the application code for our features from the specs and plans we agreed on, covering the Vue components and the Express API endpoints. We then manually reviewed, tested and revised it in multiple iterations.
- Design data and APIs: propose database models and API routes for the rules we defined, which we reviewed and adjusted accordingly.
- Write tests: generate the unit, integration and end-to-end tests for the user journeys we specified, and explain what they check.
- Debug: explain errors and suggest fixes for bugs we found during our daily walkthroughs.
- Set up tooling: the monorepo, build scripts, CI, lint and TypeScript configuration.
- Refine written content: tidy imported deal text and improve UI wording.
- Generate mascot (Lobbie the Lobster) sprites
- Generate cartoon Singapore map, food pictures and sign-in background image
- Generate landing page 3d graphics as well as 3d food icons
- Create new font pack “Lobang Pop”

### 5.2. AI-processed content
- Deal text: imported deal titles, descriptions and terms were rewritten into a shorter, consistent format with an AI assistant and checked by Allison before being applied (`apps/api/src/tools/rewrite-deal-copy.ts`).

### 5.3. AI inside the app
The Lobbie AI Chatbot calls the Google Gemini API, with Groq as a fallback, to suggest deals from our catalogue in reply to a user's question. This is an external API used as a product feature.
