-- =====================================================================
-- 0017 SELF SIGN-UP for staff and agents (decision D1, changed 2026-11-26)
-- Staff (app.) and agents (agent.) sign up themselves, confirm their email
-- with a 6-digit code, and stay locked until the boss approves and picks
-- their role. No profile exists until approval, so a pending person can
-- never open any screen. Customers sign up through the portal (0014).
-- =====================================================================

create table app.signup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id),
  area text not null check (area in ('internal','agent')),
  full_name text not null,
  email text not null,
  phone text,
  note text,                          -- staff: job / team in their own words
  agent_type text check (agent_type in ('agent','broker')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  email_confirmed_at timestamptz,     -- set when they first log in after the email code
  decided_by uuid references app.profiles (id),
  decided_at timestamptz,
  reason text,                        -- rejection reason (shown to the boss only)
  ip text
);
select app.make_business_table('signup_requests');
create index signup_requests_pending_idx on app.signup_requests (area, status, created_at desc);

-- Who may see / decide: staff requests -> Settings level 3 (same as creating staff
-- accounts); agent requests -> Agents level 5 (same as creating agent logins).
-- The person may see their own request. Inserts are done by the server only.
create or replace function app.can_decide_signup(p_area text) returns boolean
language sql stable set search_path = app, public as $$
  select case p_area when 'internal' then app.can('settings', 3::smallint)
                     when 'agent' then app.can('agents', 5::smallint) else false end
$$;

create policy signup_requests_read on app.signup_requests for select to authenticated
  using (user_id = auth.uid() or app.can_decide_signup(area));
create policy signup_requests_decide on app.signup_requests for update to authenticated
  using (app.can_decide_signup(area)) with check (app.can_decide_signup(area));

grant select, update on app.signup_requests to authenticated;
grant all on app.signup_requests to sf_app;
grant execute on function app.can_decide_signup(text) to authenticated, sf_app;

-- First login after the email code: mark confirmed and tell the approvers (once).
create or replace function app.signup_confirmed(p_user uuid) returns text
language plpgsql security definer set search_path = app, public as $$
declare r app.signup_requests;
begin
  select * into r from app.signup_requests where user_id = p_user and deleted_at is null;
  if not found then return null; end if;
  if r.status = 'pending' and r.email_confirmed_at is null then
    update app.signup_requests set email_confirmed_at = now() where id = r.id;
    perform app.notify_staff(
      case r.area when 'internal' then 'settings' else 'agents' end,
      case r.area when 'internal' then 3 else 5 end::smallint,
      'signup_request',
      case r.area when 'internal' then 'New staff sign-up: ' else 'New agent sign-up: ' end || r.full_name,
      r.email, '/signup-requests', jsonb_build_object('request_id', r.id));
  end if;
  return r.status;
end $$;
revoke execute on function app.signup_confirmed(uuid) from public, authenticated;
grant execute on function app.signup_confirmed(uuid) to sf_app;
