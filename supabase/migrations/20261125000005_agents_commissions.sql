-- =====================================================================
-- 0005 AGENTS, BROKERS & COMMISSIONS — tables (Spec 7.13, 7.14)
-- =====================================================================

create table app.agents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references app.profiles (id),
  name text not null,
  type text not null default 'agent' check (type in ('agent','broker')),
  role_key text not null default 'agent' references app.roles (key) on update cascade,
  phone text,
  email text,
  payout_method text check (payout_method in ('gcash','bank')),
  payout_name text,     -- GCash / bank name only (no account numbers in notes)
  status text not null default 'active' check (status in ('active','inactive','resigned')),
  referral_code text not null unique,
  referral_active boolean not null default true,
  last_working_day date,
  portal_locked_at timestamptz,
  team_id uuid references app.teams (id),
  default_rate_kind text not null default 'percent' check (default_rate_kind in ('percent','fixed')),
  default_rate numeric(10,2) not null default 0,
  anonymized_at timestamptz
);
select app.make_business_table('agents');

alter table app.profiles add constraint profiles_agent_fk foreign key (agent_id) references app.agents (id);
alter table app.customers add constraint customers_agent_fk foreign key (agent_id) references app.agents (id);
alter table app.orders add constraint orders_agent_fk foreign key (agent_id) references app.agents (id);

-- Which agent(s) earn on a customer, for which period, at which share.
create table app.agent_customers (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references app.agents (id),
  customer_id uuid not null references app.customers (id),
  share_pct numeric(5,2) not null default 100 check (share_pct > 0 and share_pct <= 100),
  start_date date not null default (now() at time zone 'Asia/Manila')::date,
  end_date date,
  source text not null default 'assigned' check (source in ('assigned','referral','transfer','split','settlement')),
  note text
);
select app.make_business_table('agent_customers');
create index agent_customers_idx on app.agent_customers (customer_id, agent_id);

create table app.commission_rules (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references app.agents (id),     -- null = applies to all agents
  scope text not null check (scope in ('product','category','monthly_tier')),
  product_id uuid references app.products (id),
  category_id uuid references app.categories (id),
  rate_kind text not null default 'percent' check (rate_kind in ('percent','fixed')),
  rate numeric(10,2) not null check (rate >= 0),
  min_monthly_sales numeric(14,2),               -- for monthly_tier
  max_months int,                                -- e.g. only the first 12 months of a customer
  active boolean not null default true
);
select app.make_business_table('commission_rules');

create table app.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references app.agents (id),
  period_start date not null,
  period_end date not null,
  gross numeric(12,2) not null default 0,
  adjustments numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','approved','paid','cancelled')),
  approved_by uuid, approved_at timestamptz,
  paid_at date, method text, reference text, proof_path text
);
select app.make_business_table('commission_payouts');

create table app.commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id),
  agent_id uuid not null references app.agents (id),
  customer_id uuid not null references app.customers (id),
  base_amount numeric(12,2) not null,
  rate_kind text not null,
  rate numeric(10,2) not null,
  share_pct numeric(5,2) not null default 100,
  amount numeric(12,2) not null,
  rule_snapshot jsonb,
  status text not null default 'pending' check (status in ('pending','earned','approved','paid','voided')),
  earned_at timestamptz,
  approved_at timestamptz, approved_by uuid,
  payout_id uuid references app.commission_payouts (id),
  void_reason text,
  transferred_from_agent_id uuid references app.agents (id)
);
select app.make_business_table('commissions');
create index commissions_agent_idx on app.commissions (agent_id, status);
create index commissions_order_idx on app.commissions (order_id);

-- Commission amounts are never edited; corrections are adjustment lines.
create or replace function app.commissions_immutable() returns trigger
language plpgsql as $$
begin
  if new.base_amount <> old.base_amount or new.rate <> old.rate or new.amount <> old.amount
     or new.order_id <> old.order_id or new.share_pct <> old.share_pct then
    raise exception 'Commission amounts cannot be edited. Add an adjustment line.' using errcode = 'P0001';
  end if;
  if old.status = 'paid' and (new.status <> 'paid' or new.agent_id <> old.agent_id) then
    raise exception 'Paid commissions cannot be changed. Add an adjustment on the next payout.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger commissions_immutable before update on app.commissions
  for each row execute function app.commissions_immutable();

create table app.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references app.agents (id),
  commission_id uuid references app.commissions (id),
  order_id uuid references app.orders (id),
  amount numeric(12,2) not null check (amount <> 0),
  reason text not null,
  payout_id uuid references app.commission_payouts (id),
  status text not null default 'pending' check (status in ('pending','applied','voided'))
);
select app.make_business_table('commission_adjustments');

create table app.commission_transfers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('transfer','cancel')),
  customer_id uuid references app.customers (id),
  from_agent_id uuid references app.agents (id),
  to_agent_id uuid references app.agents (id),
  scope text not null check (scope in ('future','future_unpaid','selected','all_future')),
  effective_date date not null default (now() at time zone 'Asia/Manila')::date,
  split_from_pct numeric(5,2),
  split_until date,
  commission_ids uuid[],
  reason text not null,
  moved_count int not null default 0
);
select app.make_business_table('commission_transfers');

create table app.agent_settlements (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references app.agents (id),
  last_working_day date not null,
  status text not null default 'draft' check (status in ('draft','agreed','done')),
  customer_decisions jsonb not null default '[]'::jsonb,  -- [{customer_id, action: keep|transfer|house, to_agent_id, until}]
  commission_decision text not null default 'full' check (commission_decision in ('full','partial','forfeit')),
  unpaid_total numeric(12,2) not null default 0,
  settlement_amount numeric(12,2),
  signed_path text,
  notes text,
  applied_at timestamptz
);
select app.make_business_table('agent_settlements');

create table app.agent_targets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references app.agents (id),
  month date not null,              -- first day of month
  target_amount numeric(14,2) not null
);
select app.make_business_table('agent_targets');
create unique index agent_targets_uq on app.agent_targets (agent_id, month) where deleted_at is null;
