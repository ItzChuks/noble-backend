# noble-backend

PocketBase for Nobles Groceries, deployed on Railway from this repo (see `Dockerfile`).

- `pb_migrations/1760000000_noble_init.js`: users fields, plans, subscriptions, payments, payouts.
- `pb_migrations/1760000001_plans_months.js`: adds `months` to plans (runs once on the next deploy; existing data is kept).
- `pb_migrations/1760000003_fees_registration.js`: adds `shirt_paid`, `shirt_paid_at`, `terms_accepted`, `terms_accepted_at` to users, the `foodie` plan category, and a `fees` collection. Subscriptions and payouts can now only be created by the server. **Existing members start as unregistered** (`shirt_paid` is false) until they pay the t-shirt fee or an admin marks them registered (Admin > Users).
- `pb_hooks/fees.js`: the fee rules (t-shirt 5000 once, needed only for payouts; joining 3000 per plan joined; payout clearance 3000 per request), all paid from the wallet and the payout checks (including: another plan must be actively running). `FEES` must stay in sync with `FEES` in the frontend `app.js`.
- `pb_hooks/`: server-side payment and payout rules. Payouts open only after a plan's saving period ends. `rules.js` must stay in sync with `RULES` in the frontend `app.js`.

Mount a Railway Volume at `/pb/pb_data` so the database survives redeploys.

## Wallet, virtual accounts and automatic payments

Members no longer pay each contribution by hand. Each member has a **wallet** and a **fixed virtual account number**; money transferred to that account lands in the wallet in real time, and plans take their contributions from the wallet automatically.

- `pb_migrations/1760000004_wallet.js`: `users.wallet_balance`, `users.va_number / va_bank / va_ref` (nobody can write them through the API, not even admins), the `wallet_txs` ledger (members can read their own; only the server writes), and flags old checkout payments still pending as `REVIEW:` so an admin can settle them by hand.
- `pb_hooks/wallet.js`: the ledger (`post`), idempotent top-ups (`credit`), the collector (`collect`) and joining a plan (`joinPlan`). Everything runs inside a transaction, so a balance and its ledger can never disagree.
- `pb_hooks/wallet.pb.js`: routes `POST /api/noble/wallet/account` (create the member's account number), `POST /api/noble/flw-webhook` (transfer received), `POST /api/noble/wallet/credit` (admin fallback), `POST /api/noble/fee/pay` (joining / t-shirt / clearance, from the wallet) and a 5-minute cron `noble_wallet_collect`.
- `pb_hooks/flutterwave.js`: Flutterwave v3 helpers, used only for virtual accounts and for verifying transfers. The old hosted-checkout hooks (`payments.js`, `flutterwave.pb.js`) were removed.

### Setup (Railway > Variables)

- `FLW_SECRET_KEY`: Flutterwave dashboard > Settings > API keys (test key first)
- `FLW_WEBHOOK_HASH`: any long random string; the same value goes in Flutterwave > Settings > Webhooks as the **Secret hash**
- Webhook URL: `https://<your-railway-domain>/api/noble/flw-webhook`, with "Receive webhook for successful charges" on.
- `FRONTEND_URL` is no longer used.

### How the wallet works

1. **Account number.** On the Wallet page a member enters their BVN or NIN once (Flutterwave requires it for a permanent NGN account). It is passed straight to Flutterwave and is **never stored**. The account is created with `tx_ref = NOBLE-VA-<userId>`, and Flutterwave returns that reference on every transfer into it.
2. **Top-up.** Flutterwave calls the webhook; the server checks the signature, then asks Flutterwave to verify the transaction by id (status, currency, reference) and credits the verified amount **exactly once** (unique ledger reference `FLW-<id>`). It then immediately runs the collector for that member, so plans that were waiting are paid at once.
3. **Collection.** An instalment becomes collectable at the start of its period (daily: midnight, weekly: Monday, monthly: the 1st; never before the season starts) and is late after its deadline (late = double, as before). Instalments are served oldest deadline first across all of a member's plans; a plan the wallet cannot cover waits for the next top-up while the others carry on. Example: three daily plans of 2,000 and 5,000 in the wallet: two are collected, the third waits.
4. **Joining.** `fee/pay` with `type: join` takes the 3,000 fee plus, for Cash/Foodie plans joined mid-season, the catch-up for every instalment already due since 1 January (no penalty), all or nothing. If the wallet is short nothing is created and the error says how much to top up.
5. **Seasons.** Cash and Foodie plans run on a fixed season, 1 January to 30 November (`rules.js`: `seasonFirst`, `seasonCount`, `seasonYear`; daily 334, weekly 48 in 2026, monthly 11 instalments). After the last deadline of a season, new members join next year's season. Grocery plans still run from the day of joining, for the plan's `duration`.
6. **Other fees.** T-shirt (5,000, once, needed only for payouts) and clearance (3,000 per payout request) are also taken from the wallet.

If a transfer arrives but the webhook never does, an admin can credit it under Admin > Users > (member) > Credit wallet, using the bank reference (the same reference can only be credited once).

`rules.js` (here) and `app.js` (frontend) hold the same rules and must be kept in sync, as must `FEES` in `fees.js`/`wallet.js` and `app.js`.
