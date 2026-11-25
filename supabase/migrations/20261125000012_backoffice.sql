-- =====================================================================
-- 0012 BACK-OFFICE HELPERS: customer approval, employee-rate stop,
-- stock count creation  (Spec 7.3, 7.10, 7.11)
-- =====================================================================

-- Approve / reject a pending customer sign-up. On approve: set payment
-- terms + price tier, link the referral agent (if the code matches an
-- active agent), notify the customer's users.
create or replace function app.approve_customer(p_customer uuid, p_terms text, p_tier uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = app, public as $$
declare c app.customers; v_agent uuid;
begin
  if not (app.is_staff() and app.can('customers', 3::smallint)) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  select * into c from app.customers where id = p_customer and deleted_at is null;
  if c.id is null then raise exception 'Customer not found.' using errcode = 'P0001'; end if;
  if not p_approve then
    update app.customers set status = 'rejected' where id = p_customer;
    perform app.notify_customer(p_customer, 'account_rejected', 'Your Sunny Foods account was not approved', null, '/');
    return;
  end if;
  if p_terms like 'credit_%' and app.needs_approval('credit_terms') then
    raise exception 'Only the boss can give credit terms.' using errcode = 'P0001';
  end if;
  update app.customers set status = 'approved', payment_terms = coalesce(p_terms, payment_terms),
    price_tier_id = coalesce(p_tier, price_tier_id), approved_at = now(), approved_by = auth.uid()
  where id = p_customer;
  if c.referral_code_used is not null and c.agent_id is null then
    select id into v_agent from app.agents
      where upper(referral_code) = upper(c.referral_code_used) and status = 'active' and referral_active and deleted_at is null;
    if v_agent is not null then
      insert into app.agent_customers (agent_id, customer_id, source) values (v_agent, p_customer, 'referral');
      update app.customers set agent_id = v_agent where id = p_customer;
      perform app.notify_agent(v_agent, 'referral_approved', c.name || ' was approved and linked to you', null, '/customers');
    end if;
  end if;
  perform app.notify_customer(p_customer, 'account_approved', 'Your Sunny Foods account is approved — you can order now', null, '/');
end $$;

-- When a staff profile is deactivated, its employee buyer account stops (employee rate ends).
create or replace function app.profiles_employee_stop() returns trigger
language plpgsql security definer set search_path = app, public as $$
begin
  if tg_op = 'UPDATE' and old.active and (not new.active or new.deleted_at is not null) then
    update app.customers set status = 'suspended'
      where employee_profile_id = new.id and is_employee_account and status <> 'suspended';
    update app.profiles set active = false
      where staff_profile_id = new.id and is_employee and active;
  end if;
  return new;
end $$;
create trigger profiles_employee_stop after update on app.profiles
  for each row execute function app.profiles_employee_stop();

-- Start a stock count: one line per batch with stock + one per packaging material.
create or replace function app.create_stock_count(p_notes text default null) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_id uuid;
begin
  if not (app.is_staff() and app.can('inventory', 2::smallint)) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  insert into app.stock_counts (notes) values (p_notes) returning id into v_id;
  insert into app.stock_count_lines (count_id, item_type, product_id, batch_id, system_qty)
  select v_id, 'product', s.product_id, s.batch_id, s.qty from app.v_batch_stock s
  join app.products p on p.id = s.product_id
  where s.item_type = 'product' and p.deleted_at is null and (s.qty <> 0 or p.active);
  insert into app.stock_count_lines (count_id, item_type, material_id, system_qty)
  select v_id, 'material', m.id, app.material_stock(m.id) from app.packaging_materials m
  where m.deleted_at is null and m.active;
  return v_id;
end $$;
