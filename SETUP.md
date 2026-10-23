# Nobles Groceries – PocketBase setup

Tested with PocketBase **v0.40.5** and the JS SDK **0.26.8** (loaded from a CDN in each page).
Needs PocketBase v0.23 or newer.

## 1. Start PocketBase

1. Download PocketBase and unzip it.
2. Copy the two folders from this project's `pocketbase/` folder (`pb_migrations` and `pb_hooks`) next to the `pocketbase` executable.
3. Run `./pocketbase serve`. On first start the migration creates everything for you:
   - extra fields on **users**: `country`, `phone`, `role` (user / admin)
   - collections **plans**, **subscriptions**, **payments**, **payouts**, with all access rules
4. Open http://127.0.0.1:8090/_/ and create the superuser.

(Alternative: leave the folders where they are and run
`./pocketbase serve --hooksDir=/path/to/pocketbase/pb_hooks --migrationsDir=/path/to/pocketbase/pb_migrations`.)

## 2. Point the site at it

- `app.js`, top: set `PB_URL` to your PocketBase address (use `https://` once deployed). `USE_MOCK` is `false`; set it to `true` only for the offline demo.
- Serve this folder (`npx serve .`, VS Code Live Server, any static host) and open `auth.html`.

## 3. Make your first admin

Sign up on `auth.html`, then in the PocketBase panel open **users**, edit your user and set `role` to `admin`. After that you can promote others from Admin > Users. Log in again and you land on the admin page.

Then open Admin > Plans and click **Add default plans**.

## What the server enforces (`pb_hooks/noble.pb.js`)

Browser code can be edited by anyone, so the rules that matter are checked on the server:

- **New accounts** are always `role = user`, even if the request says otherwise.
- **Joining a plan**: the plan must be active; the subscription always starts as `active`.
- **Payments**: the server recomputes the penalty, instalments covered and late count from its own clock and the member's history. A wrong amount (missing penalty, not a whole number of instalments, plan already fully paid) is rejected, and any `penalty` / `installments` / `late_count` / `status` sent by the browser is overwritten.
- **Payouts**: only for a fully saved and admin-confirmed plan, **and only after its saving period has ended** (the deadline of the last instalment). One open request per plan, and never again once a payout has been made.
- Only admins can confirm or reject payments and payouts, edit plans, or change roles (collection rules).

**Keep two files in sync:** the payment rules exist in `app.js` (`RULES`, for display) and in `pocketbase/pb_hooks/rules.js` (enforcement). If you change the noon cut-off, multiplier, weekly day or monthly grace day, change both.

## Notes

- All deadlines use Lagos time (UTC+1), whatever the device clock says. Daily: before 12:00 noon; weekly: Friday 12:00 noon; monthly: end of the 2nd of the next month. Late instalments cost double and penalties never count towards savings or payout.
- Users' emails are visible to admins because sign-up sets `emailVisibility`.
- In production, run PocketBase behind HTTPS and, in Settings > Application, restrict allowed origins if you want only your site to call it.
- The `created` timestamp of a subscription is the "joined" time the first deadline is based on, so don't edit it.

## Added in this version

- **Saving period in months**: Admin > Plans > Add plan has a *Saving period (months)* field (1, 2, 3 or any number). The number of payments is worked out from the frequency (daily about 30.4 per month, weekly about 4.35, monthly 1) and shown live in the form. Needs the migration `1760000001_plans_months.js` in the backend.
- **Payout waiting period**: members can request a payout only after the saving period ends; the button shows the date it opens.
- **Customer support**: a WhatsApp button (floating, plus a sidebar link) on the member dashboard and the landing page. Change the number once in `app.js` (`SUPPORT_PHONE`); the landing page link in `index.html` uses the same number.
- **Transaction history**: members see it under *Transaction history*; admins see a member's full history by selecting the member in Admin > Users, and all payments under Admin > Payments. Filter by date (presets or From/To), status, type and search. Download a PDF invoice or payout receipt per transaction, or a PDF statement of the filtered list. PDFs are built in the browser with jsPDF (loaded from cdnjs when needed) using `pdf.js`.

## Real time, notifications and bulk delete

- **Real time**: the member and admin pages subscribe to PocketBase's live updates (plans, contributions, payments, payouts, and users for admins). When something changes the page refreshes itself, except while someone is typing or has a pop-up open. It also catches up when the tab becomes active again and re-checks every 90 seconds as a safety net. Members only receive events for their own records (enforced by PocketBase's rules).
- **Red counters**: in the admin sidebar, a red number appears beside *Payments* (pending payments) and *Payouts* (pending payout requests). A red dot shows on the phone menu button and the count appears in the browser tab title.
- **Pop-ups instead of browser alerts**: deleting uses an in-page confirmation popup (`confirmBox()` in `app.js`, reusable for anything else).
- **Delete several plans**: Admin > Plans has a checkbox on every plan and a *Select all* box (it selects the plans currently shown by the search/filters). A bar appears at the bottom with *Delete selected*. A plan that members have joined cannot be deleted (PocketBase protects it); it is skipped and reported, so hide it instead.
- **Demo mode** (`USE_MOCK = true`) emulates real time too, for actions in the same tab.

## Flutterwave payments

"Make payment" now opens Flutterwave's secure checkout and the payment is confirmed automatically (no admin step). No keys live in the website: they are set on the backend (see the backend README, section "Flutterwave payments"). In demo mode (`USE_MOCK = true`) payments are confirmed instantly. Admins no longer confirm Flutterwave payments; Confirm/Reject only appears on a payment flagged `REVIEW` (amount mismatch).

## Fees, registration and terms

- **T-shirt registration (₦5,000, one time, compulsory)**: until it is paid a member only sees a "Complete your registration" page. Admin > Users shows *Registered* and *Unregistered* members (with filter tabs) and can mark someone registered or unregistered by hand (for example after an offline payment).
- **Joining fee (₦3,000)**: paid each time a member joins a plan; the plan is joined automatically once Flutterwave confirms it.
- **Payout clearance fee (₦3,000)**: paid with every payout request; the request is sent automatically once confirmed.
- All fees appear under Admin > Fees and, for members, under *Fees paid*. Amounts: `FEES` at the top of `app.js` (display) and `pb_hooks/fees.js` on the backend (charged). Keep both in sync.
- **Terms and Conditions**: `terms.html` (text lives in `termsHTML()` in `app.js`). Sign-up requires ticking the acceptance box; the server rejects sign-ups without it and stores `terms_accepted_at`.
- **Foodie** is a third plan category next to cash and grocery (Admin > Plans > Add plan).
- **Number of payments**: Admin > Plans > Add/Edit plan has a *Number of weeks* (days / months) field. It follows the saving period until you pick or type your own, for example 12 or 13 weeks, or 50 or 52 weeks. Members pay for exactly that number.
