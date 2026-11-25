-- =====================================================================
-- 0002 MASTER CONTROL ENGINE (Spec 3, 3a)
-- roles, permission matrix, field visibility, per-person overrides,
-- approval rules, teams, profiles + the can()/field() helpers that
-- every RLS policy and every API route uses.
-- Levels: 0 None, 1 View, 2 Create, 3 Edit, 4 Request delete, 5 Approve
-- Scope:  own | team | all
-- =====================================================================

create table app.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  area text not null check (area in ('internal','portal','agent')),
  is_builtin boolean not null default false,
  is_agent_role boolean not null default false,
  based_on text,
  active boolean not null default true,
  sort int not null default 100
);
select app.make_business_table('roles');

create table app.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader_id uuid
);
select app.make_business_table('teams');

create table app.profiles (
  id uuid primary key references auth.users (id),
  full_name text not null default '',
  email text,
  phone text,
  role_key text not null references app.roles (key) on update cascade,
  language text not null default 'en' check (language in ('en','zh-Hans','zh-Hant','tl')),
  customer_id uuid,          -- portal users (FK added in 0005)
  agent_id uuid,             -- agent portal users (FK added in 0008)
  is_employee boolean not null default false,
  staff_profile_id uuid references app.profiles (id),  -- employee buyer -> their staff profile
  team_id uuid references app.teams (id),
  active boolean not null default true,
  must_change_password boolean not null default false,
  anonymized_at timestamptz
);
select app.make_business_table('profiles');
create index profiles_role_idx on app.profiles (role_key);

create table app.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_key text not null references app.roles (key) on update cascade,
  module text not null check (module in ('dashboard','orders','customers','products','inventory','packing',
    'deliveries','payments','vouchers','agents','reports','trash','settings')),
  level smallint not null default 0 check (level between 0 and 5),
  scope text not null default 'all' check (scope in ('own','team','all')),
  unique (role_key, module)
);
select app.make_business_table('role_permissions');

-- Field switches + agent/broker visibility panel, per role.
create table app.field_visibility (
  id uuid primary key default gen_random_uuid(),
  role_key text not null references app.roles (key) on update cascade,
  field text not null,
  value text not null,
  unique (role_key, field)
);
select app.make_business_table('field_visibility');

create table app.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles (id),
  module text,
  level smallint check (level between 0 and 5),
  scope text check (scope in ('own','team','all')),
  field text,
  value text,
  check ((module is not null and field is null) or (module is null and field is not null))
);
select app.make_business_table('user_permission_overrides');
create unique index upo_module_uq on app.user_permission_overrides (user_id, module) where module is not null and deleted_at is null;
create unique index upo_field_uq on app.user_permission_overrides (user_id, field) where field is not null and deleted_at is null;

create table app.approval_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  enabled boolean not null default true,
  threshold numeric,
  approver_role text not null default 'owner'
);
select app.make_business_table('approval_rules');

-- ---------------------------------------------------------------------
-- Helpers (security definer: they read permission tables for the caller)
-- ---------------------------------------------------------------------
create or replace function app.me() returns app.profiles
language sql stable security definer set search_path = app, public as $$
  select * from app.profiles where id = auth.uid() and active and deleted_at is null
$$;

create or replace function app.my_role() returns text
language sql stable security definer set search_path = app, public as $$
  select role_key from app.profiles where id = auth.uid() and active and deleted_at is null
$$;

create or replace function app.my_area() returns text
language sql stable security definer set search_path = app, public as $$
  select r.area from app.profiles p join app.roles r on r.key = p.role_key
  where p.id = auth.uid() and p.active and p.deleted_at is null and r.active
$$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = app, public as $$
  select coalesce(app.my_role() = 'owner', false)
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = app, public as $$
  select coalesce(app.my_area() = 'internal', false)
$$;

-- Permission level for a module (override > role > 0). Owner = 5 always.
create or replace function app.perm_for(p_user uuid, p_module text) returns smallint
language sql stable security definer set search_path = app, public as $$
  select case
    when p.role_key = 'owner' then 5::smallint
    else coalesce(
      (select o.level from app.user_permission_overrides o
        where o.user_id = p.id and o.module = p_module and o.deleted_at is null and o.level is not null),
      (select rp.level from app.role_permissions rp
        where rp.role_key = p.role_key and rp.module = p_module and rp.deleted_at is null),
      0::smallint)
  end
  from app.profiles p join app.roles r on r.key = p.role_key
  where p.id = p_user and p.active and p.deleted_at is null and r.active
$$;

create or replace function app.perm(p_module text) returns smallint
language sql stable as $$ select coalesce(app.perm_for(auth.uid(), p_module), 0::smallint) $$;

create or replace function app.can(p_module text, p_min smallint default 1) returns boolean
language sql stable as $$ select app.perm(p_module) >= p_min $$;

create or replace function app.scope_for(p_user uuid, p_module text) returns text
language sql stable security definer set search_path = app, public as $$
  select case when p.role_key = 'owner' then 'all' else coalesce(
    (select o.scope from app.user_permission_overrides o
      where o.user_id = p.id and o.module = p_module and o.deleted_at is null and o.scope is not null),
    (select rp.scope from app.role_permissions rp
      where rp.role_key = p.role_key and rp.module = p_module and rp.deleted_at is null),
    'own') end
  from app.profiles p where p.id = p_user
$$;

create or replace function app.scope(p_module text) returns text
language sql stable as $$ select coalesce(app.scope_for(auth.uid(), p_module), 'own') $$;

-- Is a record (created by p_owner) inside my scope for a module?
create or replace function app.in_scope(p_module text, p_owner uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  select case app.scope(p_module)
    when 'all' then true
    when 'own' then p_owner = auth.uid()
    when 'team' then p_owner = auth.uid() or exists (
      select 1 from app.profiles a join app.profiles b on a.team_id = b.team_id
      where a.id = auth.uid() and b.id = p_owner and a.team_id is not null)
  end
$$;

-- Field visibility value (override > role > default)
create or replace function app.field_for(p_user uuid, p_field text) returns text
language sql stable security definer set search_path = app, public as $$
  select case when p.role_key = 'owner' and p_field not like 'ag\_%' then 'on' else coalesce(
    (select o.value from app.user_permission_overrides o
      where o.user_id = p.id and o.field = p_field and o.deleted_at is null),
    (select f.value from app.field_visibility f
      where f.role_key = p.role_key and f.field = p_field and f.deleted_at is null),
    'off') end
  from app.profiles p where p.id = p_user
$$;

create or replace function app.field(p_field text) returns text
language sql stable as $$ select coalesce(app.field_for(auth.uid(), p_field), 'off') $$;

create or replace function app.field_on(p_field text) returns boolean
language sql stable as $$ select app.field(p_field) = 'on' $$;

-- Approval rule lookup
create or replace function app.needs_approval(p_key text, p_value numeric default null) returns boolean
language sql stable security definer set search_path = app, public as $$
  select coalesce((
    select enabled and (threshold is null or p_value is null or p_value > threshold)
    from app.approval_rules where key = p_key and deleted_at is null), false)
  and not app.is_owner()
$$;

-- ---------------------------------------------------------------------
-- Safety rules for Master Control (Spec 3a)
-- ---------------------------------------------------------------------
create or replace function app.guard_profiles() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare
  v_my_role text := app.my_role();
  v_owners int;
begin
  -- Admin can never edit Owner accounts or raise their own access.
  if v_my_role = 'admin' then
    if (tg_op = 'UPDATE' and old.role_key = 'owner') or new.role_key = 'owner' then
      raise exception 'An Admin cannot change Owner accounts.' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and new.id = auth.uid() and new.role_key is distinct from old.role_key then
      raise exception 'You cannot change your own role.' using errcode = 'P0001';
    end if;
  end if;
  -- Non-owners/admins may only edit their own language/name/phone.
  if tg_op = 'UPDATE' and auth.uid() is not null and v_my_role not in ('owner','admin')
     and not (app.can('settings', 3::smallint)) then
    if new.id <> auth.uid() or new.role_key is distinct from old.role_key or new.active is distinct from old.active
       or new.customer_id is distinct from old.customer_id or new.agent_id is distinct from old.agent_id
       or new.is_employee is distinct from old.is_employee then
      raise exception 'Not allowed.' using errcode = 'P0001';
    end if;
  end if;
  -- There must always be at least 1 active Owner.
  if tg_op = 'UPDATE' and old.role_key = 'owner' and old.active and old.deleted_at is null
     and (new.role_key <> 'owner' or not new.active or new.deleted_at is not null) then
    select count(*) into v_owners from app.profiles
      where role_key = 'owner' and active and deleted_at is null and id <> old.id;
    if v_owners = 0 then
      raise exception 'This is the last active Owner. Add another Owner first.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before insert or update on app.profiles
  for each row execute function app.guard_profiles();

-- Admin may not change permissions of the owner/admin roles or their own overrides.
create or replace function app.guard_permissions() returns trigger
language plpgsql security definer set search_path = app, public as $$
begin
  if auth.uid() is null or app.is_owner() then return new; end if;
  if not app.can('settings', 5::smallint) then
    raise exception 'Only the Owner (or an Admin with Master Control access) can change access.' using errcode = 'P0001';
  end if;
  if tg_table_name in ('role_permissions','field_visibility') and new.role_key in ('owner','admin') then
    raise exception 'Only the Owner can change Owner/Admin access.' using errcode = 'P0001';
  end if;
  if tg_table_name = 'user_permission_overrides' and (new.user_id = auth.uid()
     or exists (select 1 from app.profiles where id = new.user_id and role_key in ('owner','admin'))) then
    raise exception 'You cannot change your own access or an Owner/Admin''s access.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger role_permissions_guard before insert or update on app.role_permissions
  for each row execute function app.guard_permissions();
create trigger field_visibility_guard before insert or update on app.field_visibility
  for each row execute function app.guard_permissions();
create trigger upo_guard before insert or update on app.user_permission_overrides
  for each row execute function app.guard_permissions();
create trigger roles_guard before insert or update on app.roles
  for each row execute function app.guard_permissions();
create trigger approval_rules_guard before insert or update on app.approval_rules
  for each row execute function app.guard_permissions();

-- Roll back a Master Control change from the history list.
create or replace function app.rollback_change(p_audit_id bigint) returns void
language plpgsql security definer set search_path = app, public as $$
declare
  a app.audit_log;
begin
  if not (app.is_owner() or app.can('settings', 5::smallint)) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  select * into a from app.audit_log where id = p_audit_id;
  if a.table_name not in ('role_permissions','field_visibility','user_permission_overrides','roles','approval_rules','profiles') then
    raise exception 'Only access changes can be rolled back here.' using errcode = 'P0001';
  end if;
  perform set_config('app.audit_action', 'rollback', true);
  if a.action = 'insert' then
    execute format('update app.%I set deleted_at = now() where id = $1', a.table_name) using (a.new_data ->> 'id')::uuid;
  elsif a.old_data is not null then
    execute format('update app.%I t set (%s) = (select %s from jsonb_populate_record(null::app.%I, $1)) where t.id = $2',
      a.table_name,
      (select string_agg(quote_ident(k), ',') from unnest(coalesce(a.changed_fields, array['deleted_at'])) k),
      (select string_agg(quote_ident(k), ',') from unnest(coalesce(a.changed_fields, array['deleted_at'])) k),
      a.table_name)
    using a.old_data, (a.old_data ->> 'id')::uuid;
  end if;
  perform set_config('app.audit_action', '', true);
end $$;

-- ---------------------------------------------------------------------
-- Default roles & settings (Spec 3 table). Editable in Master Control.
-- ---------------------------------------------------------------------
insert into app.roles (key, name, area, is_builtin, is_agent_role, sort) values
  ('owner','Owner','internal',true,false,1),
  ('admin','Admin','internal',true,false,2),
  ('office','Office / sales staff','internal',true,false,3),
  ('warehouse','Warehouse / packing','internal',true,false,4),
  ('driver','Delivery driver','internal',true,false,5),
  ('customer','Customer','portal',true,false,6),
  ('employee','Employee buyer','portal',true,false,7),
  ('agent','Agent','agent',true,true,8),
  ('broker','Broker','agent',true,true,9);

-- matrix: module -> level per role
insert into app.role_permissions (role_key, module, level, scope)
select r, m, lvl, sc from (values
  -- admin: everything (Master Control only if Owner grants settings=5)
  ('admin','dashboard',5,'all'),('admin','orders',5,'all'),('admin','customers',5,'all'),('admin','products',5,'all'),
  ('admin','inventory',5,'all'),('admin','packing',5,'all'),('admin','deliveries',5,'all'),('admin','payments',5,'all'),
  ('admin','vouchers',5,'all'),('admin','agents',5,'all'),('admin','reports',5,'all'),('admin','trash',5,'all'),('admin','settings',3,'all'),
  -- office
  ('office','dashboard',1,'all'),('office','orders',4,'all'),('office','customers',4,'all'),('office','products',3,'all'),
  ('office','inventory',1,'all'),('office','packing',1,'all'),('office','deliveries',3,'all'),('office','payments',3,'all'),
  ('office','vouchers',1,'all'),('office','agents',1,'all'),('office','reports',0,'all'),('office','trash',0,'all'),('office','settings',0,'all'),
  -- warehouse
  ('warehouse','dashboard',1,'all'),('warehouse','orders',1,'all'),('warehouse','products',1,'all'),('warehouse','inventory',3,'all'),
  ('warehouse','packing',3,'all'),
  -- driver
  ('driver','dashboard',1,'own'),('driver','deliveries',3,'own'),('driver','orders',1,'own'),('driver','payments',2,'own'),
  -- portal customers / employees / agents (scope own: enforced by their own walls)
  ('customer','orders',2,'own'),('employee','orders',2,'own'),
  ('agent','orders',2,'own'),('agent','customers',1,'own'),('agent','agents',1,'own'),
  ('broker','orders',2,'own'),('broker','customers',1,'own'),('broker','agents',1,'own')
) v(r, m, lvl, sc);

-- sensitive-field switches (on/off). Missing = off.
insert into app.field_visibility (role_key, field, value)
select r, f, v from (values
  ('admin','price','on'),('admin','cost','on'),('admin','stock_qty','on'),('admin','customer_contact','on'),
  ('admin','customer_address','on'),('admin','customer_balance','on'),('admin','payment_details','on'),
  ('admin','sales_totals','on'),('admin','other_agents','on'),('admin','commission_rates','on'),
  ('office','price','on'),('office','cost','off'),('office','stock_qty','on'),('office','customer_contact','on'),
  ('office','customer_address','on'),('office','customer_balance','on'),('office','payment_details','on'),
  ('office','sales_totals','off'),('office','other_agents','on'),('office','commission_rates','off'),
  ('warehouse','price','off'),('warehouse','stock_qty','on'),('warehouse','customer_address','on'),
  ('driver','price','on'),('driver','customer_contact','on'),('driver','customer_address','on'),('driver','payment_details','on'),
  -- agent & broker visibility panel (ag_*)
  ('agent','ag_products','all'),('agent','ag_categories','[]'),('agent','ag_prices','customer'),('agent','ag_stock','badge'),
  ('agent','ag_customer','contact'),('agent','ag_orders','full'),('agent','ag_commission','breakdown'),('agent','ag_leaderboard','own'),
  ('agent','ag_act_order','on'),('agent','ag_act_refer','on'),('agent','ag_act_voucher','on'),('agent','ag_act_reports','on'),
  ('broker','ag_products','all'),('broker','ag_categories','[]'),('broker','ag_prices','customer'),('broker','ag_stock','badge'),
  ('broker','ag_customer','contact'),('broker','ag_orders','full'),('broker','ag_commission','amount'),('broker','ag_leaderboard','hidden'),
  ('broker','ag_act_order','on'),('broker','ag_act_refer','on'),('broker','ag_act_voucher','off'),('broker','ag_act_reports','on')
) v(r, f, v);

insert into app.approval_rules (key, label, enabled, threshold) values
  ('delete_request','Delete requests',true,null),
  ('manual_discount','Manual discount above X %',true,5),
  ('price_change','Price changes',false,null),
  ('stock_adjustment','Stock adjustments above X units',true,20),
  ('credit_terms','Giving credit terms',true,null),
  ('commission_payout','Commission payouts',true,null),
  ('new_account','New customer / agent accounts',true,null);
