-- =====================================================================
-- 0018 APPROVE A SIGN-UP in one database step (fix for 0017's screen)
-- The approval creates the profile (and for agents the agent record) and the
-- privacy consent together. Doing part of it in a second connection failed:
-- the second step could not see the not-yet-saved profile (lesson L-010).
-- =====================================================================

create or replace function app.approve_signup(p_request uuid, p_role text, p_team uuid default null,
  p_rate_kind text default 'percent', p_rate numeric default 0) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare r app.signup_requests; v_area text; v_agent uuid; v_base text; v_code text;
begin
  select * into r from app.signup_requests where id = p_request and deleted_at is null for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0001'; end if;
  if not app.can_decide_signup(r.area) then raise exception 'You are not allowed to do this.' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'This request was already decided.' using errcode = 'P0001'; end if;
  if r.email_confirmed_at is null then raise exception 'They have not confirmed their email yet.' using errcode = 'P0001'; end if;
  select area into v_area from app.roles where key = p_role and active and deleted_at is null;
  if v_area is distinct from r.area then raise exception 'Choose a role for this app.' using errcode = 'P0001'; end if;
  if exists (select 1 from app.profiles where id = r.user_id) then raise exception 'This person already has an account.' using errcode = 'P0001'; end if;

  if r.area = 'internal' then
    if p_team is not null and not exists (select 1 from app.teams where id = p_team and deleted_at is null) then
      raise exception 'Team not found.' using errcode = 'P0001';
    end if;
    -- the profile guard trigger still applies (e.g. an Admin cannot create an Owner)
    insert into app.profiles (id, full_name, email, phone, role_key, team_id)
      values (r.user_id, r.full_name, r.email, r.phone, p_role, p_team);
  else
    v_base := 'AG-' || left(regexp_replace(upper(split_part(trim(r.full_name), ' ', 1)), '[^A-Z0-9]', '', 'g'), 10);
    v_code := v_base;
    while exists (select 1 from app.agents where referral_code = v_code) loop
      v_code := v_base || '-' || (100 + floor(random() * 900))::int;
    end loop;
    insert into app.agents (name, type, role_key, phone, email, referral_code, default_rate_kind, default_rate)
      values (r.full_name, case when p_role = 'broker' then 'broker' else 'agent' end, p_role, r.phone, r.email, v_code,
              case when p_rate_kind = 'fixed' then 'fixed' else 'percent' end, greatest(coalesce(p_rate, 0), 0))
      returning id into v_agent;
    -- agent first, then the profile pointing to it, then link back (foreign key order, L-007)
    insert into app.profiles (id, full_name, email, phone, role_key, agent_id)
      values (r.user_id, r.full_name, r.email, r.phone, p_role, v_agent);
    update app.agents set profile_id = r.user_id where id = v_agent;
  end if;

  -- they ticked the privacy consent box when signing up
  insert into app.privacy_consents (profile_id, policy_version, ip, user_agent)
    values (r.user_id, coalesce(app.setting('privacy_policy_version') #>> '{}', 'unknown'), r.ip, 'self sign-up');
  update app.signup_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = r.id;
  return r.user_id;
end $$;
revoke execute on function app.approve_signup(uuid, text, uuid, text, numeric) from public, anon;
grant execute on function app.approve_signup(uuid, text, uuid, text, numeric) to authenticated, sf_app;
