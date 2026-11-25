# SPEC.md — Sunny Foods Order & Inventory App

**Version 2.1 — 2026-11-25.** Changes since v2: data-deletion rule (8.13), email-only login lines, Node.js 24, backup not emailed, 6 new tables, deletion acceptance check.

**Version 2 — 2026-11-25.** Changes since v1: Next.js 16 (`proxy.ts`), new Supabase API keys, custom email sender, scheduled jobs, safety base moved to Phase 2, BIR receipt wording, Data Privacy Act items, store-app build approach, open decisions (Section 14).

## 1. Goal
A simple web app (works on computer + phone) that replaces manual order and stock tracking at Sunny Foods Inc. (meat processing & packaging, Carmona, Cavite).
- The boss stops relying on memory: everything is on one screen.
- Workers stop making mistakes: the app tells them exactly what to pick, how to pack, and blocks wrong steps.
- Customers order directly, so orders are no longer taken by phone/chat and re-typed.
- Discounts, employee rates, vouchers and agent commissions are calculated automatically and fully tracked.
- The public website (sunnyfoods.com.ph) is NOT changed. We only copy its look.

## 1a. Three access areas (one codebase, one database)
| | **Internal app** (staff) | **Customer portal** (external) | **Agent portal** (external) |
|---|---|---|---|
| Address | `app.sunnyfoods.com.ph` | `order.sunnyfoods.com.ph` | `agent.sunnyfoods.com.ph` |
| Who | Boss, office staff, warehouse, drivers | Business customers + employees buying for themselves | Brokers and sales agents |
| Purpose | Inventory, packing, deliveries, payments, vouchers, commissions, reports | Place orders, use vouchers, track orders, see balance | Track own customers, sales and commissions; order for own customers |
| Login | Staff accounts made by boss | Sign up → boss/staff approves | Boss creates agent account |
- All are PWAs (own home-screen icon and name: "Sunny Foods Staff", "Sunny Foods Order", "Sunny Foods Agent").
- Customers and agents can NEVER open internal pages. Each user sees only their own area.
- Route groups: `app/(internal)/...`, `app/(portal)/...`, `app/(agent)/...`; `proxy.ts` (Next.js 16 name for middleware) routes by subdomain and checks role.
- Local testing addresses: `app.localhost:3000`, `order.localhost:3000`, `agent.localhost:3000`.

## 2. Tech stack
- Next.js 16 (App Router) + TypeScript + Tailwind CSS; Node.js 24 LTS on the computer
- Supabase: Postgres database, Auth, Storage (photos), Row Level Security, Realtime (new-order alerts), Cron (scheduled jobs)
- **Supabase API keys**: use the new **publishable key** (`sb_publishable_…`, browser/app) and **secret key** (`sb_secret_…`, server only, never in browser code). The old `anon` / `service_role` keys are being retired by Supabase — do not use them.
- **Email sender**: Supabase's built-in email is test-only (about 2 emails per hour). Connect a custom SMTP sender (e.g., Brevo or Resend free tier) from a `no-reply@sunnyfoods.com.ph` address before any customer signs up.
- **Scheduled jobs** (Supabase Cron): mark payments Overdue, batch-expiry and low-stock alerts, voucher expiry/run-out alerts, agent portal lock 60 days after resignation, weekly Excel backup.
- PWA: installable icon on phone/desktop, offline-safe read of today's orders
- Hosting: Vercel (auto-deploys on every push to `main` = instant OTA update)
- **Server location (closest to Metro Manila)**: Supabase project region = **Southeast Asia (Singapore, `ap-southeast-1`)**; Vercel Functions region = **`sin1` (Singapore)** set in `vercel.json` → `"regions": ["sin1"]`. App server and database must be in the same region.
- Plans: Supabase **Free while building** (decision D2; a Free project pauses after about a week without use — un-pause it in the dashboard), upgrade to **Pro** before go-live (no auto-pause, daily backups) + Vercel **Pro** (commercial use allowed).
- Sizing for ~100K users: Supabase compute **Small** while testing → **Medium** at go-live → **Large** if it gets slow at peak; turn on **Point-in-Time Recovery (7 days)** at go-live. Use the connection pooler, Next.js image optimization and CDN caching for product photos to keep bandwidth low. Set spend alerts on both.
- i18n: `next-intl` with 4 languages
- Keep dependencies minimal. Paid services limited to: Supabase Pro, Vercel Pro, Apple Developer + Google Play accounts (Phase 18), and an SMS provider only if phone login is chosen (Section 14).

## 3. Users & roles (default settings — all editable in Master Control, 3a)
| Role | Can do |
|---|---|
| Boss (owner) | Everything. Approves deletes. Sees reports, prices, costs. Restores from Trash. Only role that opens Master Control. |
| Admin (optional) | Trusted manager the owner appoints. Same as owner except: cannot change owner accounts or give themselves more access. |
| Office/sales staff | Create/edit orders, customers, payments. Edit products (no delete). |
| Warehouse/packing worker | See orders to pack, follow packing checklist, adjust stock (with reason). No prices shown. |
| Delivery driver | See own deliveries, mark delivered, upload proof photo, record cash/COD collected. |
| Customer (portal only) | Order, see own orders, own prices, own balance. Nothing else. |
| Employee buyer (portal only) | Same as customer, but gets employee rates; linked to their staff profile. |
| Agent / broker (agent portal only) | See own linked customers, their orders, own commissions and payouts. Place orders for own customers. No costs, no stock numbers, no other agents. |
- By default only the boss can set prices, employee rates, voucher rules, commission rates, and approve commission payouts.
- Staff login: email + password (v1). Boss creates accounts.
- Customer login: email + password (v1); one company can have several users (e.g., owner + purchaser).
- **v1 login = email + password for everyone** (decision D1). Phone-number login needs a paid SMS provider; it can be switched on later without changing other screens.
- Each user picks a language; it is saved to their profile.

## 3a. Master Control (access control for the whole company)
One screen in the internal app (`Settings → Master Control`) where the owner decides who sees and does what. The table in Section 3 is only the starting setup — the app works on day 1 without configuration.

**Roles**
- Built-in roles: Owner, Admin, Office, Warehouse, Driver, Customer, Employee buyer, Agent, Broker.
- Owner can create custom roles by copying one (e.g., "Senior Agent", "Supervisor", "Cashier") and rename/deactivate them.

**Permission matrix** (rows = permissions, columns = roles, simple toggles)
- Grouped by module: Dashboard, Orders, Customers, Products, Inventory, Packing, Deliveries, Payments, Vouchers, Agents & Commissions, Reports, Trash, Settings.
- Per module, choose a level: **None / View / Create / Edit / Request delete / Approve**.
- Data scope per module: **Own only / Own team / All** (e.g., agent = own customers; supervisor = own team; office = all).
- Sensitive-field switches (on/off per role): selling price, cost & margin, exact stock quantity (off = Available/Limited/Out badge), customer phone/email/address, customer unpaid balance, payment details & proofs, sales totals & reports, other agents' names and sales, commission rates & rules.

**Agent & broker visibility panel** (easy checklist, separate settings for Agents, Brokers and any custom agent role)
| Setting | Choices |
|---|---|
| Products they can see | All / Selected categories only |
| Prices | Hidden / Regular price / Customer's own price |
| Stock | Hidden / Badge only / Exact quantity |
| Customer details | Name only / + contact person & phone / + address / + unpaid balance |
| Orders of their customers | Status only / Full items & amounts |
| Own commission | Amount only / + rate and rule breakdown |
| Leaderboard | Hidden / Own rank only / Full ranking with names |
| Actions allowed | Place orders for customers · Refer/create new customers · Apply vouchers · Download own reports (each on/off) |

**Per-person override**
- On any user's profile the owner can switch individual permissions on/off for that person only (e.g., one top agent can see exact stock). Overrides are highlighted; "Reset to role default" button.

**Approval rules** (owner decides what needs approval and by whom)
- Delete requests, manual discounts above X%, price changes, stock adjustments above X units, giving credit terms, commission payouts, new customer/agent accounts.

**Preview as**
- "View as…" any role or person: opens their screens read-only so the owner checks exactly what they see before saving.

**Safety rules for Master Control**
- Only Owner (and Admin, if granted) can open it. Admin can never edit Owner accounts or raise their own access.
- There must always be at least 1 active Owner — the app refuses to remove the last one (no lock-out).
- Every change is audit-logged (who, when, before → after) and can be rolled back from the history list.
- Changes take effect immediately; a user who loses access to an area is signed out of it.
- **Enforced on the server and database, not just by hiding buttons**: RLS policies and API checks read the same permission tables, and hidden fields are never sent to the phone at all.

## 4. Languages
English, 简体中文, 繁體中文, Tagalog. One-tap switcher in the header.
- All UI text in `/messages/{en,zh-Hans,zh-Hant,tl}.json`.
- Product names and packaging notes have fields for each language (fallback to English if empty).

## 5. Design (copy from sunnyfoods.com.ph)
- Colors: Sunny Red `#B81C21` (primary buttons), Cream `#F5EDE4` / `#FAF6F1` (backgrounds), Dark Brown `#3B2F2F` (text), Charcoal `#262220` (header), Gold `#C8A175` (accents).
- Fonts: Lora (headings), Nunito Sans (body) via Google Fonts. Add Noto Sans SC/TC for Chinese.
- Logo: sun logo + "SUNNY FOODS INC." + "Delicious • Healthy • Affordable" → file goes in `/public/logo.png` (owner provides).
- Style: clean, rounded cards, lots of white space, big buttons (min 48px tall), big text (min 16px).
- Phone: bottom tab bar. Computer: left sidebar.
- Status colors: grey = new, blue = confirmed, orange = packing, green = ready/delivered, red = problem/unpaid.
- Every product shows a photo so workers recognize it without reading.

## 6. Starting product list (seed data, editable)
| Category | Products |
|---|---|
| Steak Series | Strip Loin Steak, Chuck Eye Steak, Rib Eye Steak, Top Blade Steak |
| Core Product | Wagyu-Style Cubes, Burger Patty, Beef BBQ Cuts, Black Pepper Steak |
| Sauces | Black Pepper Sauce, Mushroom Gravy, BBQ Seasoning |
| Yakiniku (VAT-exempt) | Yakiniku — exact product names to be confirmed by the boss |
- Prices, pack sizes and weights are NOT on the website → boss enters them in the app.

## 7. Features

> 7.1–7.9 and 7.11–7.13 = **Internal app**. 7.10 = **Customer portal**. 7.14 = **Agent portal**.

### 7.1 Dashboard (home)
- Today: orders to pack, orders to deliver, unpaid amount.
- Alerts: low stock (meat + packaging), batches expiring within 14 days, overdue payments.
- Boss sees today's sales total.

### 7.2 Products
- Fields: SKU, name (4 languages), category, photo, unit (pack/kg/box), pack weight, default price, cost (boss only), low-stock level, storage (frozen/chilled/room temp), **VAT type (VATable / VAT-exempt; default VATable)**, active yes/no.
- **Packaging recipe** (key feature): list of packaging materials + quantity per unit sold, plus a short packing instruction and reference photo.
  - Example: Rib Eye Steak 1 pack = 1 vacuum bag (medium) + 1 product label + 1 "Keep Frozen" sticker.
- Add / edit / archive. Delete follows Section 8 safety rules.

### 7.3 Inventory
- Two stock types: **Meat/Sauce products** and **Packaging materials** (bags, boxes, labels, stickers, ice packs).
- Stock in by **batch**: batch no., production date, expiry date, quantity, location (freezer 1/2, chiller, shelf).
- Picking always suggests the oldest-expiry batch first (FEFO).
- Every stock change is a movement record: Stock In, Order Out, Adjustment, Spoilage/Waste, Return. Adjustments require a reason.
- Packaging stock auto-deducts when an order is marked Packed (based on the recipe).
- Stock count screen: worker counts, app shows difference, boss approves.

### 7.4 Customers
- Name, business type (restaurant, cafe, retailer, distributor, private label), contact person, phone, address, map pin, default delivery method, default payment terms, notes.
- Price tier (see 7.11) + optional special price per product per customer.
- Assigned agent/broker (optional, one per customer) — used for commissions (7.13). Changing the agent is boss-only and logged; it applies to new orders only.

### 7.5 Orders
- Create order: pick customer → add products (photo grid + search) → quantity → app shows stock available and warns if not enough.
- **Order details shown clearly**: order no., customer, items, qty, price, total, delivery date & time window, delivery method, payment method, payment status, notes.
- **Delivery method**: Own truck, Third-party courier (Lalamove / Grab / Transportify), Customer pickup at Carmona plant.
- **Payment options**: Cash, Cash on Delivery, Bank transfer, GCash, Maya, Cheque, Credit terms (7 / 15 / 30 days).
- **Payment status**: Unpaid, Partial, Paid, Overdue (auto when terms pass). Record each payment with date, amount, method, proof photo.
- **Price breakdown on every order**: Subtotal → Employee/tier discount → Voucher discount (code shown) → Delivery fee → **Total**. Each discount line shows its name so the boss sees exactly why the price is lower.
- **VAT lines** (Sunny Foods is VAT-registered): VATable sales, VAT-exempt sales (e.g., Yakiniku), VAT 12%. VAT is calculated per item from its VAT type, on the server. Whether prices are VAT-inclusive and whether discounts come before VAT follow decision D4 (keep the VAT rate and rule in Settings so they can change).
- Order shows the linked agent (if any) and the commission it will earn (boss/office only).
- Order source tag: **Portal** (customer placed it), **Agent** (agent placed it for a customer) or **Staff** (encoded from call/chat). Portal orders arrive as "New" with a sound alert; staff must review and press Confirm (can edit qty/price/date first — customer is notified of changes).
- Status flow: New → Confirmed → Packing → Packed → Out for Delivery → Delivered → Completed. Cancelled at any step (reason required).
- Order printout: picking list (no prices) and delivery receipt (with prices) — print-friendly A4 + share as image/PDF.
- The delivery receipt is **not a BIR invoice**. Print "Delivery Receipt — This document is not valid for claim of input tax" on it. The BIR invoice is issued from the company's registered invoicing system (decision D5); the app stores the invoice number on the order.

### 7.6 Packing screen (mistake-proofing for workers)
- Shows one order at a time, big product photos, quantity, which batch/freezer to take from.
- Packing checklist per item from the packaging recipe: worker must tick every box.
- "Mark Packed" stays disabled until all boxes are ticked.
- Optional: take a photo of the packed order (saved to the order).
- Wrong quantity guard: if worker enters a different qty, app asks to confirm and notifies the boss.

### 7.7 Deliveries (driver)
- List of the driver's deliveries for today, sorted by time; tap to call customer or open Google Maps.
- Mark Delivered: requires proof photo; records cash/COD collected.

### 7.8 Reports (boss)
- Sales by day/week/month, by product, by customer, by agent.
- Discounts given: by voucher, by employee, total peso value per month.
- Commissions: earned, approved, paid, unpaid per agent.
- Unpaid / overdue list.
- Stock on hand + stock value; spoilage/waste report.
- Export to Excel (.xlsx).

### 7.9 Notifications
- In-app bell + optional push (PWA): new order, low stock, expiring batch, payment overdue, delete request, new customer sign-up, voucher about to expire or run out, commission payout requested.

### 7.10 Customer portal (external)
- **Sign up**: business name, type, contact person, phone, email, delivery address + map pin, upload business permit (optional). Status = Pending until boss/staff approves and sets payment terms and price list.
- **Data Privacy Act (RA 10173)**: sign-up has a consent checkbox linked to the privacy policy; privacy policy and terms pages on all 3 areas; customers and agents can request a copy or deletion of their data from My Account.
- **Catalog**: product photos, description, pack size, the customer's own price, stock badge only — "Available / Limited / Out of stock" (never exact quantities). Search + category filter.
- **Cart & checkout**:
  - Delivery method: Own truck delivery, Third-party courier, or Pickup at Carmona plant.
  - Preferred delivery date + time window (app blocks dates with no delivery, e.g., Sundays/holidays, set in Settings).
  - Payment option: only the ones allowed for that customer (e.g., credit terms only if approved).
  - Minimum order amount + delivery fee rules (set in Settings).
  - **Voucher code box**: "Apply" shows the discount or a clear reason it failed (expired, minimum not reached, already used, not for this product). "My vouchers" list shows vouchers assigned to this customer — tap to apply.
  - Employee buyers see "Employee rate" prices automatically + their remaining monthly limit.
  - Notes field. Clear order summary (with discount lines) before "Place Order".
- **After ordering**: order confirmation screen + email/SMS-ready message; status tracker (Received → Confirmed → Packing → Out for Delivery → Delivered).
- **My Orders**: history, **Reorder** button (copy a past order to cart), download delivery receipt (PDF).
- **My Account**: company info, delivery addresses, users, outstanding balance, payment history; upload payment proof (bank/GCash/Maya screenshot) → staff verifies.
- **Cancel**: customer can cancel only while status is "New"; after that, "Request change" sends a message to staff.
- Languages: same 4-language switcher. Design: same Sunny Foods brand, more "shop-like" (product cards like the website).

### 7.11 Price tiers & employee rates (boss only)
- Price tiers: **Regular**, **Wholesale/Distributor**, **Employee** (boss can add more). Each tier = % off regular price OR a fixed price per product.
- Price used on an order, first match wins: customer special price → customer's tier → regular price.
- **Employee rates**: an employee gets a portal account linked to their staff profile (tier = Employee).
  - Monthly purchase limit in pesos (e.g., ₱5,000) and/or packs per product; app blocks orders over the limit.
  - Payment: cash, GCash/Maya, or **salary deduction** (shown in a monthly "Employee purchases" report for payroll).
  - Employees cannot also use public vouchers unless the voucher says "employees allowed".
  - When a staff account is deactivated, the employee rate stops automatically.

### 7.12 Vouchers & discounts (boss creates; office staff can view/apply)
- Voucher fields: name, **code** (e.g., `HOLIDAY10`) or "automatic" (no code), type, value, start/end date, active yes/no.
- **Types**:
  1. % off order (with optional max discount, e.g., 10% up to ₱1,000)
  2. Fixed ₱ off order
  3. % or ₱ off selected products/categories only
  4. Free delivery
  5. Buy X get Y (e.g., buy 10 Rib Eye get 1 free)
  6. Free item (add a product at ₱0)
- **Rules**: minimum order amount, who can use (all customers / selected customers / a price tier / new customers' first order / employees), total uses limit, uses per customer, stackable with other vouchers yes/no (default **no** — only 1 voucher per order).
- Discount is calculated on the server, never trusted from the browser.
- Voucher list shows: times used, total peso discount given, remaining uses, days left. Boss can pause a voucher anytime.
- Staff can add a voucher or a **manual discount** when encoding an order; a manual discount requires a reason and is flagged for boss review.
- Vouchers are archived, never hard-deleted (old orders keep showing which voucher they used).

### 7.13 Agents, brokers & commissions (internal, boss/office)
- **Agent profile**: name, type (Agent / Broker), phone, email, GCash/bank name for payouts (no account numbers stored in notes), status active/inactive, referral code (e.g., `AG-JUAN`).
- **Linking customers**: boss assigns customers to an agent, OR a new customer signs up with the agent's referral code/link → linked after boss approval.
- **Commission rules** (boss only):
  - Default rate per agent: % of order amount or fixed ₱ per order.
  - Optional override per product/category (e.g., Sauces 3%, Steaks 5%).
  - Optional tiers by monthly sales (e.g., 5% up to ₱100k, 7% above).
  - Optional end date (e.g., commission only for the first 12 months of a customer).
- **Commission base** = order total after all discounts/vouchers, excluding delivery fee.
- **Commission status flow**: Pending (order placed) → Earned (order Delivered **and** fully Paid) → Approved (boss) → Paid (payout recorded with date, method, reference, proof photo). Cancelled/returned orders → commission Voided automatically; if already paid, a negative adjustment is added to the next payout.
- **Agents page (company monitoring)**: list of agents with this month's sales, number of active customers, commission earned / unpaid / paid, ranking. Tap an agent → their customers, orders, commission ledger, payout history.
- **Payout run**: boss selects a period (e.g., 1–15 Nov), sees all Earned commissions per agent, approves in one tap, exports to Excel, marks Paid.
- Commission records are never edited — corrections are separate adjustment lines with a reason.
- **Boss control: transfer or cancel commission** (Owner by default; changeable in Master Control):
  - **Transfer**: move a customer — and its commission — from Agent A to Agent B. Choose scope: *future orders only* OR *future + pending/unpaid*. Set effective date + reason. Optional split (e.g., A 40% / B 60%) for a set period.
  - **Cancel**: cancel selected commissions (Pending / Earned / Approved, not yet paid) or all future commission on a customer. Reason required.
  - **Paid** commissions are never changed by transfer/cancel; any correction is an adjustment line on the next payout.
  - Agents are notified; the old agent sees "Transferred by Sunny Foods" (new agent's name only if Master Control allows).
- **Agent resignation / offboarding** (decided by boss or after discussion):
  - Mark agent **Resigned** with last working day. App lists all their customers + unpaid commissions on one screen.
  - Per customer choose: **Keep paying** the resigned agent (until a date or forever) · **Transfer** to another agent · **House account** (no agent, no commission).
  - Unpaid commission choose: **Pay in full** · **Pay partial** (settlement amount) · **Forfeit**.
  - Save as a **Settlement**: summary PDF (English + 中文) for discussion/signature, upload signed copy, status Draft → Agreed → Done.
  - After last day: agent portal becomes read-only (own statement + payouts) for 60 days, then locked. Referral code deactivated.
- All transfer / cancel / settlement actions: typed confirmation, audit-logged with before/after, can be reversed only by a new opposite action (never silent edits).

### 7.14 Agent portal (external, `agent.sunnyfoods.com.ph`)
- **Home (tracker)**: this month's sales, commission earned, commission pending, next payout date; progress bar to monthly target (if boss set one).
- **My customers**: list with last order date, this month's sales, unpaid balance; "Inactive 30+ days" flag so the agent knows whom to follow up.
- **Orders**: all orders from my customers with status (same tracker as customer portal). **New order for a customer**: pick one of my customers → same catalog/checkout as the customer portal (customer gets notified).
- **Commissions**: ledger with each order, base amount, rate, commission, status (Pending / Earned / Approved / Paid / Voided). Filter by month.
- **Payouts**: history with proof of payment.
- **Invite**: my referral code + shareable link/QR for new customers to sign up.
- Same 4-language switcher and Sunny Foods design.

## 8. Safety — no accidental data loss
1. **Soft delete only**: "Delete" moves items to **Trash** (`deleted_at`, `deleted_by`). Nothing is removed from the database by any user action (only exception: personal-data deletion, rule 13).
2. **Confirm step**: delete dialog asks to type the item name (or "DELETE") before confirming.
3. **Undo**: 10-second "Undo" button after any delete or edit.
4. **Boss approval**: staff can only *request* delete; boss approves. Products/customers that have past orders can only be archived, never deleted.
5. **Trash**: boss can restore anything. Items stay in Trash permanently unless the boss empties a specific item (second confirmation).
6. **Audit log**: every create/edit/delete/status change saves who, when, old value, new value. Boss can view history per record.
7. **Backups**: Supabase daily automatic backups + a weekly Excel export of all tables saved to private Supabase Storage only (never emailed — it contains customers' personal data).
8. **Database rules**: Row Level Security per role; database trigger blocks hard `DELETE` on business tables.
9. **Customer data walls**: RLS makes a customer see only rows with their own `customer_id`. Cost, stock numbers, other customers and internal notes are never sent to the portal (use separate portal-safe database views).
10. **Abuse guards (portals)**: rate-limit sign-up/login, email/phone verification, unapproved customers cannot order, rate-limit voucher code attempts (stops guessing codes).
11. **Money rules**: prices, discounts, vouchers and commissions are calculated in the database/server only. Changes to prices, tiers, vouchers and commission rates are audit-logged with old and new values. Each order stores a snapshot of the prices, discounts and commission rate used at that time, so later changes never alter old orders.
12. **Agent data walls**: RLS makes an agent see only their own linked customers, orders and commissions — and only the fields Master Control (3a) allows.
13. **Personal-data deletion (Data Privacy Act / in-app "Delete my account")**: the request is logged in `data_requests` and approved by the boss. The person's name, phone, email, address, map pin and login are blanked out (replaced with "Deleted user"); their orders, payments and commissions stay with totals intact for the legal record-keeping period (length to be confirmed by the accountant). The login is disabled immediately.

## 9. OTA updates
- PWA service worker checks for a new version on app open and every 30 minutes.
- When found: banner "New version available — Tap to update" (in user's language). Forced update for critical fixes.
- Version number + "What's new" list shown in Settings (`/CHANGELOG.md` rendered).
- Deploy: push to GitHub `main` → Vercel builds → all users get it. Use a `staging` branch to test first.

## 9a. App Store & Google Play (customer portal only)
- Only the **Customer portal** ("Sunny Foods Order") goes on the public stores. Staff and Agent apps stay as installable PWAs (home-screen icon from the browser link) — no store review needed. Optional later: Agent app as an Apple **Unlisted** app.
- Wrap the customer portal with **Capacitor** (iOS + Android) — same code as the web app.
- **Build approach**: the store app must contain its own screens (bundled build), not just open the website — Capacitor says loading the live site (`server.url`) is for development only, and Apple may reject it. So build the customer portal screens (Phases 10–11) so they can be exported as a static bundle: they read data through Supabase (RLS + portal-safe views) and call the server API routes on `order.sunnyfoods.com.ph` for prices, vouchers and checkout.
- **Updates for the store app**: Vercel deploys do not update the bundled app. Use store updates for native changes, plus a Capacitor live-update service for screen changes (choose in Phase 18).
- **Accounts needed**: Apple Developer Program (yearly fee; company account needs a D-U-N-S number) and Google Play Console (one-time fee), both under Sunny Foods Inc.
- Must add real native features (Apple guideline 4.2 rejects plain website wrappers):
  - Push notifications for order status (Received → Delivered) and payment reminders.
  - Camera / photo picker for payment-proof upload.
  - Face ID / fingerprint quick login.
  - Offline: last-viewed catalog and My Orders still open without internet, with a friendly offline screen.
- Store requirements: in-app **Delete my account**, privacy policy page, terms page, demo customer login for reviewers, app icons + splash in Sunny Foods brand, store screenshots (EN).
- Physical goods (meat orders) → no Apple/Google in-app purchase needed.
- Builds via a cloud build service (no Mac required); signing keys stored safely and documented.

## 10. Database tables (Supabase)
`profiles` (user, role, language, `customer_id` for portal users, `agent_id` for agents, `is_employee`, `team_id`), `roles`, `permissions`, `role_permissions` (level + scope), `field_visibility`, `user_permission_overrides`, `approval_rules`, `teams`, `customer_users`, `customer_addresses`, `cart_items`, `payment_proofs`, `price_tiers`, `tier_prices`, `employee_limits`, `vouchers`, `voucher_targets`, `voucher_redemptions`, `order_discounts`, `agents`, `agent_customers`, `commission_rules`, `commissions`, `commission_adjustments`, `commission_payouts`, `commission_transfers`, `agent_settlements`, `categories`, `products`, `packaging_materials`, `product_packaging` (recipe), `batches`, `stock_movements`, `customers`, `customer_prices`, `orders`, `order_items`, `order_packing_checks`, `payments`, `deliveries`, `delete_requests`, `audit_log`, `app_settings`, `notifications`, `push_subscriptions`, `privacy_consents`, `data_requests`, `blocked_delivery_dates`, `agent_targets`.
- All business tables: `id`, `created_at`, `created_by`, `updated_at`, `deleted_at`, `deleted_by`.
- Stock on hand = sum of `stock_movements` (never edit a number directly).

## 11. Non-goals (v1)
- No changes to sunnyfoods.com.ph (owner may later add an "Order Now" link to the portal manually).
- No online card payment gateway (customers upload payment proof instead).
- No public walk-in shop; only approved business customers, employees and agents (for their customers) can order.
- No automatic payout transfers to agents (boss pays outside the app, then records it).
- No accounting/BIR invoicing (export to Excel instead). The app's documents are delivery receipts, not BIR invoices (see 7.5).
- No barcode scanning (possible v2).

## 12. Build phases (one phase per Claude Code session)
1. Project setup: Next.js 16 + Tailwind + Supabase (new API keys) + PWA + 4 languages + brand theme + email/password login + one test account per role.
2. **Master Control engine + safety base**: roles, permission tables, field visibility, per-user overrides, `can()` helper used by every page/API, RLS policies reading the same tables, default settings from Section 3. Also the base every table uses: standard columns (`deleted_at` etc.), audit-log trigger and hard-`DELETE` block trigger. (Build this BEFORE features so every later phase uses it.)
3. Products, categories, packaging materials, packaging recipes + seed data from Section 6.
4. Inventory: batches, stock movements, stock in/out/adjust, low-stock & expiry alerts.
5. Customers + Orders (create, statuses, delivery & payment options, printouts).
6. Packing screen with checklist lock + auto packaging deduction.
7. Driver deliveries + payments.
8. Safety screens: Trash, undo, delete approval, audit history per record, backups (triggers already built in Phase 2).
9. Dashboard, reports, Excel export, notifications, scheduled jobs (Supabase Cron).
10. Customer portal part 1: custom email sender (SMTP), subdomain routing, sign-up + approval + privacy consent, catalog with customer prices & stock badges (screens built so they can be bundled for the store app, see 9a).
11. Customer portal part 2: cart, checkout (delivery/payment options, date rules), order tracking, reorder, payment proof upload.
12. Price tiers + employee rates + employee monthly limits + salary-deduction report.
13. Vouchers & discounts: voucher builder, all 6 types + rules, apply in staff orders and portal checkout, usage report.
14. Agents & commissions (internal): agent profiles, customer linking, commission rules, ledger, payout run, Agents monitoring page, transfer / cancel commission, resignation settlement.
15. Agent portal: subdomain, login, tracker home, my customers, orders + order-for-customer, commissions, payouts, referral link/QR.
16. **Master Control screen**: permission matrix, agent/broker visibility panel, custom roles, per-person overrides, approval rules, "View as", change history + rollback.
17. OTA update banner (all 3 apps), changelog, staging branch, connect all 3 subdomains, deploy to Vercel.
18. **App stores**: Capacitor bundled build of the Customer portal (iOS + Android), push notifications, camera upload, biometric login, offline screens, in-app account deletion, live-update service, icons/splash, cloud builds, store listing text + screenshots (Section 9a).

## 13. Acceptance checks
- Works on a 6-inch Android phone and a laptop browser; installable as an app icon.
- Switching language changes every label; Chinese text displays correctly.
- Worker cannot mark an order Packed without ticking all packaging items.
- Worker cannot see prices or costs.
- Deleting a product as staff creates a request; boss approves; item appears in Trash and can be restored with full history.
- Running SQL `DELETE` on `orders` is blocked.
- Pushing a change to `main` shows the update banner on an open phone within 30 minutes.
- A customer logged into the portal cannot open any internal page or see another customer's orders/prices (test by changing IDs in the URL).
- A portal order appears in the internal app as "New" within 5 seconds, with an alert.
- An unapproved customer can browse products (no prices) but cannot place an order.
- An employee sees employee prices and is blocked when an order goes over their monthly limit.
- Voucher `TEST10` (10% off, min ₱3,000, 1 use per customer): works once on a ₱5,000 order, shows "minimum not reached" on ₱2,000, shows "already used" on a second try.
- Order total in the database matches the screen even if someone edits the price in the browser.
- Agent A cannot see Agent B's customers, orders or commissions (test by changing IDs in the URL).
- Commission turns Earned only after the order is Delivered and fully Paid; cancelling a paid order creates a negative adjustment.
- Changing an agent's rate does not change commissions on old orders.
- Transfer customer from Agent A to B "future + unpaid": A's unpaid lines move to B, A's paid lines stay untouched, both agents notified.
- Resignation settlement "forfeit unpaid + transfer customers": A's unpaid commissions become Voided (Forfeited), customers move, A's portal turns read-only.
- Master Control: switch "Agents → Stock" to Badge only → agent screen shows badges, and the API/network response contains no stock numbers.
- Per-person override: give one agent "exact stock" → only that agent sees quantities.
- Turning off "customer phone" for Brokers hides it on screen and in exports/API for brokers.
- The last Owner cannot be removed or downgraded; an Admin cannot give themselves Owner access.
- "View as Agent" shows exactly what an agent sees; every permission change appears in the change history and can be rolled back.
- Store app: push arrives when an order changes status; payment proof can be taken with the camera; app opens offline with a friendly screen; a customer can delete their account inside the app.
- The browser code and network responses never contain the Supabase secret key.
- Sign-up and password-reset emails arrive from the Sunny Foods sender address (custom SMTP), including 20 sign-ups in one hour.
- A payment with credit terms turns Overdue automatically the day after its due date (scheduled job).
- The delivery receipt PDF shows the "not a BIR invoice" line.
- A customer's deletion request removes their personal data; their past orders stay with totals intact.

## 14. Decisions log
| # | Decision | Status (2026-11-25) |
|---|---|---|
| D1 | Login method | **Decided**: email + password for v1. Phone login can be added later with an SMS provider. |
| D2 | Supabase plan | **Decided**: Free while building, upgrade to Pro before go-live. |
| D3 | Domain / DNS for sunnyfoods.com.ph | **Decided**: Earvin controls it; he adds the subdomain and email-sender records when asked (Phases 10 and 17). |
| D4 | VAT | **Partly decided**: Sunny Foods is VAT-registered; all products are VATable **except Yakiniku** (VAT-exempt). Still open: are prices shown VAT-inclusive, and is the discount taken before or after VAT. Owner: Earvin (ask accountant). Needed before Phase 5. |
| D5 | BIR invoicing system | **Skipped for now**: app keeps the "not a BIR invoice" line on delivery receipts; revisit before go-live. |
| D6 | Apple / Google developer accounts | **Deferred** until Phase 18. |
