-- =====================================================================
-- 0009 PORTAL & AGENT READ FUNCTIONS, DASHBOARD, REPORTS, SCHEDULED JOBS
-- (Spec 7.1, 7.8, 7.10, 7.14, 2 "Scheduled jobs")
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catalog for the customer portal and agent portal: the customer's own
-- price + stock badge only (never exact quantities, never cost).
-- ---------------------------------------------------------------------
create or replace function app.portal_catalog(p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare
  v_area text := app.my_area(); c app.customers;
  v_prices text; v_stock text; v_cats jsonb; v_products text;
begin
  select * into c from app.customers where id = p_customer;
  if v_area = 'portal' then
    if not (p_customer = any (app.my_customer_ids())) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
    v_prices := case when c.status = 'approved' then 'customer' else 'hidden' end;
    v_stock := 'badge'; v_products := 'all';
  elsif v_area = 'agent' then
    if p_customer is not null and not (p_customer = any (app.agent_customer_ids(app.my_agent_id()))) then
      raise exception 'Not allowed.' using errcode = 'P0001';
    end if;
    v_prices := app.field('ag_prices'); v_stock := app.field('ag_stock'); v_products := app.field('ag_products');
    v_cats := coalesce(nullif(app.field('ag_categories'), '')::jsonb, '[]'::jsonb);
    if p_customer is null and v_prices = 'customer' then v_prices := 'regular'; end if;
  elsif v_area = 'internal' then
    v_prices := case when app.field_on('price') then 'customer' else 'hidden' end;
    v_stock := case when app.field_on('stock_qty') then 'exact' else 'badge' end; v_products := 'all';
  else
    -- not logged in / unknown: browse without prices
    v_prices := 'hidden'; v_stock := 'badge'; v_products := 'all';
  end if;

  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'sku', p.sku, 'name', p.name, 'name_zh_hans', p.name_zh_hans, 'name_zh_hant', p.name_zh_hant, 'name_tl', p.name_tl,
      'description', p.description, 'description_zh_hans', p.description_zh_hans, 'description_zh_hant', p.description_zh_hant,
      'description_tl', p.description_tl,
      'category_id', p.category_id, 'category', cat.name, 'category_zh_hans', cat.name_zh_hans, 'category_zh_hant', cat.name_zh_hant,
      'category_tl', cat.name_tl, 'category_sort', cat.sort,
      'photo_path', p.photo_path, 'unit', p.unit, 'pack_weight_g', p.pack_weight_g, 'storage', p.storage,
      'price', case v_prices when 'hidden' then null when 'regular' then p.default_price
                 else (select unit_price from app.price_for(p_customer, p.id)) end,
      'regular_price', case when v_prices = 'hidden' then null else p.default_price end,
      'stock_badge', case when v_stock = 'hidden' then null else app.stock_badge(p.id) end,
      'stock_qty', case when v_stock = 'exact' then app.product_stock(p.id) - app.product_reserved(p.id) end
    ) order by cat.sort, p.name)
    from app.products p left join app.categories cat on cat.id = p.category_id
    where p.active and p.deleted_at is null and p.archived_at is null
      and (v_products = 'all' or p.category_id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_cats) x))
  ), '[]'::jsonb);
end $$;

-- Public (not logged in) browse — no prices (Spec 13: unapproved can browse without prices)
create or replace function app.public_catalog() returns jsonb
language sql stable security definer set search_path = app, public as $$
  select app.portal_catalog(null)
$$;

-- Portal: my company + balance + payment history
create or replace function app.portal_account(p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare c app.customers;
begin
  if not (p_customer = any (app.my_customer_ids())) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  select * into c from app.customers where id = p_customer;
  return jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'business_type', c.business_type, 'contact_person', c.contact_person,
      'phone', c.phone, 'email', c.email, 'address', c.address, 'lat', c.lat, 'lng', c.lng, 'status', c.status,
      'payment_terms', c.payment_terms, 'allowed_payment_methods', c.allowed_payment_methods,
      'default_delivery_method', c.default_delivery_method, 'is_employee_account', c.is_employee_account),
    'balance', app.customer_balance(c.id),
    'addresses', coalesce((select jsonb_agg(to_jsonb(a) - 'created_by' - 'deleted_by' order by a.is_default desc, a.label)
       from app.customer_addresses a where a.customer_id = c.id and a.deleted_at is null), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'is_primary', cu.is_primary))
       from app.customer_users cu join app.profiles p on p.id = cu.profile_id where cu.customer_id = c.id and cu.deleted_at is null), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', pm.id, 'order_no', o.order_no, 'amount', pm.amount, 'method', pm.method,
        'paid_at', pm.paid_at, 'reference', pm.reference) order by pm.paid_at desc)
       from app.payments pm join app.orders o on o.id = pm.order_id where pm.customer_id = c.id and pm.deleted_at is null), '[]'::jsonb),
    'proofs', coalesce((select jsonb_agg(jsonb_build_object('id', pp.id, 'amount', pp.amount, 'method', pp.method, 'status', pp.status,
        'created_at', pp.created_at, 'review_note', pp.review_note) order by pp.created_at desc)
       from app.payment_proofs pp where pp.customer_id = c.id and pp.deleted_at is null), '[]'::jsonb),
    'employee_allowance', case when c.is_employee_account then app.employee_allowance(c.id) end,
    'my_vouchers', app.my_vouchers(c.id)
  );
end $$;

-- Vouchers assigned to this customer ("My vouchers")
create or replace function app.my_vouchers(p_customer uuid) returns jsonb
language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'code', v.code, 'type', v.type, 'value', v.value,
    'value_kind', v.value_kind, 'min_order', v.min_order, 'end_at', v.end_at, 'max_discount', v.max_discount)), '[]'::jsonb)
  from app.vouchers v
  where v.code is not null and v.active and not v.paused and v.deleted_at is null and v.archived_at is null
    and v.start_at <= now() and (v.end_at is null or v.end_at > now())
    and (p_customer = any (app.my_customer_ids()) or app.is_staff()
         or (app.my_agent_id() is not null and p_customer = any (app.agent_customer_ids(app.my_agent_id()))))
    and (v.audience = 'selected' and exists (select 1 from app.voucher_targets t where t.voucher_id = v.id and t.target_type = 'customer'
          and t.target_id = p_customer and t.deleted_at is null)
      or v.audience = 'tier' and v.tier_id = (select price_tier_id from app.customers where id = p_customer)
      or v.audience = 'employees' and (select is_employee_account from app.customers where id = p_customer))
$$;

-- Update my company info (portal)
create or replace function app.portal_update_company(p_customer uuid, p jsonb) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not (p_customer = any (app.my_customer_ids())) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  update app.customers set
    contact_person = coalesce(p ->> 'contact_person', contact_person),
    phone = coalesce(p ->> 'phone', phone),
    email = coalesce(p ->> 'email', email),
    address = coalesce(p ->> 'address', address),
    lat = coalesce(nullif(p ->> 'lat', '')::numeric, lat), lng = coalesce(nullif(p ->> 'lng', '')::numeric, lng)
  where id = p_customer;
end $$;

-- ---------------------------------------------------------------------
-- AGENT PORTAL (Spec 7.14) — only fields Master Control allows (Spec 8.12)
-- ---------------------------------------------------------------------
create or replace function app.agent_me() returns app.agents
language sql stable security definer set search_path = app, public as $$
  select a.* from app.agents a join app.profiles p on p.agent_id = a.id where p.id = auth.uid() and p.active and a.deleted_at is null
$$;

create or replace function app.agent_home() returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare a app.agents := app.agent_me(); v_sales numeric; v_target numeric; v_next date;
begin
  if a.id is null then raise exception 'Not an agent.' using errcode = 'P0001'; end if;
  select coalesce(sum(o.commission_base), 0) into v_sales from app.orders o
    where o.deleted_at is null and o.status <> 'cancelled'
      and date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')
      and (o.agent_id = a.id or o.customer_id = any (app.agent_customer_ids(a.id)));
  select target_amount into v_target from app.agent_targets where agent_id = a.id and deleted_at is null
    and month = date_trunc('month', now() at time zone 'Asia/Manila')::date;
  v_next := case when extract(day from app.today()) <= 15 then date_trunc('month', app.today())::date + 15
                 else (date_trunc('month', app.today()) + interval '1 month')::date end;
  return jsonb_build_object(
    'agent', jsonb_build_object('id', a.id, 'name', a.name, 'type', a.type, 'status', a.status, 'referral_code', a.referral_code,
       'referral_active', a.referral_active, 'last_working_day', a.last_working_day,
       'read_only', a.status = 'resigned' and a.last_working_day < app.today()),
    'month_sales', v_sales,
    'commission_earned', (select coalesce(sum(amount), 0) from app.commissions where agent_id = a.id and status in ('earned','approved')
       and date_trunc('month', earned_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')),
    'commission_pending', (select coalesce(sum(amount), 0) from app.commissions where agent_id = a.id and status = 'pending'),
    'commission_unpaid', (select coalesce(sum(amount), 0) from app.commissions where agent_id = a.id and status in ('earned','approved')),
    'next_payout_date', v_next,
    'target', v_target,
    'permissions', jsonb_build_object('order', app.field('ag_act_order'), 'refer', app.field('ag_act_refer'),
       'voucher', app.field('ag_act_voucher'), 'reports', app.field('ag_act_reports'), 'leaderboard', app.field('ag_leaderboard'),
       'customer', app.field('ag_customer'), 'orders', app.field('ag_orders'), 'commission', app.field('ag_commission'),
       'prices', app.field('ag_prices'), 'stock', app.field('ag_stock'))
  );
end $$;

create or replace function app.agent_customers_list() returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare a app.agents := app.agent_me(); v_lvl text := app.field('ag_customer');
begin
  if a.id is null then raise exception 'Not an agent.' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'business_type', c.business_type, 'status', c.status,
      'contact_person', case when v_lvl in ('contact','address','balance') then c.contact_person end,
      'phone', case when v_lvl in ('contact','address','balance') then c.phone end,
      'address', case when v_lvl in ('address','balance') then c.address end,
      'balance', case when v_lvl = 'balance' then app.customer_balance(c.id) end,
      'last_order_at', (select max(created_at) from app.orders o where o.customer_id = c.id and o.deleted_at is null and o.status <> 'cancelled'),
      'month_sales', (select coalesce(sum(commission_base), 0) from app.orders o where o.customer_id = c.id and o.deleted_at is null
          and o.status <> 'cancelled' and date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')),
      'inactive_30', coalesce((select max(created_at) from app.orders o where o.customer_id = c.id and o.deleted_at is null
          and o.status <> 'cancelled') < now() - interval '30 days', true)
    ) order by c.name)
    from app.customers c where c.id = any (app.agent_customer_ids(a.id)) and c.deleted_at is null), '[]'::jsonb);
end $$;

create or replace function app.agent_orders(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare a app.agents := app.agent_me(); v_full boolean := app.field('ag_orders') = 'full';
begin
  if a.id is null then raise exception 'Not an agent.' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_no', o.order_no, 'customer_id', o.customer_id, 'customer_name', c.name, 'status', o.status,
      'source', o.source, 'delivery_date', o.delivery_date, 'created_at', o.created_at, 'payment_status', o.payment_status,
      'total', case when v_full then o.total end,
      'items', case when v_full then (select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'qty', i.qty, 'unit', i.unit,
          'line_total', i.line_total, 'is_free', i.is_free) order by i.sort) from app.order_items i where i.order_id = o.id and i.deleted_at is null) end
    ) order by o.created_at desc)
    from app.orders o join app.customers c on c.id = o.customer_id
    where o.deleted_at is null and (o.agent_id = a.id or o.customer_id = any (app.agent_customer_ids(a.id)))
      and (p_month is null or date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', p_month))), '[]'::jsonb);
end $$;

create or replace function app.agent_commissions(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare a app.agents := app.agent_me(); v_breakdown boolean := app.field('ag_commission') = 'breakdown';
begin
  if a.id is null then raise exception 'Not an agent.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', cm.id, 'order_no', o.order_no, 'customer_name', c.name,
        'created_at', cm.created_at, 'status', cm.status, 'amount', cm.amount, 'void_reason', cm.void_reason,
        'base_amount', case when v_breakdown then cm.base_amount end,
        'rate', case when v_breakdown then cm.rate end, 'rate_kind', case when v_breakdown then cm.rate_kind end,
        'share_pct', case when v_breakdown then cm.share_pct end,
        'transferred', cm.transferred_from_agent_id is not null) order by cm.created_at desc)
      from app.commissions cm join app.orders o on o.id = cm.order_id join app.customers c on c.id = cm.customer_id
      where cm.agent_id = a.id and (p_month is null or date_trunc('month', cm.created_at at time zone 'Asia/Manila') = date_trunc('month', p_month))), '[]'::jsonb),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('id', ad.id, 'amount', ad.amount, 'reason', ad.reason, 'status', ad.status,
        'created_at', ad.created_at) order by ad.created_at desc)
      from app.commission_adjustments ad where ad.agent_id = a.id and ad.status <> 'voided'), '[]'::jsonb));
end $$;

create or replace function app.agent_payouts() returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare a app.agents := app.agent_me();
begin
  if a.id is null then raise exception 'Not an agent.' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'period_start', p.period_start, 'period_end', p.period_end,
      'gross', p.gross, 'adjustments', p.adjustments, 'net', p.net, 'paid_at', p.paid_at, 'method', p.method,
      'reference', p.reference, 'proof_path', p.proof_path) order by p.paid_at desc)
    from app.commission_payouts p where p.agent_id = a.id and p.status = 'paid'), '[]'::jsonb);
end $$;

create or replace function app.agent_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare a app.agents := app.agent_me(); v_mode text := app.field('ag_leaderboard'); v jsonb;
begin
  if a.id is null or v_mode = 'hidden' then return '[]'::jsonb; end if;
  with sales as (
    select ag.id, ag.name, coalesce(sum(o.commission_base), 0) as sales
    from app.agents ag
    left join app.orders o on o.agent_id = ag.id and o.deleted_at is null and o.status <> 'cancelled'
      and date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')
    where ag.status = 'active' and ag.deleted_at is null
    group by ag.id),
  ranked as (select *, rank() over (order by sales desc) as rnk from sales)
  select jsonb_agg(jsonb_build_object('rank', rnk, 'name', case when v_mode = 'full' or id = a.id then name end,
     'sales', case when v_mode = 'full' or id = a.id then sales end, 'me', id = a.id) order by rnk)
  into v from ranked where v_mode = 'full' or id = a.id;
  return coalesce(v, '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- DASHBOARD (Spec 7.1)
-- ---------------------------------------------------------------------
create or replace function app.dashboard() returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare v_days int := app.setting_num('expiry_alert_days', 14)::int; v_driver boolean := app.scope('deliveries') = 'own';
begin
  if not app.is_staff() then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'to_pack', (select count(*) from app.orders where deleted_at is null and status in ('confirmed','packing')),
    'new_orders', (select count(*) from app.orders where deleted_at is null and status = 'new'),
    'to_deliver', (select count(*) from app.orders o where o.deleted_at is null and o.status in ('packed','out_for_delivery')
        and (not v_driver or exists (select 1 from app.deliveries d where d.order_id = o.id and d.driver_id = auth.uid()))),
    'unpaid_amount', case when app.field_on('customer_balance') or app.field_on('payment_details') then
        (select coalesce(sum(total - paid_amount), 0) from app.orders where deleted_at is null and status <> 'cancelled' and payment_status <> 'paid') end,
    'today_sales', case when app.field_on('sales_totals') then
        (select coalesce(sum(total), 0) from app.orders where deleted_at is null and status <> 'cancelled'
          and (created_at at time zone 'Asia/Manila')::date = app.today()) end,
    'low_stock', case when app.can('inventory', 1::smallint) or app.can('products', 1::smallint) then coalesce((
        select jsonb_agg(jsonb_build_object('type', 'product', 'id', p.id, 'name', p.name, 'qty', case when app.field_on('stock_qty') then app.product_stock(p.id) end, 'level', p.low_stock_level))
        from app.products p where p.active and p.deleted_at is null and p.low_stock_level > 0 and app.product_stock(p.id) <= p.low_stock_level), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('type', 'material', 'id', m.id, 'name', m.name, 'qty', case when app.field_on('stock_qty') then app.material_stock(m.id) end, 'level', m.low_stock_level))
        from app.packaging_materials m where m.active and m.deleted_at is null and m.low_stock_level > 0 and app.material_stock(m.id) <= m.low_stock_level), '[]'::jsonb) end,
    'expiring', case when app.can('inventory', 1::smallint) then coalesce((
        select jsonb_agg(jsonb_build_object('batch_id', s.batch_id, 'batch_no', s.batch_no, 'product', p.name, 'expiry_date', s.expiry_date,
          'qty', case when app.field_on('stock_qty') then s.qty end, 'location', s.location) order by s.expiry_date)
        from app.v_batch_stock s join app.products p on p.id = s.product_id
        where s.qty > 0 and s.expiry_date is not null and s.expiry_date <= app.today() + v_days), '[]'::jsonb) end,
    'overdue', case when app.can('payments', 1::smallint) and app.scope('payments') = 'all' then coalesce((
        select jsonb_agg(jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'customer', c.name, 'due_date', o.due_date,
          'balance', case when app.field_on('customer_balance') then o.total - o.paid_amount end) order by o.due_date)
        from app.orders o join app.customers c on c.id = o.customer_id
        where o.deleted_at is null and o.payment_status = 'overdue'), '[]'::jsonb) end,
    'pending_customers', case when app.can('customers', 3::smallint) then
        (select count(*) from app.customers where status = 'pending' and deleted_at is null) end,
    'pending_proofs', case when app.can('payments', 3::smallint) then
        (select count(*) from app.payment_proofs where status = 'pending' and deleted_at is null) end,
    'pending_deletes', case when app.can('trash', 5::smallint) then
        (select count(*) from app.delete_requests where status = 'pending' and deleted_at is null) end,
    'flagged_discounts', case when app.can('orders', 5::smallint) then
        (select count(*) from app.orders where manual_discount_flagged and deleted_at is null and status <> 'cancelled') end
  );
end $$;

-- ---------------------------------------------------------------------
-- REPORTS (Spec 7.8). Rows as jsonb; the app exports them to Excel.
-- ---------------------------------------------------------------------
create or replace function app.assert_reports() returns void
language plpgsql stable as $$
begin
  if not (app.is_staff() and app.can('reports', 1::smallint) and app.field_on('sales_totals')) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
end $$;

create or replace function app.report(p_kind text, p_from date, p_to date, p_group text default 'day') returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare v jsonb;
begin
  perform app.assert_reports();
  if p_kind = 'sales_by_period' then
    select jsonb_agg(r order by r.period) into v from (
      select to_char(date_trunc(p_group, o.created_at at time zone 'Asia/Manila'), 'YYYY-MM-DD') as period,
        count(*) as orders, sum(o.subtotal) as subtotal, sum(o.tier_discount + o.voucher_discount + o.manual_discount) as discounts,
        sum(o.delivery_fee) as delivery_fees, sum(o.vat_amount) as vat, sum(o.total) as total
      from app.orders o where o.deleted_at is null and o.status <> 'cancelled'
        and (o.created_at at time zone 'Asia/Manila')::date between p_from and p_to
      group by 1) r;
  elsif p_kind = 'sales_by_product' then
    select jsonb_agg(r order by r.net desc) into v from (
      select i.sku, i.product_name as product, sum(i.qty) as qty, sum(i.net_amount) as net,
        case when app.field_on('cost') then sum(i.qty * coalesce(p.cost, 0)) end as cost,
        case when app.field_on('cost') then sum(i.net_amount) - sum(i.qty * coalesce(p.cost, 0)) end as margin
      from app.order_items i join app.orders o on o.id = i.order_id join app.products p on p.id = i.product_id
      where o.deleted_at is null and i.deleted_at is null and o.status <> 'cancelled'
        and (o.created_at at time zone 'Asia/Manila')::date between p_from and p_to
      group by i.sku, i.product_name) r;
  elsif p_kind = 'sales_by_customer' then
    select jsonb_agg(r order by r.total desc) into v from (
      select c.name as customer, count(*) as orders, sum(o.total) as total, sum(o.total - o.paid_amount) as unpaid
      from app.orders o join app.customers c on c.id = o.customer_id
      where o.deleted_at is null and o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Manila')::date between p_from and p_to
      group by c.name) r;
  elsif p_kind = 'sales_by_agent' then
    select jsonb_agg(r order by r.sales desc) into v from (
      select coalesce(a.name, 'House (no agent)') as agent, count(*) as orders, sum(o.commission_base) as sales, sum(o.total) as total
      from app.orders o left join app.agents a on a.id = o.agent_id
      where o.deleted_at is null and o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Manila')::date between p_from and p_to
      group by a.name) r;
  elsif p_kind = 'discounts' then
    select jsonb_agg(r order by r.month, r.amount desc) into v from (
      select to_char(date_trunc('month', o.created_at at time zone 'Asia/Manila'), 'YYYY-MM') as month, d.kind,
        d.label, d.code, count(*) as uses, sum(d.amount) as amount
      from app.order_discounts d join app.orders o on o.id = d.order_id
      where d.deleted_at is null and o.deleted_at is null and o.status <> 'cancelled'
        and (o.created_at at time zone 'Asia/Manila')::date between p_from and p_to
      group by 1, d.kind, d.label, d.code) r;
  elsif p_kind = 'employee_purchases' then
    select jsonb_agg(r order by r.employee) into v from (
      select c.name as employee, coalesce(p.full_name, '') as staff_profile, count(*) as orders, sum(o.total) as total,
        sum(case when o.payment_method = 'salary_deduction' then o.total - o.paid_amount else 0 end) as salary_deduction
      from app.orders o join app.customers c on c.id = o.customer_id left join app.profiles p on p.id = c.employee_profile_id
      where c.is_employee_account and o.deleted_at is null and o.status <> 'cancelled'
        and (o.created_at at time zone 'Asia/Manila')::date between p_from and p_to
      group by c.name, p.full_name) r;
  elsif p_kind = 'commissions' then
    select jsonb_agg(r order by r.agent) into v from (
      select a.name as agent,
        sum(cm.amount) filter (where cm.status = 'pending') as pending,
        sum(cm.amount) filter (where cm.status = 'earned') as earned,
        sum(cm.amount) filter (where cm.status = 'approved') as approved,
        sum(cm.amount) filter (where cm.status = 'paid') as paid,
        sum(cm.amount) filter (where cm.status = 'voided') as voided
      from app.commissions cm join app.agents a on a.id = cm.agent_id
      where (cm.created_at at time zone 'Asia/Manila')::date between p_from and p_to
      group by a.name) r;
  elsif p_kind = 'unpaid' then
    select jsonb_agg(r order by r.due_date nulls last) into v from (
      select o.order_no, c.name as customer, o.total, o.paid_amount, o.total - o.paid_amount as balance, o.payment_status,
        o.payment_method, o.due_date, o.delivered_at::date as delivered
      from app.orders o join app.customers c on c.id = o.customer_id
      where o.deleted_at is null and o.status <> 'cancelled' and o.payment_status <> 'paid') r;
  elsif p_kind = 'stock' then
    select jsonb_agg(r order by r.type, r.name) into v from (
      select 'product' as type, p.sku as code, p.name, app.product_stock(p.id) as qty, p.unit,
        case when app.field_on('cost') then app.product_stock(p.id) * coalesce(p.cost, 0) end as stock_value
      from app.products p where p.deleted_at is null
      union all
      select 'material', m.code, m.name, app.material_stock(m.id), m.unit,
        case when app.field_on('cost') then app.material_stock(m.id) * coalesce(m.cost, 0) end
      from app.packaging_materials m where m.deleted_at is null) r;
  elsif p_kind = 'spoilage' then
    select jsonb_agg(r order by r.date desc) into v from (
      select (sm.created_at at time zone 'Asia/Manila')::date as date, coalesce(p.name, m.name) as item, sm.qty, sm.reason,
        b.batch_no, case when app.field_on('cost') then -sm.qty * coalesce(p.cost, m.cost, 0) end as value
      from app.stock_movements sm left join app.products p on p.id = sm.product_id
        left join app.packaging_materials m on m.id = sm.material_id left join app.batches b on b.id = sm.batch_id
      where sm.kind = 'spoilage' and sm.status = 'posted' and (sm.created_at at time zone 'Asia/Manila')::date between p_from and p_to) r;
  else
    raise exception 'Unknown report.' using errcode = 'P0001';
  end if;
  return coalesce(v, '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- SCHEDULED JOBS (run by Supabase Cron; safe to run any time)
-- ---------------------------------------------------------------------
create or replace function app.job_mark_overdue() returns int
language plpgsql security definer set search_path = app, public as $$
declare r record; n int := 0;
begin
  for r in select o.id, o.order_no, o.customer_id from app.orders o
           where o.deleted_at is null and o.status <> 'cancelled' and o.payment_status in ('unpaid','partial')
             and o.due_date is not null and o.due_date < app.today() loop
    update app.orders set payment_status = 'overdue' where id = r.id;
    perform app.notify_staff('payments', 1::smallint, 'payment_overdue', 'Payment overdue: ' || r.order_no, null, '/orders/' || r.id);
    perform app.notify_customer(r.customer_id, 'payment_overdue', 'Payment overdue: ' || r.order_no, null, '/orders/' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- one alert per item per day
create or replace function app.notify_staff_once(p_module text, p_kind text, p_key text, p_title text, p_link text) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if exists (select 1 from app.notifications where kind = p_kind and data ->> 'key' = p_key
             and created_at > now() - interval '20 hours') then return; end if;
  perform app.notify_staff(p_module, 1::smallint, p_kind, p_title, null, p_link, jsonb_build_object('key', p_key));
end $$;

create or replace function app.job_stock_alerts() returns void
language plpgsql security definer set search_path = app, public as $$
declare r record; v_days int := app.setting_num('expiry_alert_days', 14)::int;
begin
  for r in select p.id, p.name from app.products p where p.active and p.deleted_at is null and p.low_stock_level > 0
           and app.product_stock(p.id) <= p.low_stock_level loop
    perform app.notify_staff_once('inventory', 'low_stock', 'p:' || r.id, 'Low stock: ' || r.name, '/inventory');
  end loop;
  for r in select m.id, m.name from app.packaging_materials m where m.active and m.deleted_at is null and m.low_stock_level > 0
           and app.material_stock(m.id) <= m.low_stock_level loop
    perform app.notify_staff_once('inventory', 'low_stock', 'm:' || r.id, 'Low packaging stock: ' || r.name, '/inventory');
  end loop;
  for r in select s.batch_id, s.batch_no, p.name, s.expiry_date from app.v_batch_stock s join app.products p on p.id = s.product_id
           where s.qty > 0 and s.expiry_date <= app.today() + v_days loop
    perform app.notify_staff_once('inventory', 'batch_expiring', 'b:' || r.batch_id,
      'Batch ' || r.batch_no || ' (' || r.name || ') expires ' || to_char(r.expiry_date, 'Mon DD'), '/inventory/batches');
  end loop;
end $$;

create or replace function app.job_voucher_alerts() returns void
language plpgsql security definer set search_path = app, public as $$
declare r record;
begin
  for r in select v.id, v.name, v.end_at, v.total_limit,
             (select count(*) from app.voucher_redemptions x where x.voucher_id = v.id and x.status = 'active') as used
           from app.vouchers v where v.active and not v.paused and v.deleted_at is null and v.archived_at is null loop
    if r.end_at is not null and r.end_at between now() and now() + interval '3 days' then
      perform app.notify_staff_once('vouchers', 'voucher_expiring', 'v:' || r.id, 'Voucher ending soon: ' || r.name, '/vouchers/' || r.id);
    end if;
    if r.total_limit is not null and r.used >= r.total_limit * 0.9 then
      perform app.notify_staff_once('vouchers', 'voucher_running_out', 'vr:' || r.id, 'Voucher almost used up: ' || r.name, '/vouchers/' || r.id);
    end if;
  end loop;
end $$;

create or replace function app.job_lock_agents() returns int
language plpgsql security definer set search_path = app, public as $$
declare n int;
begin
  update app.agents set portal_locked_at = now(), referral_active = false
  where status = 'resigned' and portal_locked_at is null and last_working_day is not null
    and last_working_day + app.setting_num('agent_portal_readonly_days', 60)::int < app.today();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.run_daily_jobs() returns void
language plpgsql security definer set search_path = app, public as $$
begin
  perform app.job_mark_overdue();
  perform app.job_stock_alerts();
  perform app.job_voucher_alerts();
  perform app.job_lock_agents();
end $$;

revoke execute on function app.run_daily_jobs() from public, authenticated;
revoke execute on function app.job_mark_overdue() from public, authenticated;
revoke execute on function app.job_stock_alerts() from public, authenticated;
revoke execute on function app.job_voucher_alerts() from public, authenticated;
revoke execute on function app.job_lock_agents() from public, authenticated;
revoke execute on function app.notify_staff_once(text, text, text, text, text) from public, authenticated;

-- Schedule with Supabase Cron when available (not available on a plain local Postgres).
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
      perform cron.schedule('sunny-daily-jobs', '5 16 * * *', 'select app.run_daily_jobs()');        -- 00:05 Manila
      perform cron.schedule('sunny-stock-alerts', '0 */4 * * *', 'select app.job_stock_alerts()');  -- every 4 hours
    exception when others then
      raise notice 'Supabase Cron not set up (%). The Vercel daily job /api/cron/daily runs the same work.', sqlerrm;
    end;
  end if;
end $cron$;
