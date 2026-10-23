# noble-backend

PocketBase for Nobles Groceries, deployed on Railway from this repo (see `Dockerfile`).

- `pb_migrations/1760000000_noble_init.js`: users fields, plans, subscriptions, payments, payouts.
- `pb_migrations/1760000001_plans_months.js`: adds `months` to plans (runs once on the next deploy; existing data is kept).
- `pb_migrations/1760000003_fees_registration.js`: adds `shirt_paid`, `shirt_paid_at`, `terms_accepted`, `terms_accepted_at` to users, the `foodie` plan category, and a `fees` collection. Subscriptions and payouts can now only be created by the server. **Existing members start as unregistered** (`shirt_paid` is false) until they pay the t-shirt fee or an admin marks them registered (Admin > Users).
- `pb_hooks/fees.js`: the fee rules (t-shirt 5000 once, joining 3000 per plan joined, payout clearance 3000 per request). `FEES` must stay in sync with `FEES` in the frontend `app.js`.
- `pb_hooks/`: server-side payment and payout rules. Payouts open only after a plan's saving period ends. `rules.js` must stay in sync with `RULES` in the frontend `app.js`.

Mount a Railway Volume at `/pb/pb_data` so the database survives redeploys.

## Flutterwave payments (automatic confirmation)

Members pay on Flutterwave's hosted checkout; the server confirms the payment itself, no admin click needed.

1. **Railway > Variables**, add:
   - `FLW_SECRET_KEY`: Flutterwave dashboard > Settings > API keys (use the *test* key first)
   - `FLW_WEBHOOK_HASH`: any long random string you invent (this is your "secret hash")
   - `FRONTEND_URL`: where the site is hosted, e.g. `https://yoursite.com` (no trailing slash)
2. **Flutterwave dashboard > Settings > Webhooks**: set the URL to `https://<your-railway-domain>/api/noble/flw-webhook` and the **Secret hash** to the same value as `FLW_WEBHOOK_HASH`. Turn on "Receive webhook for successful charges".
3. Redeploy. The migration `1760000002_flutterwave.js` runs once (adds `tx_ref` / `flw_id` to payments and closes the old "members create payments" API route).

How it works: `pay/init` validates the amount with the plan rules and creates a *pending* payment + checkout link > member pays > Flutterwave calls the webhook (and the browser returns to `dashboard.html`) > the server asks Flutterwave to verify the transaction (status, amount, currency, reference) > only then the payment becomes *confirmed*. A 5-minute job re-checks missed webhooks and rejects checkouts abandoned for 30+ minutes. A payment whose paid amount does not match is left *pending* with a `REVIEW:` note, and only those show Confirm/Reject buttons to admins.

### Fees (t-shirt, joining, clearance)

All three fees use the same Flutterwave setup as above (`POST /api/noble/fee/init`, same webhook). The server decides the amount, and when Flutterwave confirms the payment it does the follow-up itself:

- **T-shirt (5000)**: sets `shirt_paid` on the member. Until then the server refuses joining fees, contribution payments and payout requests.
- **Joining fee (3000)**: creates the subscription for the chosen plan.
- **Clearance fee (3000)**: creates the payout request, with the details the member typed.

If the follow-up cannot be done (for example the plan was hidden in the meantime), the fee stays confirmed with a `REVIEW:` note, visible to admins under Admin > Fees.
