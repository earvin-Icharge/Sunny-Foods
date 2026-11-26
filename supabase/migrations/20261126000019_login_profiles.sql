-- =====================================================================
-- 0019 CREATE LOGIN PROFILES in the same transaction (fix, lesson L-010)
-- Staff screens that create a record AND its login (Agents -> new agent with
-- login; Customers -> employee buyer / portal user) saved the profile through
-- a second connection that could not see the new, not-yet-saved record.
-- These functions do it inside the boss's own transaction, with the same
-- permission checks as the screens.
-- =====================================================================

-- Login profile for an agent / broker (Agents, level 5).
create or replace function app.create_agent_profile(p_user uuid, p_agent uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare a app.agents;
begin
  if not (app.is_staff() and app.can('agents', 5::smallint)) then
    raise exception 'You are not allowed to do this.' using errcode = 'P0001';
  end if;
  select * into a from app.agents where id = p_agent and deleted_at is null for update;
  if not found then raise exception 'Agent not found.' using errcode = 'P0001'; end if;
  if a.profile_id is not null then raise exception 'This agent already has a login.' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Login not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from app.profiles where id = p_user) then raise exception 'This login is already used.' using errcode = 'P0001'; end if;
  insert into app.profiles (id, full_name, email, phone, role_key, agent_id, must_change_password)
    values (p_user, a.name, a.email, a.phone, a.role_key, a.id, true);
  update app.agents set profile_id = p_user where id = a.id;
end $$;

-- Login profile for a customer company user or an employee buyer (Customers).
create or replace function app.create_portal_profile(p_user uuid, p_customer uuid, p_full_name text, p_email text,
  p_role text, p_is_employee boolean default false, p_staff_profile uuid default null, p_primary boolean default false)
returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not (app.is_staff() and app.can('customers', 2::smallint)) then
    raise exception 'You are not allowed to do this.' using errcode = 'P0001';
  end if;
  if p_staff_profile is not null and not app.can('customers', 5::smallint) then
    raise exception 'You are not allowed to do this.' using errcode = 'P0001';
  end if;
  if p_role not in ('customer', 'employee') then raise exception 'Wrong role.' using errcode = 'P0001'; end if;
  if not exists (select 1 from app.customers where id = p_customer and deleted_at is null) then
    raise exception 'Customer not found.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Login not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from app.profiles where id = p_user) then raise exception 'This login is already used.' using errcode = 'P0001'; end if;
  insert into app.profiles (id, full_name, email, role_key, customer_id, is_employee, staff_profile_id, must_change_password)
    values (p_user, p_full_name, p_email, p_role, p_customer, coalesce(p_is_employee, false), p_staff_profile, true);
  insert into app.customer_users (customer_id, profile_id, is_primary) values (p_customer, p_user, coalesce(p_primary, false));
end $$;

revoke execute on function app.create_agent_profile(uuid, uuid) from public, anon;
revoke execute on function app.create_portal_profile(uuid, uuid, text, text, text, boolean, uuid, boolean) from public, anon;
grant execute on function app.create_agent_profile(uuid, uuid) to authenticated, sf_app;
grant execute on function app.create_portal_profile(uuid, uuid, text, text, text, boolean, uuid, boolean) to authenticated, sf_app;
