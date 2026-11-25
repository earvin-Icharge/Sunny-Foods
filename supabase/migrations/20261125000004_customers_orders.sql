-- =====================================================================
-- 0004 CUSTOMERS, PRICE TIERS, ORDERS, PAYMENTS, DELIVERIES, VOUCHERS
-- (Spec 7.4, 7.5, 7.7, 7.10, 7.11, 7.12) — tables only; logic in 0006.
-- =====================================================================

create table app.price_tiers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  kind text not null default 'percent' check (kind in ('percent','fixed')),
  percent_off numeric(5,2) not null default 0 check (percent_off between 0 and 100),
  is_builtin boolean not null default false,
  active boolean not null default true
);
select app.make_business_table('price_tiers');

create table app.tier_prices (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references app.price_tiers (id),
  product_id uuid not null references app.products (id),
  price numeric(12,2) not null check (price >= 0)
);
select app.make_business_table('tier_prices');
create unique index tier_prices_uq on app.tier_prices (tier_id, product_id) where deleted_at is null;

insert into app.price_tiers (key, name, kind, percent_off, is_builtin) values
  ('regular','Regular','percent',0,true),
  ('wholesale','Wholesale / Distributor','percent',0,true),
  ('employee','Employee','percent',0,true);

create table app.customers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  business_type text not null default 'restaurant'
    check (business_type in ('restaurant','cafe','retailer','distributor','private_label','employee','other')),
  contact_person text,
  phone text,
  email text,
  address text,
  lat numeric(10,7), lng numeric(10,7),
  default_delivery_method text not null default 'own_truck' check (default_delivery_method in ('own_truck','courier','pickup')),
  payment_terms text not null default 'cod' check (payment_terms in ('cash','cod','prepaid','credit_7','credit_15','credit_30')),
  allowed_payment_methods text[] not null default array['cash','cod','bank_transfer','gcash','maya'],
  price_tier_id uuid references app.price_tiers (id),
  agent_id uuid,   -- current main agent (FK in 0005); history in agent_customers
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  is_employee_account boolean not null default false,
  employee_profile_id uuid references app.profiles (id),
  notes text,               -- internal notes: never shown in portals
  permit_path text,
  referral_code_used text,
  approved_at timestamptz, approved_by uuid,
  anonymized_at timestamptz
);
select app.make_business_table('customers');

alter table app.profiles add constraint profiles_customer_fk foreign key (customer_id) references app.customers (id);

create table app.customer_users (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references app.customers (id),
  profile_id uuid not null references app.profiles (id),
  is_primary boolean not null default false
);
select app.make_business_table('customer_users');
create unique index customer_users_uq on app.customer_users (customer_id, profile_id) where deleted_at is null;

create table app.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references app.customers (id),
  label text not null default 'Main',
  address text not null,
  lat numeric(10,7), lng numeric(10,7),
  is_default boolean not null default false
);
select app.make_business_table('customer_addresses');

create table app.customer_prices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references app.customers (id),
  product_id uuid not null references app.products (id),
  price numeric(12,2) not null check (price >= 0)
);
select app.make_business_table('customer_prices');
create unique index customer_prices_uq on app.customer_prices (customer_id, product_id) where deleted_at is null;

create table app.employee_limits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references app.customers (id),
  product_id uuid references app.products (id),  -- null = whole-order peso limit
  monthly_amount numeric(12,2),
  monthly_packs numeric(12,2),
  check (monthly_amount is not null or monthly_packs is not null)
);
select app.make_business_table('employee_limits');

create table app.blocked_delivery_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  reason text
);
select app.make_business_table('blocked_delivery_dates');
create unique index blocked_dates_uq on app.blocked_delivery_dates (date) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Vouchers (Spec 7.12)
-- ---------------------------------------------------------------------
create table app.vouchers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,                      -- null = automatic
  type text not null check (type in ('pct_order','fixed_order','product_discount','free_delivery','buy_x_get_y','free_item')),
  value numeric(12,2) not null default 0,
  value_kind text not null default 'percent' check (value_kind in ('percent','fixed')), -- for product_discount
  max_discount numeric(12,2),
  min_order numeric(12,2) not null default 0,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  active boolean not null default true,
  paused boolean not null default false,
  audience text not null default 'all' check (audience in ('all','selected','tier','first_order','employees')),
  tier_id uuid references app.price_tiers (id),
  employees_allowed boolean not null default false,
  total_limit int,
  per_customer_limit int,
  stackable boolean not null default false,
  buy_product_id uuid references app.products (id), buy_qty numeric(12,2),
  get_product_id uuid references app.products (id), get_qty numeric(12,2),
  free_product_id uuid references app.products (id), free_qty numeric(12,2),
  archived_at timestamptz
);
select app.make_business_table('vouchers');
create unique index vouchers_code_uq on app.vouchers (lower(code)) where code is not null and deleted_at is null;

create table app.voucher_targets (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references app.vouchers (id),
  target_type text not null check (target_type in ('customer','product','category')),
  target_id uuid not null
);
select app.make_business_table('voucher_targets');

create table app.voucher_attempts (
  id bigserial primary key,
  profile_id uuid,
  code text,
  ok boolean not null,
  at timestamptz not null default now()
);
alter table app.voucher_attempts enable row level security;
create index voucher_attempts_idx on app.voucher_attempts (profile_id, at desc);

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create sequence app.order_no_seq;

create table app.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('SF-' || to_char(now() at time zone 'Asia/Manila', 'YYMMDD') || '-' || lpad(nextval('app.order_no_seq')::text, 5, '0')),
  customer_id uuid not null references app.customers (id),
  source text not null check (source in ('portal','agent','staff')),
  placed_by uuid default auth.uid(),
  agent_id uuid,
  status text not null default 'new' check (status in ('new','confirmed','packing','packed','out_for_delivery','delivered','completed','cancelled')),
  cancel_reason text,
  delivery_date date,
  time_window text,
  delivery_method text not null check (delivery_method in ('own_truck','courier','pickup')),
  courier_name text,
  delivery_address text,
  lat numeric(10,7), lng numeric(10,7),
  payment_method text not null check (payment_method in ('cash','cod','bank_transfer','gcash','maya','cheque','credit_7','credit_15','credit_30','salary_deduction')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','overdue')),
  due_date date,
  subtotal numeric(12,2) not null default 0,
  tier_discount numeric(12,2) not null default 0,
  voucher_discount numeric(12,2) not null default 0,
  manual_discount numeric(12,2) not null default 0,
  manual_discount_reason text,
  manual_discount_flagged boolean not null default false,
  delivery_fee numeric(12,2) not null default 0,
  vatable_sales numeric(12,2) not null default 0,
  vat_exempt_sales numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  commission_base numeric(12,2) not null default 0,
  notes text,
  internal_notes text,
  bir_invoice_no text,
  calc_snapshot jsonb,          -- settings, prices & rates used (Spec 8.11)
  changed_by_staff boolean not null default false,
  confirmed_at timestamptz, confirmed_by uuid,
  packed_at timestamptz, packed_by uuid,
  packing_photo_path text,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
select app.make_business_table('orders');
create index orders_customer_idx on app.orders (customer_id, created_at desc);
create index orders_status_idx on app.orders (status, delivery_date);
create index orders_agent_idx on app.orders (agent_id, created_at desc);

create table app.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id),
  product_id uuid not null references app.products (id),
  product_name text not null,
  sku text,
  unit text not null,
  qty numeric(12,3) not null check (qty > 0),
  regular_price numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  price_source text not null check (price_source in ('special','tier','employee','regular','free')),
  line_subtotal numeric(12,2) not null,     -- regular_price * qty
  line_total numeric(12,2) not null,        -- unit_price * qty
  line_discount numeric(12,2) not null default 0,  -- voucher/manual share (allocated)
  net_amount numeric(12,2) not null,        -- line_total - line_discount
  vat_type text not null check (vat_type in ('vatable','exempt')),
  is_free boolean not null default false,
  free_reason text,
  packed_qty numeric(12,3),
  sort int not null default 0
);
select app.make_business_table('order_items');
create index order_items_order_idx on app.order_items (order_id);

create table app.order_discounts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id),
  kind text not null check (kind in ('special','tier','employee','voucher','manual','free_delivery','free_goods')),
  label text not null,
  voucher_id uuid references app.vouchers (id),
  code text,
  amount numeric(12,2) not null,
  affects_total boolean not null default true
);
select app.make_business_table('order_discounts');

create table app.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references app.vouchers (id),
  order_id uuid not null references app.orders (id),
  customer_id uuid not null references app.customers (id),
  amount numeric(12,2) not null,
  status text not null default 'active' check (status in ('active','voided'))
);
select app.make_business_table('voucher_redemptions');

create table app.order_packing_checks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id),
  order_item_id uuid not null references app.order_items (id),
  check_type text not null check (check_type in ('pick','material')),
  material_id uuid references app.packaging_materials (id),
  batch_id uuid references app.batches (id),
  required_qty numeric(12,3) not null,
  checked boolean not null default false,
  checked_by uuid,
  checked_at timestamptz
);
select app.make_business_table('order_packing_checks', false);

create table app.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id),
  customer_id uuid not null references app.customers (id),
  amount numeric(12,2) not null check (amount <> 0),
  method text not null check (method in ('cash','cod','bank_transfer','gcash','maya','cheque','salary_deduction','adjustment')),
  paid_at date not null default (now() at time zone 'Asia/Manila')::date,
  reference text,
  proof_path text,
  notes text
);
select app.make_business_table('payments');
create index payments_order_idx on app.payments (order_id);

create table app.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references app.customers (id),
  order_id uuid references app.orders (id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('bank_transfer','gcash','maya','cheque')),
  reference text,
  file_path text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewed_by uuid, reviewed_at timestamptz, review_note text,
  payment_id uuid references app.payments (id)
);
select app.make_business_table('payment_proofs');

create table app.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id),
  driver_id uuid references app.profiles (id),
  scheduled_date date,
  status text not null default 'assigned' check (status in ('assigned','out','delivered','failed')),
  proof_path text,
  cod_collected numeric(12,2),
  delivered_at timestamptz,
  notes text
);
select app.make_business_table('deliveries');
create unique index deliveries_order_uq on app.deliveries (order_id) where deleted_at is null;

create table app.cart_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references app.profiles (id),
  customer_id uuid not null references app.customers (id),
  product_id uuid not null references app.products (id),
  qty numeric(12,3) not null check (qty > 0)
);
select app.make_business_table('cart_items', false);
create unique index cart_items_uq on app.cart_items (profile_id, customer_id, product_id) where deleted_at is null;

-- Real reservation now that orders exist: confirmed..packing orders hold stock.
create or replace function app.product_reserved(p_product uuid) returns numeric
language sql stable security definer set search_path = app, public as $$
  select coalesce(sum(i.qty), 0) from app.order_items i join app.orders o on o.id = i.order_id
  where i.product_id = p_product and i.deleted_at is null and o.deleted_at is null
    and o.status in ('new','confirmed','packing')
$$;
