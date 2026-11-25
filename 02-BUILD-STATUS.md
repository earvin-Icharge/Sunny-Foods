# 02 — Build status

Last updated: 2026-11-25 (build v0.1.0, branch `build/v1`)

## Status per phase
| # | Phase | Status |
|---|---|---|
| 1 | Setup: Next.js 16, Supabase keys, PWA, 4 languages, brand, login | Built |
| 2 | Master Control engine + safety base (permissions, RLS, audit, no hard delete) | Built + checked on local database |
| 3–18 | All feature phases | See "Screens" below (being finished) |

## How the app is put together (plain words)
- **One app, three doors**: `app.` (staff), `order.` (customers), `agent.` (agents). Each door only opens its own screens.
- **Database** (`supabase/migrations/`, run in number order): all tables, security rules and every money calculation (prices, VAT, vouchers, commissions). The screens only show results; they never calculate money.
- **Private data**: tables sit in a private area of the database (`app`) that the internet cannot reach directly. Only the app server reads it, as the logged-in person, so each person sees only what they are allowed to.
- **Screen text**: `messages/<language>/<section>.json`.

## What Earvin needs to provide (one step at a time, when asked)
| Item | Needed for | Owner |
|---|---|---|
| OK to create a Supabase project "sunny-foods" (Free, Singapore) | Testing | Earvin |
| Real logo file (`public/logo.png`) | Look | Boss |
| Product prices, pack sizes, Yakiniku product names | Seed data | Boss |
| D4 VAT answers (prices VAT-inclusive? discount before VAT?) | Phase 5 numbers | Earvin + accountant |
| DNS records for `app.`, `order.`, `agent.` + email sender | Go-live (D3) | Earvin |
| Apple / Google developer accounts | Store app (D6) | Earvin |

## Checking the database on this computer
```bash
./supabase/tests/load.sh
```
Loads every migration into a local test database and stops at the first error.
