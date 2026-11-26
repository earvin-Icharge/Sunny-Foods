# 02 — Build status

Last updated: 2026-11-26 · build v0.2.0 · branch `build/v1`

## Summary
| Item | Status |
|---|---|
| Phases 1–17 (all app features) | **Built**. Code checks pass, full production build passes (112 routes). |
| Android APKs (D7) | Built by GitHub: Staff, Order, Agent — https://github.com/earvin-Icharge/Sunny-Foods/releases/tag/android-latest . They open app./order./agent.sunnyfoods.com.ph, so they work once those addresses are connected (DNS). |
| Phase 18 (store app) | **Scaffold only** in `/mobile` — needs Apple/Google accounts (D6) and Firebase for phone push. |
| Database logic | Checked on a local test database (`supabase/tests/smoke.sql`). |
| Supabase project "Sunny Foods" (Singapore) | All 15 database files loaded; security check clean; Supabase Cron jobs running. |
| Vercel project `sunny-foods` | Live test address `sunny-foods-git-build-v1-icharge1.vercel.app` (Vercel login protected). Database + secret key connected. |
| Screens in a browser / real logins | Owner login checked in a real browser. Full acceptance checks (spec 13) next. |
| Test logins | 12 accounts `test+<role>@sunnyfoods.com.ph` (incl. `test+boss` — Owner login for the boss to look around, and `test+signup-staff` / `test+signup-agent`, used to test approvals). Delete before go-live. |
| Sample data | **Loaded 2026-11-26** for the boss to look around: example prices (all 12 products), SAMPLE stock batches, 5 "SAMPLE ·" customers, 2 SAMPLE vouchers, 10 SAMPLE orders in every stage. A yellow "SAMPLE DATA" strip shows on every screen while it is loaded. Script: `supabase/sample/sample_data.sql`. Remove before go-live (G10). |
| Languages | English, 简体中文, 繁體中文, Tagalog — all screens. |
| Sign-up & login (D1, changed 2026-11-26) | **Built**. Customers: Google, Facebook, mobile (SMS code), email (code), or old password login; business details once (`/portal/welcome`). Staff/agents: sign up with email + 6-digit code, locked until approved on **Sign-up requests** (`/staff/signup-requests`). Browser-tested on the test address (17/17): pending people blocked, boss approves, they log in. Google / Facebook / SMS / email codes need setup first — see G8. |

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
| G8 | Login setup: email sender (Resend + DNS records from the builder), email templates with the 6-digit code, Google login key, Facebook app, SMS (Semaphore account + key in Vercel, Supabase SMS hook), Supabase redirect URLs. Google/Facebook inside the APKs need the new APK build. | Earvin (accounts), Claude (steps + checks) | Before go-live |
| G9 | Two older screens save in two steps and will fail like L-010: Agents → new agent **with** login; Customers → create employee buyer. Fix = one database step. | Claude (after Earvin OKs) | Next |
| G10 | Remove sample data and test logins; enter real prices (G3) | Claude, with Earvin's OK | Before go-live |
| G7 | Supabase Pro + Vercel Pro, spend alerts, Point-in-Time Recovery. On Vercel Pro, add back the 5-minute push job in `vercel.json` (`/api/cron/push`, `*/5 * * * *`) so scheduled alerts reach phones quickly | Earvin, then Claude | Go-live |

## Checking the database on this computer
```bash
./supabase/tests/load.sh
```
Loads every migration into a local test database and stops at the first error.

## Test logins
See `docs/SETUP.md` → "Create one test account per role".
