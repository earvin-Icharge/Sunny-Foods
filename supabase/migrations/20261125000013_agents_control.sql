-- =====================================================================
-- 0013 MASTER CONTROL HELPERS + TRASH LIST (Spec 3a, 8) — builder C
-- =====================================================================

-- Copy a role (with its permissions and field switches) into a new custom role.
create or replace function app.copy_role(p_from text, p_key text, p_name text) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not (app.is_owner() or app.can('settings', 5::smallint)) then
    raise exception 'Only the Owner can create roles.' using errcode = 'P0001';
  end if;
  if p_key !~ '^[a-z][a-z0-9_]{2,30}$' then
    raise exception 'Role code: 3–31 lowercase letters, numbers or _ (start with a letter).' using errcode = 'P0001';
  end if;
  if p_from = 'owner' then raise exception 'The Owner role cannot be copied.' using errcode = 'P0001'; end if;
  if exists (select 1 from app.roles where key = p_key) then raise exception 'This role code already exists.' using errcode = 'P0001'; end if;
  insert into app.roles (key, name, area, is_builtin, is_agent_role, based_on, sort)
  select p_key, coalesce(nullif(trim(p_name), ''), p_key), area, false, is_agent_role, p_from, sort + 50
  from app.roles where key = p_from;
  if not found then raise exception 'Role to copy not found.' using errcode = 'P0001'; end if;
  insert into app.role_permissions (role_key, module, level, scope)
  select p_key, module, level, scope from app.role_permissions where role_key = p_from and deleted_at is null;
  insert into app.field_visibility (role_key, field, value)
  select p_key, field, value from app.field_visibility where role_key = p_from and deleted_at is null;
end $$;

-- Everything currently in Trash (soft-deleted), across all trash tables.
create or replace function app.trash_list()
returns table (table_name text, id uuid, label text, deleted_at timestamptz, deleted_by uuid, deleted_by_name text)
language plpgsql stable security definer set search_path = app, public as $$
declare t text;
begin
  if not (app.is_staff() and app.can('trash', 1::smallint)) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  foreach t in array array['products','categories','packaging_materials','product_packaging','tier_prices','price_tiers',
    'customers','customer_addresses','customer_prices','employee_limits','blocked_delivery_dates','orders','payments',
    'batches','vouchers','voucher_targets','agents','commission_rules','agent_targets','teams','roles'] loop
    return query execute format(
      'select %L::text, x.id, app.record_label(%L, x.id), x.deleted_at, x.deleted_by, p.full_name
       from app.%I x left join app.profiles p on p.id = x.deleted_by
       where x.deleted_at is not null', t, t, t);
  end loop;
end $$;

-- Roles cannot be soft-deleted while people still use them.
create or replace function app.guard_role_delete() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if old.is_builtin then raise exception 'Built-in roles cannot be deleted. Deactivate custom roles instead.' using errcode = 'P0001'; end if;
    if exists (select 1 from app.profiles where role_key = old.key and active and deleted_at is null) then
      raise exception 'People still have this role. Change their role first.' using errcode = 'P0001';
    end if;
  end if;
  if new.active = false and old.active and old.key = 'owner' then
    raise exception 'The Owner role cannot be deactivated.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger roles_guard_delete before update on app.roles
  for each row execute function app.guard_role_delete();
