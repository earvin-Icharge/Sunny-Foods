# 02 — Build status

Last updated: 2026-11-25 · build v0.1.0 · branch `build/v1`

## Summary
| Item | Status |
|---|---|
| Phases 1–17 (all app features) | **Built**. Code checks pass, full production build passes (112 routes). |
| Phase 18 (store app) | **Scaffold only** in `/mobile` — needs Apple/Google accounts (D6) and Firebase for phone push. |
| Database logic | Checked on a local test database (`supabase/tests/smoke.sql`). |
| Supabase project "Sunny Foods" (Singapore) | All 15 database files loaded; security check clean; Supabase Cron jobs running. |
| Vercel project `sunny-foods` | Created, linked to GitHub, settings added. Needs `SUPABASE_SECRET_KEY` + `DATABASE_URL` from Earvin. |
| Screens in a browser / real logins | **Not tested yet** — next step. |
| Languages | English, 简体中文, 繁體中文, Tagalog — all screens. |

## Screens
| Area | Address | Screens |
|---|---|---|
| Staff | `app.sunnyfoods.com.ph` (`/staff`) | 53: home, orders, packing, deliveries, payments, customers, products, stock, prices, vouchers, agents & commissions, payouts, reports, Trash, delete requests, settings, users, Master Control, data requests, what's new |
| Customers | `order.sunnyfoods.com.ph` (`/portal`) | 14: sign-up, browse, shop, cart, checkout, my orders, receipt, my account, privacy |
| Agents | `agent.sunnyfoods.com.ph` (`/agent`) | 16: home tracker, my customers, orders, order for a customer, commissions, payouts, invite + QR, account |

## How the app is put together (plain words)
- **One app, three doors**: each subdomain only opens its own screens (the owner's "View as" preview is the only exception, read-only).
- **Database** (`supabase/migrations/`, run in number order): tables, security rules and every money calculation (prices, VAT, vouchers, commissions). Screens only show results.
- **Private data**: tables sit in a private database area (`app`) that the internet cannot reach. Only the app server reads it, as the logged-in person, so each person sees only what they are allowed to.
- **Screen text**: `messages/<language>/<section>.json`.

## Known gaps (to do before go-live)
| # | Gap | Owner | When |
|---|---|---|---|
| G1 | Test every screen with real logins (acceptance checks, spec 13) | Claude | Next |
| G2 | D4 VAT answers (prices VAT-inclusive? discount before VAT?) — switches ready in Settings | Earvin + accountant | Before go-live |
| G3 | Real logo, product prices, pack sizes, Yakiniku names | Boss | Before go-live |
| G4 | Email sender (custom SMTP) + DNS for `app.` / `order.` / `agent.` (D3) | Earvin, then Claude | Phase 10 / 17 |
| G5 | Store app: accounts (D6), Firebase for phone push, base-path for links | Earvin, then Claude | Phase 18 |
| G6 | Privacy policy & terms reviewed by a lawyer; record-keeping period from accountant | Earvin | Before go-live |
| G7 | Supabase Pro + Vercel Pro, spend alerts, Point-in-Time Recovery | Earvin | Go-live |

## Checking the database on this computer
```bash
./supabase/tests/load.sh
```
Loads every migration into a local test database and stops at the first error.

## Test logins
See `docs/SETUP.md` → "Create one test account per role".
