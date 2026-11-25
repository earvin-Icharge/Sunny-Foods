-- =====================================================================
-- 0014 PORTALS: sign-up abuse guard + checkout options for the customer
-- portal and the agent portal (Spec 7.10, 7.14, 8.10)
-- =====================================================================

-- Sign-up attempts per IP (max 5 per hour, checked by the server)
create table app.signup_attempts (
  id bigserial primary key,
  ip text not null,
  email text,
  at timestamptz not null default now()
);
alter table app.signup_attempts enable row level security;   -- no policies: server (system) only
create index signup_attempts_ip_idx on app.signup_attempts (ip, at desc);

-- Can the caller order for / see checkout data of this customer?
create or replace function app.can_view_customer_checkout(p_customer uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  select p_customer = any (app.my_customer_ids())
      or (app.my_agent_id() is not null and p_customer = any (app.agent_customer_ids(app.my_agent_id())))
$$;

-- Everything the checkout screen needs, portal-safe (no internal notes, no cost).
create or replace function app.checkout_options(p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare
  c app.customers; v_area text := app.my_area(); v_addr_ok boolean;
begin
  if not app.can_view_customer_checkout(p_customer) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  select * into c from app.customers where id = p_customer;
  -- agents see address text only if Master Control allows it
  v_addr_ok := v_area = 'portal' or app.field('ag_customer') in ('address','balance');
  return jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'payment_terms', c.payment_terms,
      'allowed_payment_methods', c.allowed_payment_methods, 'default_delivery_method', c.default_delivery_method,
      'is_employee_account', c.is_employee_account,
      'address', case when v_addr_ok then c.address end),
    'addresses', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'label', a.label, 'is_default', a.is_default,
        'address', case when v_addr_ok then a.address end) order by a.is_default desc, a.label)
      from app.customer_addresses a where a.customer_id = c.id and a.deleted_at is null), '[]'::jsonb),
    'settings', jsonb_build_object(
      'min_order_amount', app.setting_num('min_order_amount', 0),
      'delivery_fees', coalesce(app.setting('delivery_fees'), '{}'::jsonb),
      'free_delivery_over', app.setting('free_delivery_over'),
      'no_delivery_weekdays', coalesce(app.setting('no_delivery_weekdays'), '[]'::jsonb),
      'time_windows', coalesce(app.setting('time_windows'), '[]'::jsonb),
      'pickup_address', app.setting('pickup_address'),
      'prices_include_vat', app.setting_bool('prices_include_vat', true),
      'today', app.today(),
      'blocked_dates', coalesce((select jsonb_agg(b.date order by b.date) from app.blocked_delivery_dates b
        where b.deleted_at is null and b.date >= app.today() and b.date <= app.today() + 180), '[]'::jsonb)),
    'vouchers', case when v_area = 'portal' or app.field('ag_act_voucher') = 'on' then app.my_vouchers(c.id) else '[]'::jsonb end,
    'employee_allowance', case when c.is_employee_account and v_area = 'portal' then app.employee_allowance(c.id) end
  );
end $$;
