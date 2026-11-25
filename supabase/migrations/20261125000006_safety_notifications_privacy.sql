-- =====================================================================
-- 0006 SAFETY (Trash, delete requests, undo), NOTIFICATIONS,
-- DATA PRIVACY (consents, copy/deletion requests)  (Spec 7.9, 7.10, 8)
-- =====================================================================

create table app.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles (id),
  kind text not null,
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table app.notifications enable row level security;
create index notifications_user_idx on app.notifications (user_id, created_at desc);

create table app.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles (id),
  platform text not null default 'web' check (platform in ('web','ios','android')),
  endpoint text,          -- web push
  p256dh text,
  auth text,
  device_token text,      -- native push (store app)
  created_at timestamptz not null default now()
);
alter table app.push_subscriptions enable row level security;
create unique index push_endpoint_uq on app.push_subscriptions (endpoint) where endpoint is not null;
create unique index push_token_uq on app.push_subscriptions (device_token) where device_token is not null;

-- Send one notification
create or replace function app.notify(p_user uuid, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = app, public as $$
  insert into app.notifications (user_id, kind, title, body, link, data)
  select p_user, p_kind, p_title, p_body, p_link, p_data
  where p_user is not null
$$;

-- Notify every active staff member who has at least p_level on p_module
create or replace function app.notify_staff(p_module text, p_level smallint, p_kind text, p_title text,
  p_body text default null, p_link text default null, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = app, public as $$
  insert into app.notifications (user_id, kind, title, body, link, data)
  select p.id, p_kind, p_title, p_body, p_link, p_data
  from app.profiles p join app.roles r on r.key = p.role_key
  where p.active and p.deleted_at is null and r.area = 'internal' and r.active
    and app.perm_for(p.id, p_module) >= p_level
$$;

-- Notify all users linked to a customer (portal)
create or replace function app.notify_customer(p_customer uuid, p_kind text, p_title text,
  p_body text default null, p_link text default null, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = app, public as $$
  insert into app.notifications (user_id, kind, title, body, link, data)
  select cu.profile_id, p_kind, p_title, p_body, p_link, p_data
  from app.customer_users cu join app.profiles p on p.id = cu.profile_id
  where cu.customer_id = p_customer and cu.deleted_at is null and p.active
$$;

create or replace function app.notify_agent(p_agent uuid, p_kind text, p_title text,
  p_body text default null, p_link text default null, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = app, public as $$
  insert into app.notifications (user_id, kind, title, body, link, data)
  select a.profile_id, p_kind, p_title, p_body, p_link, p_data
  from app.agents a where a.id = p_agent and a.profile_id is not null
$$;

-- ---------------------------------------------------------------------
-- Trash & delete requests (Spec 8.1–8.5)
-- ---------------------------------------------------------------------
create table app.delete_requests (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  record_label text,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid default auth.uid(),
  decided_by uuid,
  decided_at timestamptz
);
select app.make_business_table('delete_requests');

-- Tables that can go to Trash and which module controls them
create or replace function app.trash_module(p_table text) returns text
language sql immutable as $$
  select case p_table
    when 'products' then 'products' when 'categories' then 'products' when 'packaging_materials' then 'products'
    when 'product_packaging' then 'products' when 'tier_prices' then 'customers' when 'price_tiers' then 'customers'
    when 'customers' then 'customers' when 'customer_addresses' then 'customers' when 'customer_prices' then 'customers'
    when 'employee_limits' then 'customers' when 'blocked_delivery_dates' then 'settings'
    when 'orders' then 'orders' when 'payments' then 'payments' when 'batches' then 'inventory'
    when 'vouchers' then 'vouchers' when 'voucher_targets' then 'vouchers'
    when 'agents' then 'agents' when 'commission_rules' then 'agents' when 'agent_targets' then 'agents'
    when 'teams' then 'settings' when 'roles' then 'settings'
    else null end
$$;

create or replace function app.record_label(p_table text, p_id uuid) returns text
language plpgsql stable security definer set search_path = app, public as $$
declare v text;
begin
  execute format('select coalesce(to_jsonb(t) ->> ''name'', to_jsonb(t) ->> ''order_no'', to_jsonb(t) ->> ''code'', to_jsonb(t) ->> ''batch_no'', to_jsonb(t) ->> ''label'', id::text) from app.%I t where id = $1', p_table)
    into v using p_id;
  return v;
end $$;

-- Products/customers with past orders can only be archived (Spec 8.4)
create or replace function app.assert_deletable(p_table text, p_id uuid) returns void
language plpgsql stable security definer set search_path = app, public as $$
begin
  if p_table = 'products' and exists (select 1 from app.order_items where product_id = p_id) then
    raise exception 'This product has past orders. Archive it instead.' using errcode = 'P0001';
  end if;
  if p_table = 'customers' and exists (select 1 from app.orders where customer_id = p_id) then
    raise exception 'This customer has past orders. Archive (suspend) instead.' using errcode = 'P0001';
  end if;
  if p_table = 'agents' and exists (select 1 from app.commissions where agent_id = p_id) then
    raise exception 'This agent has commissions. Mark as inactive or resigned instead.' using errcode = 'P0001';
  end if;
  if p_table = 'orders' and exists (select 1 from app.orders where id = p_id and status not in ('new','cancelled')) then
    raise exception 'Only New or Cancelled orders can be deleted. Cancel it first.' using errcode = 'P0001';
  end if;
  if p_table = 'vouchers' and exists (select 1 from app.voucher_redemptions where voucher_id = p_id) then
    raise exception 'This voucher was used. Archive it instead.' using errcode = 'P0001';
  end if;
end $$;

create or replace function app.soft_delete(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  execute format('update app.%I set deleted_at = now(), deleted_by = auth.uid() where id = $1 and deleted_at is null', p_table)
    using p_id;
end $$;

-- Staff "Delete" button. Returns 'deleted' or 'requested'.
create or replace function app.request_delete(p_table text, p_id uuid, p_reason text default null) returns text
language plpgsql security definer set search_path = app, public as $$
declare
  v_module text := app.trash_module(p_table);
  v_label text;
begin
  if v_module is null then raise exception 'This item cannot be deleted.' using errcode = 'P0001'; end if;
  perform app.assert_deletable(p_table, p_id);
  v_label := app.record_label(p_table, p_id);
  if app.can(v_module, 5::smallint) and not app.needs_approval('delete_request') then
    perform app.soft_delete(p_table, p_id);
    return 'deleted';
  end if;
  if not app.can(v_module, 4::smallint) then
    raise exception 'You are not allowed to delete this.' using errcode = 'P0001';
  end if;
  if exists (select 1 from app.delete_requests where table_name = p_table and record_id = p_id and status = 'pending') then
    return 'requested';
  end if;
  insert into app.delete_requests (table_name, record_id, record_label, reason) values (p_table, p_id, v_label, p_reason);
  perform app.notify_staff('trash', 5::smallint, 'delete_request', 'Delete request: ' || coalesce(v_label, p_table),
    p_reason, '/delete-requests', jsonb_build_object('table', p_table, 'id', p_id));
  return 'requested';
end $$;

create or replace function app.decide_delete_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = app, public as $$
declare r app.delete_requests;
begin
  select * into r from app.delete_requests where id = p_request and status = 'pending';
  if r.id is null then raise exception 'Request not found.' using errcode = 'P0001'; end if;
  if not app.can(app.trash_module(r.table_name), 5::smallint) then
    raise exception 'Only the boss can approve deletes.' using errcode = 'P0001';
  end if;
  if p_approve then
    perform app.assert_deletable(r.table_name, r.record_id);
    perform app.soft_delete(r.table_name, r.record_id);
  end if;
  update app.delete_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now() where id = p_request;
  perform app.notify(r.requested_by, 'delete_decided',
    case when p_approve then 'Delete approved: ' else 'Delete rejected: ' end || coalesce(r.record_label, ''), null, '/trash');
end $$;

create or replace function app.restore_item(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if app.trash_module(p_table) is null or not (app.can('trash', 5::smallint)) then
    raise exception 'Only the boss can restore from Trash.' using errcode = 'P0001';
  end if;
  execute format('update app.%I set deleted_at = null, deleted_by = null where id = $1', p_table) using p_id;
end $$;

-- Empty ONE item from Trash (second confirmation: type the item name)
create or replace function app.purge_item(p_table text, p_id uuid, p_confirm text) returns void
language plpgsql security definer set search_path = app, public as $$
declare v_label text; v_old jsonb;
begin
  if not app.is_owner() then raise exception 'Only the Owner can empty Trash.' using errcode = 'P0001'; end if;
  if app.trash_module(p_table) is null then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  v_label := app.record_label(p_table, p_id);
  if p_confirm is distinct from v_label and p_confirm <> 'DELETE' then
    raise exception 'Type the item name exactly to confirm.' using errcode = 'P0001';
  end if;
  execute format('select to_jsonb(t) from app.%I t where id = $1 and deleted_at is not null', p_table) into v_old using p_id;
  if v_old is null then raise exception 'The item must be in Trash first.' using errcode = 'P0001'; end if;
  perform set_config('app.allow_purge', 'on', true);
  execute format('delete from app.%I where id = $1', p_table) using p_id;
  perform set_config('app.allow_purge', '', true);
  insert into app.audit_log (user_id, table_name, record_id, action, old_data, note)
  values (auth.uid(), p_table, p_id::text, 'purge', v_old, 'Emptied from Trash');
exception when foreign_key_violation then
  raise exception 'This item is still linked to other records, so it stays in Trash.' using errcode = 'P0001';
end $$;

-- 10-second Undo (Spec 8.3): reverses the caller's own recent change.
create or replace function app.undo_change(p_audit_id bigint) returns void
language plpgsql security definer set search_path = app, public as $$
declare a app.audit_log; v_cols text;
begin
  select * into a from app.audit_log where id = p_audit_id;
  if a.id is null or a.user_id is distinct from auth.uid() or a.at < now() - interval '2 minutes' then
    raise exception 'This change can no longer be undone here. Use the history screen.' using errcode = 'P0001';
  end if;
  perform set_config('app.audit_action', 'undo', true);
  if a.action = 'insert' then
    perform app.soft_delete(a.table_name, (a.new_data ->> 'id')::uuid);
  elsif a.action in ('update','soft_delete','restore') then
    select string_agg(quote_ident(k), ',') into v_cols from unnest(a.changed_fields) k;
    execute format('update app.%I t set (%s) = (select %s from jsonb_populate_record(null::app.%I, $1)) where t.id = $2',
      a.table_name, v_cols, v_cols, a.table_name) using a.old_data, (a.old_data ->> 'id')::uuid;
  end if;
  perform set_config('app.audit_action', '', true);
end $$;

-- Latest audit id written by me for a record (UI uses it for the Undo button)
create or replace function app.my_last_change(p_table text, p_id uuid) returns bigint
language sql stable security definer set search_path = app, public as $$
  select max(id) from app.audit_log where table_name = p_table and record_id = p_id::text and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Data Privacy Act (RA 10173) — Spec 7.10, 8.13
-- ---------------------------------------------------------------------
create table app.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references app.profiles (id),
  policy_version text not null,
  consented_at timestamptz not null default now(),
  ip text,
  user_agent text
);
alter table app.privacy_consents enable row level security;

create table app.data_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references app.profiles (id),
  customer_id uuid references app.customers (id),
  agent_id uuid references app.agents (id),
  kind text not null check (kind in ('copy','deletion')),
  status text not null default 'pending' check (status in ('pending','approved','done','rejected')),
  decided_by uuid, decided_at timestamptz,
  notes text,
  export_path text
);
select app.make_business_table('data_requests');

create or replace function app.request_my_data(p_kind text, p_notes text default null) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_id uuid; v_me app.profiles := app.me();
begin
  if v_me.id is null then raise exception 'Please log in.' using errcode = 'P0001'; end if;
  insert into app.data_requests (profile_id, customer_id, agent_id, kind, notes)
  values (v_me.id, v_me.customer_id, v_me.agent_id, p_kind, p_notes) returning id into v_id;
  perform app.notify_staff('settings', 5::smallint, 'data_request',
    case p_kind when 'copy' then 'Data copy request' else 'Data deletion request' end || ': ' || coalesce(v_me.full_name, ''),
    p_notes, '/settings/data-requests', jsonb_build_object('id', v_id));
  return v_id;
end $$;

-- Blank out personal data; keep orders/payments/commissions totals (Spec 8.13)
create or replace function app.anonymize_profile(p_profile uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare v app.profiles; v_other_users int;
begin
  select * into v from app.profiles where id = p_profile;
  if v.id is null then return; end if;
  update app.profiles set full_name = 'Deleted user', email = null, phone = null, active = false, anonymized_at = now()
  where id = p_profile;
  update app.push_subscriptions set endpoint = null, p256dh = null, auth = null, device_token = null where user_id = p_profile;
  update app.cart_items set deleted_at = now() where profile_id = p_profile and deleted_at is null;
  if v.customer_id is not null then
    update app.customer_users set deleted_at = now() where profile_id = p_profile and deleted_at is null;
    select count(*) into v_other_users from app.customer_users cu join app.profiles p on p.id = cu.profile_id
      where cu.customer_id = v.customer_id and cu.deleted_at is null and p.active;
    if v_other_users = 0 then
      update app.customers set name = 'Deleted customer ' || left(id::text, 8), contact_person = null, phone = null,
        email = null, address = null, lat = null, lng = null, permit_path = null, status = 'suspended', anonymized_at = now()
      where id = v.customer_id;
      update app.customer_addresses set address = 'Deleted', lat = null, lng = null, deleted_at = coalesce(deleted_at, now())
      where customer_id = v.customer_id;
      update app.orders set delivery_address = null, lat = null, lng = null where customer_id = v.customer_id;
    end if;
  end if;
  if v.agent_id is not null then
    update app.agents set name = 'Deleted agent ' || left(id::text, 8), phone = null, email = null, payout_name = null,
      referral_active = false, status = case when status = 'active' then 'inactive' else status end, anonymized_at = now()
    where id = v.agent_id;
  end if;
end $$;

create or replace function app.decide_data_request(p_id uuid, p_approve boolean, p_export_path text default null) returns void
language plpgsql security definer set search_path = app, public as $$
declare r app.data_requests;
begin
  if not app.can('settings', 5::smallint) then raise exception 'Only the boss can decide.' using errcode = 'P0001'; end if;
  select * into r from app.data_requests where id = p_id and status = 'pending';
  if r.id is null then raise exception 'Request not found.' using errcode = 'P0001'; end if;
  if not p_approve then
    update app.data_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_id;
    return;
  end if;
  if r.kind = 'deletion' then
    perform app.anonymize_profile(r.profile_id);
  else
    perform app.notify(r.profile_id, 'data_copy_ready', 'Your data copy is ready', null, '/account/privacy');
  end if;
  update app.data_requests set status = 'done', decided_by = auth.uid(), decided_at = now(), export_path = p_export_path where id = p_id;
end $$;
