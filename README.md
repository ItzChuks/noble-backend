# noble-backend

PocketBase for Noble's Groceries, deployed on Railway from this repo (see `Dockerfile`).

- `pb_migrations/1760000000_noble_init.js`: users fields, plans, subscriptions, payments, payouts.
- `pb_migrations/1760000001_plans_months.js`: adds `months` to plans (runs once on the next deploy; existing data is kept).
- `pb_hooks/`: server-side payment and payout rules. Payouts open only after a plan's saving period ends. `rules.js` must stay in sync with `RULES` in the frontend `app.js`.

Mount a Railway Volume at `/pb/pb_data` so the database survives redeploys.
