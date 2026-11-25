# Setup notes (plain steps)

## Test accounts — one per role (Phase 1)

What it does: makes 9 test logins (Owner, Admin, Office, Warehouse, Driver, Customer, Employee buyer, Agent, Broker),
a demo customer company "Test Cafe (demo)", a demo employee account (₱5,000 monthly limit) and links the test agent to the demo customer.

Steps (Claude normally runs this for you):
1. Make sure the file `.env.local` has the Supabase address, the **secret** key and the database address (see `.env.example`).
2. Run:
   ```bash
   node --env-file=.env.local scripts/seed-test-accounts.mjs
   ```
3. A table prints each role's email (`test+<role>@sunnyfoods.com.ph`) and password. Copy it somewhere safe.

Good to know:
- Running it again does not make duplicates; it just gives every test login a **new** password (printed again).
- Before go-live, deactivate these logins in **Settings → Users** (or remove them).
- The emails do not need to exist: they are confirmed automatically, so you can log in right away.
