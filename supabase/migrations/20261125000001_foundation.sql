-- =====================================================================
-- 0001 FOUNDATION: private schema, standard columns, audit log,
-- hard-delete block, settings.  (Spec 8, 10)
-- All business tables live in schema "app", which is NOT exposed by the
-- Supabase REST API. Only the Next.js server reads it, as the logged-in
-- user (role "authenticated" + JWT claims), so Row Level Security applies.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- New tables: authenticated may read/insert/update (RLS decides rows). Never DELETE.
alter default privileges in schema app grant select, insert, update on tables to authenticated;
alter default privileges in schema app grant all on tables to service_role;
alter default privileges in schema app grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema app grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Settings (key/value). Read by everyone logged in; edited by Settings perm.
-- ---------------------------------------------------------------------
create table app.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  description text
);

create or replace function app.setting(p_key text) returns jsonb
language sql stable security definer set search_path = app, public as $$
  select value from app.app_settings where key = p_key
$$;

create or replace function app.setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = app, public as $$
  select coalesce((select (value #>> '{}')::numeric from app.app_settings where key = p_key), p_default)
$$;

create or replace function app.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = app, public as $$
  select coalesce((select (value #>> '{}')::boolean from app.app_settings where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------
-- Audit log (Spec 8.6) — who, when, old value, new value.
-- ---------------------------------------------------------------------
create table app.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('insert','update','delete','soft_delete','restore','purge','rollback','undo')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  note text
);
create index audit_log_record_idx on app.audit_log (table_name, record_id, at desc);
create index audit_log_user_idx on app.audit_log (user_id, at desc);

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_action text := lower(tg_op);
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k) into v_changed
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at') and (v_old -> k) is distinct from (v_new -> k);
    if v_changed is null then return new; end if;
    if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then v_action := 'soft_delete';
    elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then v_action := 'restore';
    end if;
    if current_setting('app.audit_action', true) in ('rollback','undo') then
      v_action := current_setting('app.audit_action', true);
    end if;
  end if;
  insert into app.audit_log (user_id, table_name, record_id, action, old_data, new_data, changed_fields)
  values (auth.uid(), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), v_action, v_old, v_new, v_changed);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Hard DELETE / TRUNCATE block (Spec 8.8). Only the boss "empty from
-- Trash" function sets app.allow_purge for its own transaction.
-- ---------------------------------------------------------------------
create or replace function app.block_hard_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Hard delete is blocked on %. Use Delete (moves to Trash).', tg_table_name
    using errcode = 'P0001';
end $$;

create or replace function app.block_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'TRUNCATE is blocked on %.', tg_table_name using errcode = 'P0001';
end $$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null and new.deleted_by is null then
    new.deleted_by := auth.uid();
  end if;
  return new;
end $$;

-- Adds the standard columns + triggers to a business table (Spec 10).
create or replace function app.make_business_table(p_table text, p_audit boolean default true)
returns void language plpgsql as $$
begin
  execute format('alter table app.%I
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists created_by uuid default auth.uid(),
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists deleted_at timestamptz,
      add column if not exists deleted_by uuid', p_table);
  execute format('create trigger %I before insert or update on app.%I
      for each row execute function app.touch_updated_at()', p_table || '_touch', p_table);
  execute format('create trigger %I before delete on app.%I
      for each row execute function app.block_hard_delete()', p_table || '_no_delete', p_table);
  execute format('create trigger %I before truncate on app.%I
      for each statement execute function app.block_truncate()', p_table || '_no_truncate', p_table);
  if p_audit then
    execute format('create trigger %I after insert or update or delete on app.%I
        for each row execute function app.audit_row()', p_table || '_audit', p_table);
  end if;
  execute format('alter table app.%I enable row level security', p_table);
end $$;

select app.make_business_table('app_settings');

-- Default settings (all editable in Settings).
insert into app.app_settings (key, value, description) values
  ('vat_rate', '0.12', 'VAT rate (12%)'),
  ('prices_include_vat', 'true', 'D4 (open): are prices VAT-inclusive?'),
  ('discount_before_vat', 'true', 'D4 (open): discounts taken before VAT?'),
  ('delivery_fee_vatable', 'true', 'Is the delivery fee VATable?'),
  ('min_order_amount', '0', 'Minimum order amount for portal/agent orders (PHP)'),
  ('delivery_fees', '{"own_truck": 0, "courier": 0, "pickup": 0}', 'Delivery fee per method (PHP)'),
  ('free_delivery_over', 'null', 'Free delivery when items total reaches this amount (null = off)'),
  ('no_delivery_weekdays', '[0]', 'Weekdays with no delivery (0 = Sunday)'),
  ('time_windows', '["8:00-12:00", "13:00-17:00"]', 'Delivery time windows'),
  ('expiry_alert_days', '14', 'Alert when a batch expires within this many days'),
  ('limited_stock_level', '"low_stock_level"', 'Badge shows Limited at or below the product low-stock level'),
  ('company', '{"name": "Sunny Foods Inc.", "address": "Carmona, Cavite", "tin": "", "phone": "", "email": ""}', 'Company details on documents'),
  ('receipt_footer', '"Delivery Receipt — This document is not valid for claim of input tax"', 'Printed on every delivery receipt (Spec 7.5)'),
  ('privacy_policy_version', '"2026-11-25"', 'Current privacy policy version'),
  ('agent_portal_readonly_days', '60', 'Days a resigned agent keeps read-only access'),
  ('voucher_attempt_limit', '10', 'Max voucher code tries per user per 10 minutes'),
  ('pickup_address', '"Sunny Foods Inc. plant, Carmona, Cavite"', 'Pickup point')
;
