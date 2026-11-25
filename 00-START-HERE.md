# 00 — START HERE (Sunny Foods app)

Read this first in every session, then `01-SPEC.md`.

## What this is
- Order, inventory, packing, delivery, voucher and agent-commission app for Sunny Foods Inc. (Carmona, Cavite).
- One codebase, three areas: Staff (`app.`), Customer portal (`order.`), Agent portal (`agent.`) on `sunnyfoods.com.ph`.
- Owner contact for decisions: Earvin (no coding background — Claude does the technical work end to end).

## Files
| File | Purpose |
|---|---|
| `01-SPEC.md` | Living app spec. Edit in place, never rewrite from scratch. |
| `02-BUILD-STATUS.md` | What is built, what is left, how to run it. |
| `supabase/migrations/` | Database (tables, security rules, money logic). Run in order. |
| `src/` | Next.js 16 app code. |
| `messages/` | Screen text in 4 languages. |

## Rules
- Say "Kiosk", never "station".
- Money (prices, VAT, vouchers, commissions) is calculated in the database only.
- Nothing is hard-deleted (Trash + audit log), except personal-data deletion (spec 8.13).
- Supabase keys: publishable + secret only (never `anon` / `service_role`).
- Region: Singapore (Supabase `ap-southeast-1`, Vercel `sin1`).
