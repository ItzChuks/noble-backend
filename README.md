# noble-backend

PocketBase for Noble's Groceries, deployed on Railway from this repo (see `Dockerfile`).

- `pb_migrations/1760000000_noble_init.js`: users fields, plans, subscriptions, payments, payouts.
- `pb_migrations/1760000001_plans_months.js`: adds `months` to plans (runs once on the next deploy; existing data is kept).
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
