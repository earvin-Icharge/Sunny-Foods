-- =====================================================================
-- 0007 MONEY & ORDER LOGIC — calculated in the database only (Spec 8.11)
-- prices (7.11), vouchers (7.12), VAT (7.5 / D4), employee limits,
-- place/edit orders, status flow, packing (7.6), deliveries (7.7),
-- payments, commissions (7.13).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Who am I linked to?
-- ---------------------------------------------------------------------
create or replace function app.my_customer_ids() returns uuid[]
language sql stable security definer set search_path = app, public as $$
  select coalesce(array_agg(cu.customer_id), '{}') from app.customer_users cu
  join app.profiles p on p.id = cu.profile_id
  where cu.profile_id = auth.uid() and cu.deleted_at is null and p.active
$$;

create or replace function app.my_agent_id() returns uuid
language sql stable security definer set search_path = app, public as $$
  select p.agent_id from app.profiles p join app.agents a on a.id = p.agent_id
  where p.id = auth.uid() and p.active and a.deleted_at is null and a.portal_locked_at is null
$$;

-- Customers currently linked to an agent (active link today, or keep-paying)
create or replace function app.agent_customer_ids(p_agent uuid) returns uuid[]
language sql stable security definer set search_path = app, public as $$
  select coalesce(array_agg(distinct customer_id), '{}') from app.agent_customers
  where agent_id = p_agent and deleted_at is null
    and start_date <= (now() at time zone 'Asia/Manila')::date
    and (end_date is null or end_date >= (now() at time zone 'Asia/Manila')::date)
$$;

-- Customers an agent ever had (for read-only history after transfer)
create or replace function app.agent_all_customer_ids(p_agent uuid) returns uuid[]
language sql stable security definer set search_path = app, public as $$
  select coalesce(array_agg(distinct customer_id), '{}') from app.agent_customers
  where agent_id = p_agent and deleted_at is null
$$;

create or replace function app.today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

-- ---------------------------------------------------------------------
-- Price used on an order: special -> tier -> regular (Spec 7.11)
-- ---------------------------------------------------------------------
create or replace function app.price_for(p_customer uuid, p_product uuid,
  out unit_price numeric, out regular_price numeric, out source text, out tier_name text)
language plpgsql stable security definer set search_path = app, public as $$
declare
  c app.customers; t app.price_tiers; v numeric; v_regular numeric;
begin
  select default_price into v_regular from app.products where id = p_product;
  regular_price := v_regular;
  select price into v from app.customer_prices
    where customer_id = p_customer and product_id = p_product and deleted_at is null;
  if v is not null then unit_price := v; source := 'special'; tier_name := 'Special price'; return; end if;
  select * into c from app.customers where id = p_customer;
  if c.price_tier_id is not null then
    select * into t from app.price_tiers where id = c.price_tier_id and active and deleted_at is null;
  elsif c.is_employee_account then
    select * into t from app.price_tiers where key = 'employee' and active and deleted_at is null;
  end if;
  if t.id is not null and t.key <> 'regular' then
    select price into v from app.tier_prices where tier_id = t.id and product_id = p_product and deleted_at is null;
    if v is not null then unit_price := v;
    elsif t.percent_off > 0 then unit_price := round(v_regular * (1 - t.percent_off / 100), 2);
    end if;
    if unit_price is not null then
      source := case when t.key = 'employee' then 'employee' else 'tier' end;
      tier_name := case when t.key = 'employee' then 'Employee rate' else t.name end;
      return;
    end if;
  end if;
  unit_price := v_regular; source := 'regular'; tier_name := null;
end $$;

-- ---------------------------------------------------------------------
-- Voucher check (Spec 7.12). Returns jsonb:
-- {ok, reason, voucher_id, code, label, type, stackable, discount,
--  product_discounts {product_id: amount}, free_lines [{product_id, qty}], free_delivery}
-- ---------------------------------------------------------------------
create or replace function app.eval_voucher(p_voucher uuid, p_customer uuid, p_lines jsonb,
  p_items_total numeric, p_delivery_fee numeric, p_order uuid default null) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare
  v app.vouchers; c app.customers;
  v_used int; v_disc numeric := 0; v_pd jsonb := '{}'::jsonb; v_free jsonb := '[]'::jsonb;
  v_eligible numeric; v_buy numeric; v_sets numeric; v_label text;
  res jsonb;
begin
  select * into v from app.vouchers where id = p_voucher;
  select * into c from app.customers where id = p_customer;
  res := jsonb_build_object('voucher_id', v.id, 'code', v.code, 'label', v.name, 'type', v.type, 'stackable', v.stackable);
  if v.id is null or v.deleted_at is not null or v.archived_at is not null or not v.active then
    return res || '{"ok": false, "reason": "invalid"}';
  end if;
  if v.paused then return res || '{"ok": false, "reason": "paused"}'; end if;
  if v.start_at > now() then return res || '{"ok": false, "reason": "not_started"}'; end if;
  if v.end_at is not null and v.end_at < now() then return res || '{"ok": false, "reason": "expired"}'; end if;
  -- who can use
  if c.is_employee_account and not v.employees_allowed and v.audience <> 'employees' then
    return res || '{"ok": false, "reason": "not_for_employees"}';
  end if;
  if v.audience = 'selected' and not exists (select 1 from app.voucher_targets
      where voucher_id = v.id and target_type = 'customer' and target_id = p_customer and deleted_at is null) then
    return res || '{"ok": false, "reason": "not_for_you"}';
  end if;
  if v.audience = 'tier' and c.price_tier_id is distinct from v.tier_id then
    return res || '{"ok": false, "reason": "not_for_you"}';
  end if;
  if v.audience = 'employees' and not c.is_employee_account then
    return res || '{"ok": false, "reason": "not_for_you"}';
  end if;
  if v.audience = 'first_order' and exists (select 1 from app.orders where customer_id = p_customer
      and status <> 'cancelled' and deleted_at is null and id is distinct from p_order) then
    return res || '{"ok": false, "reason": "first_order_only"}';
  end if;
  -- usage limits
  if v.total_limit is not null then
    select count(*) into v_used from app.voucher_redemptions
      where voucher_id = v.id and status = 'active' and deleted_at is null and order_id is distinct from p_order;
    if v_used >= v.total_limit then return res || '{"ok": false, "reason": "used_up"}'; end if;
  end if;
  if v.per_customer_limit is not null then
    select count(*) into v_used from app.voucher_redemptions
      where voucher_id = v.id and customer_id = p_customer and status = 'active' and deleted_at is null
        and order_id is distinct from p_order;
    if v_used >= v.per_customer_limit then return res || '{"ok": false, "reason": "already_used"}'; end if;
  end if;
  if p_items_total < v.min_order then
    return res || jsonb_build_object('ok', false, 'reason', 'minimum_not_reached', 'min_order', v.min_order);
  end if;

  if v.type = 'pct_order' then
    v_disc := round(p_items_total * v.value / 100, 2);
    if v.max_discount is not null then v_disc := least(v_disc, v.max_discount); end if;
  elsif v.type = 'fixed_order' then
    v_disc := least(v.value, p_items_total);
  elsif v.type = 'product_discount' then
    select coalesce(jsonb_object_agg(l.product_id, l.d), '{}'::jsonb), coalesce(sum(l.d), 0) into v_pd, v_disc
    from (
      select (x ->> 'product_id') as product_id,
             least((x ->> 'line_total')::numeric,
               case when v.value_kind = 'percent' then round((x ->> 'line_total')::numeric * v.value / 100, 2)
                    else round(v.value * (x ->> 'qty')::numeric, 2) end) as d
      from jsonb_array_elements(p_lines) x
      where not coalesce((x ->> 'is_free')::boolean, false)
        and exists (select 1 from app.voucher_targets t where t.voucher_id = v.id and t.deleted_at is null
          and ((t.target_type = 'product' and t.target_id = (x ->> 'product_id')::uuid)
            or (t.target_type = 'category' and t.target_id = (x ->> 'category_id')::uuid)))
    ) l;
    if v_disc = 0 then return res || '{"ok": false, "reason": "not_for_these_products"}'; end if;
    if v.max_discount is not null and v_disc > v.max_discount then
      -- scale down proportionally
      select jsonb_object_agg(k, round((val #>> '{}')::numeric * v.max_discount / v_disc, 2)) into v_pd
      from jsonb_each(v_pd) as e(k, val);
      v_disc := v.max_discount;
    end if;
  elsif v.type = 'free_delivery' then
    v_disc := 0;
    res := res || jsonb_build_object('free_delivery', true, 'delivery_discount', p_delivery_fee);
  elsif v.type = 'buy_x_get_y' then
    select coalesce(sum((x ->> 'qty')::numeric), 0) into v_buy from jsonb_array_elements(p_lines) x
      where (x ->> 'product_id')::uuid = v.buy_product_id and not coalesce((x ->> 'is_free')::boolean, false);
    if v.buy_qty is null or v.buy_qty <= 0 or v_buy < v.buy_qty then
      return res || jsonb_build_object('ok', false, 'reason', 'buy_more', 'buy_qty', v.buy_qty);
    end if;
    v_sets := floor(v_buy / v.buy_qty);
    v_free := jsonb_build_array(jsonb_build_object('product_id', coalesce(v.get_product_id, v.buy_product_id),
      'qty', v_sets * coalesce(v.get_qty, 1), 'reason', v.name));
  elsif v.type = 'free_item' then
    v_free := jsonb_build_array(jsonb_build_object('product_id', v.free_product_id, 'qty', coalesce(v.free_qty, 1), 'reason', v.name));
  end if;

  return res || jsonb_build_object('ok', true, 'reason', null, 'discount', v_disc,
    'product_discounts', v_pd, 'free_lines', v_free);
end $$;

-- ---------------------------------------------------------------------
-- QUOTE: the full price breakdown for an order (no writes except the
-- voucher-attempt counter). Used by checkout preview AND place_order.
-- p: {customer_id, items:[{product_id, qty}], delivery_method, delivery_date,
--     voucher_code, manual_discount:{amount, reason}, order_id, payment_method}
-- ---------------------------------------------------------------------
create or replace function app.quote_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public as $$
declare
  v_customer uuid := (p ->> 'customer_id')::uuid;
  v_order uuid := nullif(p ->> 'order_id', '')::uuid;
  v_code text := nullif(trim(p ->> 'voucher_code'), '');
  v_method text := coalesce(p ->> 'delivery_method', 'own_truck');
  c app.customers;
  v_lines jsonb; v_errors jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb;
  v_subtotal numeric; v_items_total numeric; v_fee numeric; v_fee_final numeric;
  v_discounts jsonb := '[]'::jsonb;
  v_applied jsonb := '[]'::jsonb; v_voucher_result jsonb; v_ev jsonb; v_auto record;
  v_best jsonb; v_best_amt numeric := -1;
  v_pd jsonb := '{}'::jsonb; v_free jsonb := '[]'::jsonb; v_order_disc numeric := 0; v_free_delivery boolean := false;
  v_manual numeric := coalesce((p -> 'manual_discount' ->> 'amount')::numeric, 0);
  v_manual_reason text := nullif(trim(p -> 'manual_discount' ->> 'reason'), '');
  v_rate numeric := app.setting_num('vat_rate', 0.12);
  v_incl boolean := app.setting_bool('prices_include_vat', true);
  v_before boolean := app.setting_bool('discount_before_vat', true);
  v_fee_vatable boolean := app.setting_bool('delivery_fee_vatable', true);
  v_net_total numeric; v_vatable numeric; v_exempt numeric; v_vat numeric; v_total numeric;
  v_base_sum numeric; v_alloc_total numeric; v_voucher_disc numeric := 0;
  v_attempts int; v_area text := app.my_area();
  v_vid uuid;
begin
  select * into c from app.customers where id = v_customer and deleted_at is null;
  if c.id is null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array(jsonb_build_object('code', 'customer_not_found')));
  end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then
    v_errors := v_errors || jsonb_build_object('code', 'no_items');
  end if;

  -- 1. lines at customer prices
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]'::jsonb) into v_lines from (
    select i.product_id, pr.name as product_name, pr.sku, pr.unit, pr.category_id, sum(i.qty) as qty,
           pp.regular_price, pp.unit_price, pp.source as price_source, pp.tier_name,
           round(pp.regular_price * sum(i.qty), 2) as line_subtotal,
           round(pp.unit_price * sum(i.qty), 2) as line_total,
           pr.vat_type, false as is_free, null::text as free_reason, min(i.ord) as sort,
           (pr.active and pr.deleted_at is null and pr.archived_at is null) as available,
           app.product_stock(pr.id) - app.product_reserved(pr.id) as stock_free
    from rows from (jsonb_to_recordset(coalesce(p -> 'items', '[]'::jsonb)) as (product_id uuid, qty numeric)) with ordinality as i(product_id, qty, ord)
    join app.products pr on pr.id = i.product_id
    cross join lateral app.price_for(v_customer, i.product_id) pp
    where i.qty > 0
    group by i.product_id, pr.id, pp.regular_price, pp.unit_price, pp.source, pp.tier_name
  ) x;

  select v_errors || coalesce(jsonb_agg(jsonb_build_object('code', 'product_unavailable', 'product_id', x ->> 'product_id',
         'name', x ->> 'product_name')), '[]'::jsonb)
    into v_errors from jsonb_array_elements(v_lines) x where not (x ->> 'available')::boolean;
  select v_warnings || coalesce(jsonb_agg(jsonb_build_object('code', 'low_stock', 'product_id', x ->> 'product_id',
         'name', x ->> 'product_name', 'available', greatest((x ->> 'stock_free')::numeric, 0), 'qty', (x ->> 'qty')::numeric)), '[]'::jsonb)
    into v_warnings from jsonb_array_elements(v_lines) x where (x ->> 'qty')::numeric > (x ->> 'stock_free')::numeric;

  select coalesce(sum((x ->> 'line_subtotal')::numeric), 0), coalesce(sum((x ->> 'line_total')::numeric), 0)
    into v_subtotal, v_items_total from jsonb_array_elements(v_lines) x;

  -- price-tier discount lines (special / tier / employee)
  select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'label', d.label, 'amount', d.amount, 'affects_total', true)), '[]'::jsonb)
    into v_discounts
  from (select (x ->> 'price_source') as kind, max(x ->> 'tier_name') as label,
               sum((x ->> 'line_subtotal')::numeric - (x ->> 'line_total')::numeric) as amount
        from jsonb_array_elements(v_lines) x where (x ->> 'price_source') <> 'regular'
        group by (x ->> 'price_source')) d
  where d.amount <> 0;

  -- 2. delivery fee
  v_fee := coalesce((app.setting('delivery_fees') ->> v_method)::numeric, 0);
  if app.setting('free_delivery_over') is not null and jsonb_typeof(app.setting('free_delivery_over')) = 'number'
     and v_items_total >= (app.setting('free_delivery_over') #>> '{}')::numeric then
    v_fee := 0;
  end if;
  v_fee_final := v_fee;

  -- 3. vouchers: typed code first, then automatic vouchers
  if v_code is not null then
    if v_area in ('portal','agent') then
      select count(*) into v_attempts from app.voucher_attempts
        where profile_id = auth.uid() and not ok and at > now() - interval '10 minutes';
      if v_attempts >= app.setting_num('voucher_attempt_limit', 10) then
        v_voucher_result := jsonb_build_object('ok', false, 'reason', 'too_many_attempts', 'code', v_code);
      end if;
    end if;
    if v_voucher_result is null then
      select id into v_vid from app.vouchers where lower(code) = lower(v_code) and deleted_at is null;
      if v_vid is null then
        v_voucher_result := jsonb_build_object('ok', false, 'reason', 'invalid', 'code', v_code);
      else
        v_voucher_result := app.eval_voucher(v_vid, v_customer, v_lines, v_items_total, v_fee, v_order);
      end if;
      if v_area in ('portal','agent') and coalesce((p ->> 'record_attempt')::boolean, false) then
        insert into app.voucher_attempts (profile_id, code, ok) values (auth.uid(), v_code, coalesce((v_voucher_result ->> 'ok')::boolean, false));
      end if;
    end if;
    if (v_voucher_result ->> 'ok')::boolean then v_applied := jsonb_build_array(v_voucher_result); end if;
  end if;

  for v_auto in select id from app.vouchers where code is null and active and not paused and deleted_at is null and archived_at is null loop
    v_ev := app.eval_voucher(v_auto.id, v_customer, v_lines, v_items_total, v_fee, v_order);
    continue when not coalesce((v_ev ->> 'ok')::boolean, false);
    if jsonb_array_length(v_applied) > 0 then
      -- only add if everything already applied is stackable and this one is too
      if (v_ev ->> 'stackable')::boolean and not exists (select 1 from jsonb_array_elements(v_applied) a where not (a ->> 'stackable')::boolean) then
        v_applied := v_applied || v_ev;
      end if;
    else
      if coalesce((v_ev ->> 'discount')::numeric, 0) + coalesce((v_ev ->> 'delivery_discount')::numeric, 0) > v_best_amt then
        v_best := v_ev; v_best_amt := coalesce((v_ev ->> 'discount')::numeric, 0) + coalesce((v_ev ->> 'delivery_discount')::numeric, 0);
      end if;
    end if;
  end loop;
  if jsonb_array_length(v_applied) = 0 and v_best is not null then v_applied := jsonb_build_array(v_best); end if;

  -- combine applied vouchers
  select coalesce(sum(case when a ->> 'type' in ('pct_order','fixed_order') then (a ->> 'discount')::numeric else 0 end), 0),
         coalesce(bool_or(coalesce((a ->> 'free_delivery')::boolean, false)), false)
    into v_order_disc, v_free_delivery from jsonb_array_elements(v_applied) a;
  select coalesce(jsonb_object_agg(k, s), '{}'::jsonb) into v_pd from (
    select e.k, sum((e.val #>> '{}')::numeric) as s
    from jsonb_array_elements(v_applied) a, jsonb_each(coalesce(a -> 'product_discounts', '{}'::jsonb)) as e(k, val)
    group by e.k) z;
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_free
    from jsonb_array_elements(v_applied) a, jsonb_array_elements(coalesce(a -> 'free_lines', '[]'::jsonb)) f;

  -- add free lines (at P0)
  select v_lines || coalesce(jsonb_agg(jsonb_build_object(
      'product_id', pr.id, 'product_name', pr.name, 'sku', pr.sku, 'unit', pr.unit, 'category_id', pr.category_id,
      'qty', (f ->> 'qty')::numeric, 'regular_price', pr.default_price, 'unit_price', 0, 'price_source', 'free', 'tier_name', null,
      'line_subtotal', round(pr.default_price * (f ->> 'qty')::numeric, 2), 'line_total', 0, 'vat_type', pr.vat_type,
      'is_free', true, 'free_reason', f ->> 'reason', 'sort', 1000, 'available', true, 'stock_free', 0)), '[]'::jsonb)
    into v_lines from jsonb_array_elements(v_free) f join app.products pr on pr.id = (f ->> 'product_id')::uuid
    where (f ->> 'qty')::numeric > 0;
  select coalesce(sum((x ->> 'line_subtotal')::numeric), 0) into v_subtotal from jsonb_array_elements(v_lines) x;

  -- voucher discount lines
  select v_discounts || coalesce(jsonb_agg(jsonb_build_object('kind', 'voucher', 'label', a ->> 'label', 'code', a ->> 'code',
      'voucher_id', a ->> 'voucher_id', 'amount',
      coalesce((a ->> 'discount')::numeric, 0), 'affects_total', true)), '[]'::jsonb)
    into v_discounts from jsonb_array_elements(v_applied) a where a ->> 'type' in ('pct_order','fixed_order','product_discount');
  select v_discounts || coalesce(jsonb_agg(jsonb_build_object('kind', 'free_goods', 'label', a ->> 'label', 'code', a ->> 'code',
      'voucher_id', a ->> 'voucher_id', 'amount',
      (select coalesce(sum((x ->> 'line_subtotal')::numeric), 0) from jsonb_array_elements(v_lines) x
        where (x ->> 'is_free')::boolean and x ->> 'free_reason' = a ->> 'label'), 'affects_total', true)), '[]'::jsonb)
    into v_discounts from jsonb_array_elements(v_applied) a where a ->> 'type' in ('buy_x_get_y','free_item');
  if v_free_delivery then
    v_fee_final := 0;
    select v_discounts || coalesce(jsonb_agg(jsonb_build_object('kind', 'free_delivery', 'label', a ->> 'label', 'code', a ->> 'code',
        'voucher_id', a ->> 'voucher_id', 'amount', v_fee, 'affects_total', false)), '[]'::jsonb)
      into v_discounts from jsonb_array_elements(v_applied) a where a ->> 'type' = 'free_delivery';
  end if;

  -- 4. manual discount (staff only, reason required, flagged for boss review)
  if v_manual > 0 then
    if v_area <> 'internal' or not app.can('orders', 2::smallint) then
      v_errors := v_errors || jsonb_build_object('code', 'manual_discount_not_allowed'); v_manual := 0;
    elsif v_manual_reason is null then
      v_errors := v_errors || jsonb_build_object('code', 'manual_discount_reason_required');
    end if;
  end if;

  -- 5. allocate discounts to lines -> net amounts
  select coalesce(sum(greatest((x ->> 'line_total')::numeric - coalesce((v_pd ->> (x ->> 'product_id'))::numeric, 0), 0)), 0)
    into v_base_sum from jsonb_array_elements(v_lines) x where not (x ->> 'is_free')::boolean;
  v_manual := least(v_manual, greatest(v_base_sum - v_order_disc, 0));
  v_order_disc := least(v_order_disc, v_base_sum);
  v_alloc_total := v_order_disc + v_manual;

  select coalesce(jsonb_agg(z.line || jsonb_build_object(
      'product_disc', z.pd, 'order_disc', z.od, 'line_discount', z.pd + z.od,
      'net', (z.line ->> 'line_total')::numeric - z.pd - z.od) order by (z.line ->> 'sort')::numeric), '[]'::jsonb)
    into v_lines
  from (
    select y.line, y.pd,
      case when y.is_free or v_base_sum = 0 then 0
           when y.rn = 1 then v_alloc_total - coalesce(sum(case when y.is_free then 0 else round(v_alloc_total * y.base / v_base_sum, 2) end)
                 over (), 0) + round(v_alloc_total * y.base / v_base_sum, 2)
           else round(v_alloc_total * y.base / v_base_sum, 2) end as od
    from (
      select x as line, (x ->> 'is_free')::boolean as is_free,
             least(coalesce((v_pd ->> (x ->> 'product_id'))::numeric, 0), (x ->> 'line_total')::numeric) as pd,
             greatest((x ->> 'line_total')::numeric - coalesce((v_pd ->> (x ->> 'product_id'))::numeric, 0), 0) as base,
             row_number() over (order by (x ->> 'is_free')::boolean,
               greatest((x ->> 'line_total')::numeric - coalesce((v_pd ->> (x ->> 'product_id'))::numeric, 0), 0) desc) as rn
      from jsonb_array_elements(v_lines) x
    ) y
  ) z;

  if v_manual > 0 then
    v_discounts := v_discounts || jsonb_build_object('kind', 'manual', 'label', 'Manual discount: ' || coalesce(v_manual_reason, ''),
      'amount', v_manual, 'affects_total', true);
  end if;
  select coalesce(sum((d ->> 'amount')::numeric), 0) into v_voucher_disc
    from jsonb_array_elements(v_discounts) d where d ->> 'kind' in ('voucher','free_goods');

  -- 6. VAT (per item, from its VAT type) — D4 settings
  select coalesce(sum((x ->> 'net')::numeric), 0),
         coalesce(sum(case when x ->> 'vat_type' = 'exempt' then (x ->> 'net')::numeric else 0 end), 0)
    into v_net_total, v_exempt from jsonb_array_elements(v_lines) x;
  select coalesce(sum(case when v_before then (x ->> 'net')::numeric else (x ->> 'line_total')::numeric end), 0)
    into v_vatable from jsonb_array_elements(v_lines) x where x ->> 'vat_type' = 'vatable';
  if v_fee_vatable then v_vatable := v_vatable + v_fee_final; else v_exempt := v_exempt + v_fee_final; end if;
  if v_incl then
    v_vat := round(v_vatable - v_vatable / (1 + v_rate), 2);
    v_vatable := round(v_vatable - v_vat, 2);
    v_total := v_net_total + v_fee_final;
  else
    v_vat := round(v_vatable * v_rate, 2);
    v_total := v_net_total + v_fee_final + v_vat;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'customer_id', v_customer,
    'lines', v_lines,
    'subtotal', v_subtotal,
    'discounts', v_discounts,
    'tier_discount', (select coalesce(sum((d ->> 'amount')::numeric), 0) from jsonb_array_elements(v_discounts) d
                       where d ->> 'kind' in ('special','tier','employee')),
    'voucher_discount', v_voucher_disc,
    'manual_discount', v_manual,
    'manual_discount_reason', v_manual_reason,
    'items_total', v_items_total,
    'delivery_fee', v_fee_final,
    'delivery_fee_before_voucher', v_fee,
    'vatable_sales', v_vatable,
    'vat_exempt_sales', v_exempt,
    'vat_amount', v_vat,
    'total', round(v_total, 2),
    'commission_base', round(v_net_total, 2),
    'voucher', v_voucher_result,
    'applied_vouchers', v_applied,
    'errors', v_errors,
    'warnings', v_warnings,
    'settings', jsonb_build_object('vat_rate', v_rate, 'prices_include_vat', v_incl, 'discount_before_vat', v_before,
       'delivery_fee_vatable', v_fee_vatable)
  );
end $$;

-- ---------------------------------------------------------------------
-- Commission calculation for one order (Spec 7.13). Snapshot at order time.
-- ---------------------------------------------------------------------
create or replace function app.calc_commissions(p_order uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare
  o app.orders; l record; a app.agents; it record;
  v_month_sales numeric; v_rule app.commission_rules; v_tier app.commission_rules;
  v_amount numeric; v_detail jsonb; v_fixed_order numeric; v_rate numeric; v_kind text;
  v_line_amt numeric; v_months_ok boolean;
begin
  select * into o from app.orders where id = p_order;
  -- void old pending ones (re-calculation after edit)
  update app.commissions set status = 'voided', void_reason = 'Order edited — recalculated'
    where order_id = p_order and status in ('pending') ;
  if o.status = 'cancelled' then return; end if;

  for l in select ac.* from app.agent_customers ac
           where ac.customer_id = o.customer_id and ac.deleted_at is null
             and ac.start_date <= coalesce(o.created_at at time zone 'Asia/Manila', now() at time zone 'Asia/Manila')::date
             and (ac.end_date is null or ac.end_date >= (o.created_at at time zone 'Asia/Manila')::date) loop
    select * into a from app.agents where id = l.agent_id and deleted_at is null;
    continue when a.id is null;

    -- month-to-date sales of this agent's customers (incl. this order)
    select coalesce(sum(x.commission_base), 0) into v_month_sales from app.orders x
      where x.deleted_at is null and x.status <> 'cancelled'
        and date_trunc('month', x.created_at at time zone 'Asia/Manila') = date_trunc('month', o.created_at at time zone 'Asia/Manila')
        and x.customer_id = any (app.agent_customer_ids(a.id));

    select * into v_tier from app.commission_rules r
      where r.scope = 'monthly_tier' and r.active and r.deleted_at is null
        and (r.agent_id = a.id or r.agent_id is null) and coalesce(r.min_monthly_sales, 0) <= v_month_sales
      order by (r.agent_id is null), r.min_monthly_sales desc nulls last limit 1;

    v_amount := 0; v_detail := '[]'::jsonb; v_fixed_order := null;
    for it in select i.*, p.category_id from app.order_items i join app.products p on p.id = i.product_id
              where i.order_id = p_order and i.deleted_at is null and not i.is_free loop
      select * into v_rule from app.commission_rules r
        where r.active and r.deleted_at is null and (r.agent_id = a.id or r.agent_id is null)
          and ((r.scope = 'product' and r.product_id = it.product_id) or (r.scope = 'category' and r.category_id = it.category_id))
        order by (r.scope = 'product') desc, (r.agent_id is null) limit 1;
      if v_rule.id is not null then
        v_kind := v_rule.rate_kind; v_rate := v_rule.rate;
        v_months_ok := v_rule.max_months is null or (l.start_date + make_interval(months => v_rule.max_months)) > (o.created_at at time zone 'Asia/Manila')::date;
      elsif v_tier.id is not null then
        v_kind := v_tier.rate_kind; v_rate := v_tier.rate;
        v_months_ok := v_tier.max_months is null or (l.start_date + make_interval(months => v_tier.max_months)) > (o.created_at at time zone 'Asia/Manila')::date;
      else
        v_kind := a.default_rate_kind; v_rate := a.default_rate; v_months_ok := true;
      end if;
      if not v_months_ok then v_rate := 0; end if;
      if v_kind = 'percent' then
        v_line_amt := round(it.net_amount * v_rate / 100, 2);
      elsif v_rule.id is not null then
        v_line_amt := round(it.qty * v_rate, 2);          -- fixed product/category rule = PHP per unit
      else
        v_line_amt := 0; v_fixed_order := v_rate;         -- fixed default/tier = PHP per order
      end if;
      v_amount := v_amount + v_line_amt;
      v_detail := v_detail || jsonb_build_object('product', it.product_name, 'net', it.net_amount, 'rate_kind', v_kind,
        'rate', v_rate, 'rule', coalesce(v_rule.scope, case when v_tier.id is not null then 'monthly_tier' else 'agent_default' end),
        'amount', v_line_amt);
      v_rule := null;
    end loop;
    v_amount := v_amount + coalesce(v_fixed_order, 0);
    v_amount := round(v_amount * l.share_pct / 100, 2);

    insert into app.commissions (order_id, agent_id, customer_id, base_amount, rate_kind, rate, share_pct, amount, rule_snapshot, status)
    values (p_order, a.id, o.customer_id, o.commission_base,
      case when v_fixed_order is not null then 'fixed' else 'percent' end,
      case when o.commission_base > 0 then round(v_amount / (l.share_pct / 100) / o.commission_base * 100, 2) else 0 end,
      l.share_pct, v_amount,
      jsonb_build_object('lines', v_detail, 'month_sales', v_month_sales, 'fixed_per_order', v_fixed_order,
        'link_id', l.id, 'link_source', l.source),
      'pending');
    v_tier := null;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Who may order for this customer?
-- ---------------------------------------------------------------------
create or replace function app.order_source_for(p_customer uuid) returns text
language plpgsql stable security definer set search_path = app, public as $$
declare v_area text := app.my_area();
begin
  if v_area = 'internal' and app.can('orders', 2::smallint) then return 'staff'; end if;
  if v_area = 'portal' and p_customer = any (app.my_customer_ids()) then return 'portal'; end if;
  if v_area = 'agent' and app.my_agent_id() is not null and p_customer = any (app.agent_customer_ids(app.my_agent_id()))
     and app.field('ag_act_order') = 'on'
     and exists (select 1 from app.agents where id = app.my_agent_id() and status = 'active') then
    return 'agent';
  end if;
  return null;
end $$;

-- Rules checked only when placing (not in preview)
create or replace function app.validate_order_rules(p jsonb, q jsonb, p_source text, p_order uuid default null) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare
  c app.customers; v_errors jsonb := '[]'::jsonb; v_date date := nullif(p ->> 'delivery_date', '')::date;
  v_pay text := p ->> 'payment_method'; v_spent numeric; lim record; v_packs numeric;
begin
  select * into c from app.customers where id = (p ->> 'customer_id')::uuid;
  if c.status <> 'approved' then v_errors := v_errors || jsonb_build_object('code', 'customer_not_approved'); end if;
  if p_source in ('portal','agent') then
    if (q ->> 'items_total')::numeric < app.setting_num('min_order_amount', 0) then
      v_errors := v_errors || jsonb_build_object('code', 'min_order', 'min_order', app.setting_num('min_order_amount', 0));
    end if;
    if v_pay is null then v_errors := v_errors || jsonb_build_object('code', 'payment_method_required'); end if;
    if v_pay like 'credit_%' and c.payment_terms <> v_pay then
      v_errors := v_errors || jsonb_build_object('code', 'payment_method_not_allowed');
    elsif v_pay = 'salary_deduction' and not c.is_employee_account then
      v_errors := v_errors || jsonb_build_object('code', 'payment_method_not_allowed');
    elsif v_pay not like 'credit_%' and v_pay <> 'salary_deduction' and not (v_pay = any (c.allowed_payment_methods)) then
      v_errors := v_errors || jsonb_build_object('code', 'payment_method_not_allowed');
    end if;
  end if;
  if v_date is null and p ->> 'delivery_method' <> 'pickup' and p_source in ('portal','agent') then
    v_errors := v_errors || jsonb_build_object('code', 'delivery_date_required');
  end if;
  if v_date is not null and p_order is null then
    if v_date < app.today() then
      v_errors := v_errors || jsonb_build_object('code', 'date_in_past');
    elsif extract(dow from v_date)::int in (select (x #>> '{}')::int from jsonb_array_elements(coalesce(app.setting('no_delivery_weekdays'), '[]'::jsonb)) x)
       or exists (select 1 from app.blocked_delivery_dates b where b.date = v_date and b.deleted_at is null) then
      v_errors := v_errors || jsonb_build_object('code', 'date_blocked');
    end if;
  end if;
  -- employee monthly limits (Spec 7.11)
  if c.is_employee_account then
    for lim in select * from app.employee_limits where customer_id = c.id and deleted_at is null loop
      if lim.product_id is null and lim.monthly_amount is not null then
        select coalesce(sum(total), 0) into v_spent from app.orders
          where customer_id = c.id and status <> 'cancelled' and deleted_at is null and id is distinct from p_order
            and date_trunc('month', created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila');
        if v_spent + (q ->> 'total')::numeric > lim.monthly_amount then
          v_errors := v_errors || jsonb_build_object('code', 'employee_limit', 'limit', lim.monthly_amount,
            'remaining', greatest(lim.monthly_amount - v_spent, 0));
        end if;
      elsif lim.product_id is not null and lim.monthly_packs is not null then
        select coalesce(sum(i.qty), 0) into v_packs from app.order_items i join app.orders o on o.id = i.order_id
          where o.customer_id = c.id and o.status <> 'cancelled' and o.deleted_at is null and i.deleted_at is null
            and i.product_id = lim.product_id and o.id is distinct from p_order
            and date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila');
        if v_packs + coalesce((select sum((x ->> 'qty')::numeric) from jsonb_array_elements(q -> 'lines') x
             where (x ->> 'product_id')::uuid = lim.product_id and not (x ->> 'is_free')::boolean), 0) > lim.monthly_packs then
          v_errors := v_errors || jsonb_build_object('code', 'employee_product_limit', 'product_id', lim.product_id,
            'limit', lim.monthly_packs, 'remaining', greatest(lim.monthly_packs - v_packs, 0));
        end if;
      end if;
    end loop;
  end if;
  return v_errors;
end $$;

-- Remaining employee allowance (shown in portal)
create or replace function app.employee_allowance(p_customer uuid) returns jsonb
language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', l.product_id, 'monthly_amount', l.monthly_amount,
    'monthly_packs', l.monthly_packs,
    'spent', (select coalesce(sum(total), 0) from app.orders o where o.customer_id = p_customer and o.status <> 'cancelled'
              and o.deleted_at is null and date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')),
    'packs_used', (select coalesce(sum(i.qty), 0) from app.order_items i join app.orders o on o.id = i.order_id
              where o.customer_id = p_customer and o.status <> 'cancelled' and o.deleted_at is null and i.deleted_at is null
                and i.product_id = l.product_id
                and date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')))), '[]'::jsonb)
  from app.employee_limits l where l.customer_id = p_customer and l.deleted_at is null
    and (p_customer = any (app.my_customer_ids()) or app.is_staff())
$$;

-- Write lines/discounts/redemptions of a quote onto an order
create or replace function app.write_order_lines(p_order uuid, q jsonb) returns void
language plpgsql security definer set search_path = app, public as $$
declare o app.orders; d jsonb;
begin
  select * into o from app.orders where id = p_order;
  update app.order_items set deleted_at = now() where order_id = p_order and deleted_at is null;
  update app.order_discounts set deleted_at = now() where order_id = p_order and deleted_at is null;
  update app.voucher_redemptions set status = 'voided' where order_id = p_order and status = 'active';

  insert into app.order_items (order_id, product_id, product_name, sku, unit, qty, regular_price, unit_price, price_source,
    line_subtotal, line_total, line_discount, net_amount, vat_type, is_free, free_reason, sort)
  select p_order, (x ->> 'product_id')::uuid, x ->> 'product_name', x ->> 'sku', x ->> 'unit', (x ->> 'qty')::numeric,
    (x ->> 'regular_price')::numeric, (x ->> 'unit_price')::numeric, x ->> 'price_source',
    (x ->> 'line_subtotal')::numeric, (x ->> 'line_total')::numeric, (x ->> 'line_discount')::numeric, (x ->> 'net')::numeric,
    x ->> 'vat_type', (x ->> 'is_free')::boolean, x ->> 'free_reason', (x ->> 'sort')::int
  from jsonb_array_elements(q -> 'lines') x;

  for d in select * from jsonb_array_elements(q -> 'discounts') loop
    insert into app.order_discounts (order_id, kind, label, voucher_id, code, amount, affects_total)
    values (p_order, d ->> 'kind', coalesce(d ->> 'label', d ->> 'kind'), nullif(d ->> 'voucher_id', '')::uuid, d ->> 'code',
            (d ->> 'amount')::numeric, coalesce((d ->> 'affects_total')::boolean, true));
  end loop;
  insert into app.voucher_redemptions (voucher_id, order_id, customer_id, amount)
  select (a ->> 'voucher_id')::uuid, p_order, o.customer_id,
    coalesce((a ->> 'discount')::numeric, 0) + coalesce((a ->> 'delivery_discount')::numeric, 0)
  from jsonb_array_elements(q -> 'applied_vouchers') a;

  update app.orders set
    subtotal = (q ->> 'subtotal')::numeric, tier_discount = (q ->> 'tier_discount')::numeric,
    voucher_discount = (q ->> 'voucher_discount')::numeric, manual_discount = (q ->> 'manual_discount')::numeric,
    manual_discount_reason = q ->> 'manual_discount_reason',
    manual_discount_flagged = (q ->> 'manual_discount')::numeric > 0,
    delivery_fee = (q ->> 'delivery_fee')::numeric, vatable_sales = (q ->> 'vatable_sales')::numeric,
    vat_exempt_sales = (q ->> 'vat_exempt_sales')::numeric, vat_amount = (q ->> 'vat_amount')::numeric,
    total = (q ->> 'total')::numeric, commission_base = (q ->> 'commission_base')::numeric,
    calc_snapshot = jsonb_build_object('settings', q -> 'settings', 'discounts', q -> 'discounts',
      'applied_vouchers', q -> 'applied_vouchers', 'at', now())
  where id = p_order;
end $$;

-- ---------------------------------------------------------------------
-- PLACE ORDER (staff, portal or agent). Returns {order_id, order_no} or errors.
-- ---------------------------------------------------------------------
create or replace function app.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public as $$
declare
  v_customer uuid := (p ->> 'customer_id')::uuid;
  v_source text := app.order_source_for(v_customer);
  q jsonb; v_errors jsonb; c app.customers; v_id uuid; v_no text; v_addr text; v_lat numeric; v_lng numeric;
  v_pay text := p ->> 'payment_method';
begin
  if v_source is null then raise exception 'You cannot place orders for this customer.' using errcode = 'P0001'; end if;
  select * into c from app.customers where id = v_customer;
  q := app.quote_order(p || jsonb_build_object('record_attempt', false));
  v_errors := coalesce(q -> 'errors', '[]'::jsonb) || app.validate_order_rules(p, q, v_source);
  if jsonb_typeof(q -> 'voucher') = 'object' and not coalesce((q -> 'voucher' ->> 'ok')::boolean, false) then
    v_errors := v_errors || jsonb_build_object('code', 'voucher_' || (q -> 'voucher' ->> 'reason'));
  end if;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors, 'quote', q);
  end if;
  if v_pay is null then v_pay := case when c.payment_terms in ('credit_7','credit_15','credit_30') then c.payment_terms else 'cod' end; end if;

  -- delivery address
  if nullif(p ->> 'address_id', '') is not null then
    select address, lat, lng into v_addr, v_lat, v_lng from app.customer_addresses
      where id = (p ->> 'address_id')::uuid and customer_id = v_customer and deleted_at is null;
  end if;
  v_addr := coalesce(v_addr, nullif(p ->> 'delivery_address', ''), c.address);
  v_lat := coalesce(v_lat, nullif(p ->> 'lat', '')::numeric, c.lat);
  v_lng := coalesce(v_lng, nullif(p ->> 'lng', '')::numeric, c.lng);
  if p ->> 'delivery_method' = 'pickup' then v_addr := coalesce(app.setting('pickup_address') #>> '{}', 'Pickup'); end if;

  insert into app.orders (customer_id, source, placed_by, agent_id, delivery_date, time_window, delivery_method, courier_name,
    delivery_address, lat, lng, payment_method, notes, internal_notes)
  values (v_customer, v_source, auth.uid(),
    case when v_source = 'agent' then app.my_agent_id() else c.agent_id end,
    nullif(p ->> 'delivery_date', '')::date, p ->> 'time_window', coalesce(p ->> 'delivery_method', c.default_delivery_method),
    p ->> 'courier_name', v_addr, v_lat, v_lng, v_pay, p ->> 'notes',
    case when v_source = 'staff' then p ->> 'internal_notes' end)
  returning id, order_no into v_id, v_no;

  perform app.write_order_lines(v_id, q);
  perform app.calc_commissions(v_id);

  if v_source = 'staff' and (p ->> 'confirm_now')::boolean then
    update app.orders set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid() where id = v_id;
  end if;
  if (q ->> 'manual_discount')::numeric > 0 then
    perform app.notify_staff('orders', 5::smallint, 'manual_discount', 'Manual discount on ' || v_no,
      q ->> 'manual_discount_reason', '/orders/' || v_id, jsonb_build_object('order_id', v_id, 'amount', q ->> 'manual_discount'));
  end if;
  if v_source in ('portal','agent') then
    perform app.notify_staff('orders', 1::smallint, 'new_order', 'New order ' || v_no || ' — ' || c.name,
      to_char((q ->> 'total')::numeric, 'FM999,999,990.00'), '/orders/' || v_id, jsonb_build_object('order_id', v_id, 'sound', true));
  end if;
  if v_source in ('staff','agent') then
    perform app.notify_customer(v_customer, 'order_placed_for_you', 'Order ' || v_no || ' was placed for you', null,
      '/orders/' || v_id, jsonb_build_object('order_id', v_id));
  end if;
  return jsonb_build_object('ok', true, 'order_id', v_id, 'order_no', v_no, 'quote', q);
end $$;

-- Staff edits items/discount before packing (customer is notified)
create or replace function app.edit_order(p_order uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public as $$
declare o app.orders; q jsonb; v_errors jsonb;
begin
  select * into o from app.orders where id = p_order and deleted_at is null;
  if o.id is null then raise exception 'Order not found.' using errcode = 'P0001'; end if;
  if not (app.is_staff() and app.can('orders', 3::smallint) and app.in_scope('orders', o.placed_by)) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  if o.status not in ('new','confirmed') then raise exception 'Only New or Confirmed orders can be edited.' using errcode = 'P0001'; end if;
  if not (p ? 'voucher_code') then
    p := p || jsonb_build_object('voucher_code', (select code from app.order_discounts where order_id = p_order
      and deleted_at is null and code is not null limit 1));
  end if;
  q := app.quote_order(p || jsonb_build_object('customer_id', o.customer_id, 'order_id', p_order,
    'delivery_method', coalesce(p ->> 'delivery_method', o.delivery_method)));
  v_errors := coalesce(q -> 'errors', '[]'::jsonb);
  if jsonb_array_length(v_errors) > 0 then return jsonb_build_object('ok', false, 'errors', v_errors, 'quote', q); end if;
  perform app.write_order_lines(p_order, q);
  update app.orders set
    delivery_date = coalesce(nullif(p ->> 'delivery_date', '')::date, delivery_date),
    time_window = coalesce(p ->> 'time_window', time_window),
    delivery_method = coalesce(p ->> 'delivery_method', delivery_method),
    payment_method = coalesce(p ->> 'payment_method', payment_method),
    courier_name = coalesce(p ->> 'courier_name', courier_name),
    internal_notes = coalesce(p ->> 'internal_notes', internal_notes),
    changed_by_staff = true
  where id = p_order;
  perform app.calc_commissions(p_order);
  perform app.notify_customer(o.customer_id, 'order_changed', 'Order ' || o.order_no || ' was updated by Sunny Foods',
    p ->> 'change_note', '/orders/' || p_order, jsonb_build_object('order_id', p_order));
  return jsonb_build_object('ok', true, 'quote', q);
end $$;

-- ---------------------------------------------------------------------
-- STATUS FLOW: New -> Confirmed -> Packing -> Packed -> Out for Delivery
--              -> Delivered -> Completed. Cancel at any step (reason).
-- ---------------------------------------------------------------------
create or replace function app.status_label(p_status text) returns text
language sql immutable as $$
  select case p_status when 'new' then 'Received' when 'confirmed' then 'Confirmed' when 'packing' then 'Packing'
    when 'packed' then 'Packed' when 'out_for_delivery' then 'Out for Delivery' when 'delivered' then 'Delivered'
    when 'completed' then 'Completed' when 'cancelled' then 'Cancelled' end
$$;

create or replace function app.set_order_status(p_order uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = app, public as $$
declare o app.orders; i record; f record;
begin
  select * into o from app.orders where id = p_order and deleted_at is null for update;
  if o.id is null then raise exception 'Order not found.' using errcode = 'P0001'; end if;
  if not app.is_staff() then raise exception 'Not allowed.' using errcode = 'P0001'; end if;

  if p_status = 'confirmed' then
    if o.status <> 'new' or not app.can('orders', 3::smallint) then raise exception 'Cannot confirm this order.' using errcode = 'P0001'; end if;
    update app.orders set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid() where id = p_order;
  elsif p_status = 'packing' then
    if o.status <> 'confirmed' or not (app.can('packing', 3::smallint) or app.can('orders', 3::smallint)) then
      raise exception 'Cannot start packing.' using errcode = 'P0001';
    end if;
    perform app.build_packing_checks(p_order);
    update app.orders set status = 'packing' where id = p_order;
  elsif p_status = 'out_for_delivery' then
    if o.status <> 'packed' or not app.can('deliveries', 3::smallint) then raise exception 'Cannot dispatch.' using errcode = 'P0001'; end if;
    update app.orders set status = 'out_for_delivery' where id = p_order;
    update app.deliveries set status = 'out' where order_id = p_order and deleted_at is null;
  elsif p_status = 'completed' then
    if o.status <> 'delivered' or not app.can('orders', 3::smallint) then raise exception 'Cannot complete.' using errcode = 'P0001'; end if;
    update app.orders set status = 'completed', completed_at = now() where id = p_order;
  elsif p_status = 'cancelled' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to cancel.' using errcode = 'P0001'; end if;
    if o.status in ('delivered','completed','cancelled') then raise exception 'This order can no longer be cancelled.' using errcode = 'P0001'; end if;
    if not app.can('orders', 3::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
    perform app.cancel_order_effects(p_order, p_reason);
  else
    raise exception 'Use the packing or delivery screen for this step.' using errcode = 'P0001';
  end if;
end $$;

-- Shared cancel side effects: return stock, void vouchers/commissions
create or replace function app.cancel_order_effects(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = app, public as $$
declare o app.orders; m record;
begin
  select * into o from app.orders where id = p_order;
  -- packed stock goes back
  for m in select * from app.stock_movements where order_id = p_order and kind = 'order_out' and status = 'posted' and deleted_at is null loop
    insert into app.stock_movements (item_type, product_id, material_id, batch_id, qty, kind, reason, order_id)
    values (m.item_type, m.product_id, m.material_id, m.batch_id, -m.qty, 'return', 'Order cancelled: ' || p_reason, p_order);
  end loop;
  update app.voucher_redemptions set status = 'voided' where order_id = p_order and status = 'active';
  update app.orders set status = 'cancelled', cancel_reason = p_reason, cancelled_at = now() where id = p_order;
  update app.deliveries set status = 'failed', notes = coalesce(notes || ' / ', '') || 'Cancelled' where order_id = p_order and deleted_at is null;
end $$;

-- Customer may cancel only while New (Spec 7.10)
create or replace function app.customer_cancel_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = app, public as $$
declare o app.orders;
begin
  select * into o from app.orders where id = p_order and deleted_at is null;
  if o.id is null or not (o.customer_id = any (app.my_customer_ids())
      or (app.my_agent_id() is not null and o.customer_id = any (app.agent_customer_ids(app.my_agent_id())))) then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;
  if o.status <> 'new' then raise exception 'This order is already being prepared. Use "Request change".' using errcode = 'P0001'; end if;
  perform app.cancel_order_effects(p_order, coalesce(nullif(trim(p_reason), ''), 'Cancelled by customer'));
  perform app.notify_staff('orders', 1::smallint, 'order_cancelled_by_customer', 'Order ' || o.order_no || ' cancelled by customer',
    p_reason, '/orders/' || p_order);
end $$;

create or replace function app.request_order_change(p_order uuid, p_message text) returns void
language plpgsql security definer set search_path = app, public as $$
declare o app.orders;
begin
  select * into o from app.orders where id = p_order and deleted_at is null;
  if o.id is null or not (o.customer_id = any (app.my_customer_ids())
      or (app.my_agent_id() is not null and o.customer_id = any (app.agent_customer_ids(app.my_agent_id())))) then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;
  perform app.notify_staff('orders', 1::smallint, 'change_request', 'Change request for ' || o.order_no, p_message,
    '/orders/' || p_order, jsonb_build_object('order_id', p_order));
end $$;

-- Order status trigger: notify customer, earn/void commissions (Spec 7.13)
create or replace function app.orders_after_update() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare cm record;
begin
  if new.status is distinct from old.status then
    perform app.notify_customer(new.customer_id, 'order_status', 'Order ' || new.order_no || ': ' || app.status_label(new.status),
      null, '/orders/' || new.id, jsonb_build_object('order_id', new.id, 'status', new.status));
    if new.agent_id is not null then
      perform app.notify_agent(new.agent_id, 'order_status', 'Order ' || new.order_no || ': ' || app.status_label(new.status),
        null, '/orders/' || new.id, jsonb_build_object('order_id', new.id, 'status', new.status));
    end if;
  end if;
  -- Earned = Delivered AND fully Paid
  if new.status in ('delivered','completed') and new.payment_status = 'paid'
     and (old.status not in ('delivered','completed') or old.payment_status <> 'paid') then
    update app.commissions set status = 'earned', earned_at = now() where order_id = new.id and status = 'pending';
    if new.status = 'delivered' then
      update app.orders set status = 'completed', completed_at = now() where id = new.id;
    end if;
  end if;
  -- Cancelled: void unpaid commissions; paid ones get a negative adjustment
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for cm in select * from app.commissions where order_id = new.id and status <> 'voided' loop
      if cm.status = 'paid' then
        insert into app.commission_adjustments (agent_id, commission_id, order_id, amount, reason)
        values (cm.agent_id, cm.id, new.id, -cm.amount, 'Order ' || new.order_no || ' cancelled after payout');
      else
        if cm.payout_id is not null then
          update app.commission_payouts set gross = gross - cm.amount, net = net - cm.amount where id = cm.payout_id and status <> 'paid';
        end if;
        update app.commissions set status = 'voided', void_reason = 'Order cancelled', payout_id = null where id = cm.id;
      end if;
      perform app.notify_agent(cm.agent_id, 'commission_voided', 'Commission voided: order ' || new.order_no || ' cancelled', null, '/commissions');
    end loop;
  end if;
  return new;
end $$;
create trigger orders_after_update after update on app.orders
  for each row execute function app.orders_after_update();

-- ---------------------------------------------------------------------
-- PACKING (Spec 7.6)
-- ---------------------------------------------------------------------
create or replace function app.build_packing_checks(p_order uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare i record; b record; v_left numeric; r record;
begin
  update app.order_packing_checks set deleted_at = now() where order_id = p_order and deleted_at is null;
  for i in select * from app.order_items where order_id = p_order and deleted_at is null order by sort loop
    v_left := i.qty;
    for b in select * from app.fefo_pick(i.product_id, i.qty) loop
      insert into app.order_packing_checks (order_id, order_item_id, check_type, batch_id, required_qty)
      values (p_order, i.id, 'pick', b.batch_id, b.take_qty);
      v_left := v_left - b.take_qty;
    end loop;
    if v_left > 0 then
      insert into app.order_packing_checks (order_id, order_item_id, check_type, batch_id, required_qty)
      values (p_order, i.id, 'pick', null, v_left);
    end if;
    for r in select * from app.product_packaging where product_id = i.product_id and deleted_at is null loop
      insert into app.order_packing_checks (order_id, order_item_id, check_type, material_id, required_qty)
      values (p_order, i.id, 'material', r.material_id, ceil(i.qty * r.qty_per_unit));
    end loop;
  end loop;
end $$;

create or replace function app.toggle_packing_check(p_check uuid, p_checked boolean) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not app.can('packing', 3::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  update app.order_packing_checks set checked = p_checked,
    checked_by = case when p_checked then auth.uid() end, checked_at = case when p_checked then now() end
  where id = p_check and deleted_at is null
    and exists (select 1 from app.orders o where o.id = order_id and o.status = 'packing');
end $$;

-- p_packed: {order_item_id: packed_qty} — only when a worker enters a different qty
create or replace function app.mark_packed(p_order uuid, p_photo text default null, p_packed jsonb default '{}'::jsonb,
  p_confirm_qty_change boolean default false) returns void
language plpgsql security definer set search_path = app, public as $$
declare
  o app.orders; i record; ch record; v_qty numeric; v_left numeric; b record; r record; v_changed text := '';
begin
  select * into o from app.orders where id = p_order and deleted_at is null for update;
  if o.status <> 'packing' then raise exception 'This order is not being packed.' using errcode = 'P0001'; end if;
  if not app.can('packing', 3::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  if exists (select 1 from app.order_packing_checks where order_id = p_order and deleted_at is null and not checked) then
    raise exception 'Tick every packing item first.' using errcode = 'P0001';
  end if;
  for i in select * from app.order_items where order_id = p_order and deleted_at is null loop
    v_qty := coalesce((p_packed ->> i.id::text)::numeric, i.qty);
    if v_qty <> i.qty then
      if not p_confirm_qty_change then
        raise exception 'Packed quantity is different from the order. Please confirm.' using errcode = 'P0002';
      end if;
      v_changed := v_changed || i.product_name || ': ' || i.qty || ' → ' || v_qty || '; ';
    end if;
    update app.order_items set packed_qty = v_qty where id = i.id;
    -- product stock out: picked batches first, then FEFO, then unbatched
    v_left := v_qty;
    for ch in select * from app.order_packing_checks where order_item_id = i.id and check_type = 'pick'
              and deleted_at is null and batch_id is not null loop
      exit when v_left <= 0;
      insert into app.stock_movements (item_type, product_id, batch_id, qty, kind, order_id, reason)
      values ('product', i.product_id, ch.batch_id, -least(ch.required_qty, v_left), 'order_out', p_order, o.order_no);
      v_left := v_left - least(ch.required_qty, v_left);
    end loop;
    if v_left > 0 then
      for b in select * from app.fefo_pick(i.product_id, v_left) loop
        insert into app.stock_movements (item_type, product_id, batch_id, qty, kind, order_id, reason)
        values ('product', i.product_id, b.batch_id, -b.take_qty, 'order_out', p_order, o.order_no);
        v_left := v_left - b.take_qty;
      end loop;
    end if;
    if v_left > 0 then
      insert into app.stock_movements (item_type, product_id, qty, kind, order_id, reason)
      values ('product', i.product_id, -v_left, 'order_out', p_order, o.order_no || ' (no batch)');
    end if;
    -- packaging auto-deduct from recipe
    for r in select * from app.product_packaging where product_id = i.product_id and deleted_at is null loop
      insert into app.stock_movements (item_type, material_id, qty, kind, order_id, reason)
      values ('material', r.material_id, -ceil(v_qty * r.qty_per_unit), 'order_out', p_order, o.order_no);
    end loop;
  end loop;
  update app.orders set status = 'packed', packed_at = now(), packed_by = auth.uid(),
    packing_photo_path = coalesce(p_photo, packing_photo_path) where id = p_order;
  if v_changed <> '' then
    perform app.notify_staff('orders', 5::smallint, 'packed_qty_changed', 'Packed quantity changed on ' || o.order_no,
      v_changed, '/orders/' || p_order, jsonb_build_object('order_id', p_order));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- DELIVERIES (Spec 7.7)
-- ---------------------------------------------------------------------
create or replace function app.assign_delivery(p_order uuid, p_driver uuid, p_date date) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not app.can('deliveries', 3::smallint) or app.scope('deliveries') <> 'all' then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  if exists (select 1 from app.deliveries where order_id = p_order and deleted_at is null) then
    update app.deliveries set driver_id = p_driver, scheduled_date = p_date where order_id = p_order and deleted_at is null;
  else
    insert into app.deliveries (order_id, driver_id, scheduled_date) values (p_order, p_driver, p_date);
  end if;
  perform app.notify(p_driver, 'delivery_assigned', 'New delivery assigned', null, '/deliveries');
end $$;

create or replace function app.mark_delivered(p_order uuid, p_proof text, p_cod numeric default 0, p_notes text default null) returns void
language plpgsql security definer set search_path = app, public as $$
declare o app.orders; d app.deliveries; v_days int;
begin
  select * into o from app.orders where id = p_order and deleted_at is null for update;
  select * into d from app.deliveries where order_id = p_order and deleted_at is null;
  if not app.can('deliveries', 3::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  if app.scope('deliveries') = 'own' and d.driver_id is distinct from auth.uid() then raise exception 'Not your delivery.' using errcode = 'P0001'; end if;
  if not (o.status = 'out_for_delivery' or (o.status = 'packed' and o.delivery_method = 'pickup')) then
    raise exception 'This order is not out for delivery.' using errcode = 'P0001';
  end if;
  if o.delivery_method <> 'pickup' and coalesce(p_proof, '') = '' then
    raise exception 'A proof photo is required.' using errcode = 'P0001';
  end if;
  v_days := case o.payment_method when 'credit_7' then 7 when 'credit_15' then 15 when 'credit_30' then 30 else 0 end;
  if d.id is null then
    insert into app.deliveries (order_id, driver_id, scheduled_date, status, proof_path, cod_collected, delivered_at, notes)
    values (p_order, auth.uid(), app.today(), 'delivered', p_proof, p_cod, now(), p_notes);
  else
    update app.deliveries set status = 'delivered', proof_path = p_proof, cod_collected = p_cod, delivered_at = now(),
      notes = coalesce(p_notes, notes) where id = d.id;
  end if;
  update app.orders set status = 'delivered', delivered_at = now(), due_date = app.today() + v_days where id = p_order;
  if coalesce(p_cod, 0) > 0 then
    insert into app.payments (order_id, customer_id, amount, method, reference, proof_path, notes)
    values (p_order, o.customer_id, p_cod, case when o.payment_method = 'cash' then 'cash' else 'cod' end,
            'Collected on delivery', p_proof, p_notes);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PAYMENTS
-- ---------------------------------------------------------------------
create or replace function app.refresh_payment_status(p_order uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare v_paid numeric; o app.orders; v_status text;
begin
  select * into o from app.orders where id = p_order;
  select coalesce(sum(amount), 0) into v_paid from app.payments where order_id = p_order and deleted_at is null;
  v_status := case when v_paid >= o.total and o.total > 0 then 'paid'
                   when o.due_date is not null and o.due_date < app.today() then 'overdue'
                   when v_paid > 0 then 'partial' else 'unpaid' end;
  update app.orders set paid_amount = v_paid, payment_status = v_status where id = p_order
    and (paid_amount is distinct from v_paid or payment_status is distinct from v_status);
end $$;

create or replace function app.payments_after_change() returns trigger
language plpgsql security definer set search_path = app, public as $$
begin
  perform app.refresh_payment_status(coalesce(new.order_id, old.order_id));
  return new;
end $$;
create trigger payments_after_change after insert or update on app.payments
  for each row execute function app.payments_after_change();

create or replace function app.record_payment(p_order uuid, p_amount numeric, p_method text, p_paid_at date default null,
  p_reference text default null, p_proof text default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare o app.orders; v_id uuid;
begin
  select * into o from app.orders where id = p_order and deleted_at is null;
  if o.id is null then raise exception 'Order not found.' using errcode = 'P0001'; end if;
  if not app.can('payments', 2::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  if app.scope('payments') = 'own' and not exists (select 1 from app.deliveries where order_id = p_order and driver_id = auth.uid()) then
    raise exception 'Not your delivery.' using errcode = 'P0001';
  end if;
  insert into app.payments (order_id, customer_id, amount, method, paid_at, reference, proof_path, notes)
  values (p_order, o.customer_id, p_amount, p_method, coalesce(p_paid_at, app.today()), p_reference, p_proof, p_notes)
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.submit_payment_proof(p_customer uuid, p_order uuid, p_amount numeric, p_method text,
  p_reference text, p_file text) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_id uuid; v_no text;
begin
  if not (p_customer = any (app.my_customer_ids())) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  if p_order is not null and not exists (select 1 from app.orders where id = p_order and customer_id = p_customer) then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;
  insert into app.payment_proofs (customer_id, order_id, amount, method, reference, file_path)
  values (p_customer, p_order, p_amount, p_method, p_reference, p_file) returning id into v_id;
  select order_no into v_no from app.orders where id = p_order;
  perform app.notify_staff('payments', 3::smallint, 'payment_proof', 'Payment proof uploaded' || coalesce(' for ' || v_no, ''),
    to_char(p_amount, 'FM999,999,990.00'), '/payments', jsonb_build_object('proof_id', v_id));
  return v_id;
end $$;

create or replace function app.review_payment_proof(p_proof uuid, p_approve boolean, p_note text default null, p_order uuid default null) returns void
language plpgsql security definer set search_path = app, public as $$
declare pp app.payment_proofs; v_pay uuid; v_order uuid;
begin
  if not app.can('payments', 3::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  select * into pp from app.payment_proofs where id = p_proof and status = 'pending';
  if pp.id is null then raise exception 'Proof not found.' using errcode = 'P0001'; end if;
  v_order := coalesce(p_order, pp.order_id);
  if p_approve then
    if v_order is null then raise exception 'Choose which order this payment is for.' using errcode = 'P0001'; end if;
    insert into app.payments (order_id, customer_id, amount, method, reference, proof_path, notes)
    values (v_order, pp.customer_id, pp.amount, pp.method, pp.reference, pp.file_path, 'Verified proof')
    returning id into v_pay;
  end if;
  update app.payment_proofs set status = case when p_approve then 'verified' else 'rejected' end, reviewed_by = auth.uid(),
    reviewed_at = now(), review_note = p_note, payment_id = v_pay, order_id = v_order where id = p_proof;
  perform app.notify_customer(pp.customer_id, 'payment_proof_' || case when p_approve then 'verified' else 'rejected' end,
    case when p_approve then 'Payment verified' else 'Payment proof rejected' end, p_note, '/account');
end $$;

-- ---------------------------------------------------------------------
-- COMMISSION OPERATIONS (Spec 7.13) — boss by default (agents level 5)
-- ---------------------------------------------------------------------
create or replace function app.assert_commission_boss() returns void
language plpgsql stable as $$
begin
  if not (app.is_staff() and app.can('agents', 5::smallint)) then
    raise exception 'Only the boss can do this.' using errcode = 'P0001';
  end if;
end $$;

create or replace function app.link_customer_agent(p_customer uuid, p_agent uuid, p_source text default 'assigned',
  p_start date default null) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not (app.is_staff() and app.can('agents', 5::smallint)) and not (app.is_staff() and app.can('customers', 5::smallint)) then
    raise exception 'Only the boss can change the agent.' using errcode = 'P0001';
  end if;
  update app.agent_customers set end_date = coalesce(p_start, app.today()) - 1
    where customer_id = p_customer and deleted_at is null and (end_date is null or end_date >= coalesce(p_start, app.today()));
  if p_agent is not null then
    insert into app.agent_customers (agent_id, customer_id, start_date, source) values (p_agent, p_customer, coalesce(p_start, app.today()), p_source);
  end if;
  update app.customers set agent_id = p_agent where id = p_customer;
end $$;

create or replace function app.transfer_customer(p_customer uuid, p_from uuid, p_to uuid, p_scope text, p_effective date,
  p_reason text, p_split_from_pct numeric default null, p_split_until date default null) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_moved int := 0; v_id uuid; v_cname text;
begin
  perform app.assert_commission_boss();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = 'P0001'; end if;
  if p_scope not in ('future','future_unpaid') then raise exception 'Invalid scope.' using errcode = 'P0001'; end if;
  select name into v_cname from app.customers where id = p_customer;
  update app.agent_customers set end_date = p_effective - 1
    where customer_id = p_customer and agent_id = p_from and deleted_at is null and (end_date is null or end_date >= p_effective);
  if p_split_from_pct is not null and p_split_until is not null then
    insert into app.agent_customers (agent_id, customer_id, share_pct, start_date, end_date, source, note) values
      (p_from, p_customer, p_split_from_pct, p_effective, p_split_until, 'split', p_reason),
      (p_to, p_customer, 100 - p_split_from_pct, p_effective, p_split_until, 'split', p_reason),
      (p_to, p_customer, 100, p_split_until + 1, null, 'transfer', p_reason);
  else
    insert into app.agent_customers (agent_id, customer_id, start_date, source, note)
    values (p_to, p_customer, p_effective, 'transfer', p_reason);
  end if;
  update app.customers set agent_id = p_to where id = p_customer;
  if p_scope = 'future_unpaid' then
    with moved as (
      update app.commissions set agent_id = p_to, transferred_from_agent_id = p_from
      where agent_id = p_from and customer_id = p_customer and status in ('pending','earned','approved')
        and (payout_id is null or exists (select 1 from app.commission_payouts cp where cp.id = payout_id and cp.status = 'draft'))
      returning 1)
    select count(*) into v_moved from moved;
    update app.commissions set payout_id = null where agent_id = p_to and transferred_from_agent_id = p_from
      and customer_id = p_customer and payout_id is not null and status <> 'paid';
  end if;
  insert into app.commission_transfers (kind, customer_id, from_agent_id, to_agent_id, scope, effective_date, split_from_pct,
    split_until, reason, moved_count)
  values ('transfer', p_customer, p_from, p_to, p_scope, p_effective, p_split_from_pct, p_split_until, p_reason, v_moved)
  returning id into v_id;
  perform app.notify_agent(p_from, 'customer_transferred_out', v_cname || ': transferred by Sunny Foods', p_reason, '/customers');
  perform app.notify_agent(p_to, 'customer_transferred_in', v_cname || ': now linked to you', p_reason, '/customers');
  return v_id;
end $$;

create or replace function app.cancel_commissions(p_ids uuid[], p_customer uuid, p_all_future boolean, p_reason text) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_n int := 0; v_id uuid; r record;
begin
  perform app.assert_commission_boss();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = 'P0001'; end if;
  if p_ids is not null and array_length(p_ids, 1) > 0 then
    for r in select * from app.commissions where id = any (p_ids) and status in ('pending','earned','approved') loop
      if r.payout_id is not null then
        update app.commission_payouts set gross = gross - r.amount, net = net - r.amount where id = r.payout_id and status <> 'paid';
      end if;
      update app.commissions set status = 'voided', void_reason = 'Cancelled: ' || p_reason, payout_id = null where id = r.id;
      perform app.notify_agent(r.agent_id, 'commission_cancelled', 'Commission cancelled by Sunny Foods', p_reason, '/commissions');
      v_n := v_n + 1;
    end loop;
  end if;
  if p_all_future and p_customer is not null then
    update app.agent_customers set end_date = app.today() - 1
      where customer_id = p_customer and deleted_at is null and (end_date is null or end_date >= app.today());
    update app.customers set agent_id = null where id = p_customer;
  end if;
  insert into app.commission_transfers (kind, customer_id, scope, commission_ids, reason, moved_count)
  values ('cancel', p_customer, case when p_all_future then 'all_future' else 'selected' end, p_ids, p_reason, v_n)
  returning id into v_id;
  return v_id;
end $$;

-- Payout run: all Earned commissions in a period, per agent
create or replace function app.create_payout_run(p_start date, p_end date) returns int
language plpgsql security definer set search_path = app, public as $$
declare a record; v_id uuid; v_gross numeric; v_adj numeric; v_n int := 0;
begin
  perform app.assert_commission_boss();
  for a in select distinct agent_id from app.commissions
           where status = 'earned' and payout_id is null and (earned_at at time zone 'Asia/Manila')::date between p_start and p_end
           union select distinct agent_id from app.commission_adjustments where status = 'pending' and payout_id is null loop
    insert into app.commission_payouts (agent_id, period_start, period_end) values (a.agent_id, p_start, p_end) returning id into v_id;
    update app.commissions set payout_id = v_id where agent_id = a.agent_id and status = 'earned' and payout_id is null
      and (earned_at at time zone 'Asia/Manila')::date between p_start and p_end;
    update app.commission_adjustments set payout_id = v_id where agent_id = a.agent_id and status = 'pending' and payout_id is null;
    select coalesce(sum(amount), 0) into v_gross from app.commissions where payout_id = v_id;
    select coalesce(sum(amount), 0) into v_adj from app.commission_adjustments where payout_id = v_id;
    update app.commission_payouts set gross = v_gross, adjustments = v_adj, net = v_gross + v_adj where id = v_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function app.approve_payout(p_payout uuid) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  perform app.assert_commission_boss();
  update app.commission_payouts set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_payout and status = 'draft';
  update app.commissions set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where payout_id = p_payout and status = 'earned';
end $$;

create or replace function app.mark_payout_paid(p_payout uuid, p_paid_at date, p_method text, p_reference text, p_proof text) returns void
language plpgsql security definer set search_path = app, public as $$
declare v app.commission_payouts;
begin
  perform app.assert_commission_boss();
  select * into v from app.commission_payouts where id = p_payout and status = 'approved';
  if v.id is null then raise exception 'Approve the payout first.' using errcode = 'P0001'; end if;
  update app.commission_payouts set status = 'paid', paid_at = coalesce(p_paid_at, app.today()), method = p_method,
    reference = p_reference, proof_path = p_proof where id = p_payout;
  update app.commissions set status = 'paid' where payout_id = p_payout and status = 'approved';
  update app.commission_adjustments set status = 'applied' where payout_id = p_payout;
  perform app.notify_agent(v.agent_id, 'payout_paid', 'Commission payout sent', to_char(v.net, 'FM999,999,990.00'), '/payouts');
end $$;

create or replace function app.cancel_payout(p_payout uuid) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  perform app.assert_commission_boss();
  if exists (select 1 from app.commission_payouts where id = p_payout and status = 'paid') then
    raise exception 'A paid payout cannot be cancelled.' using errcode = 'P0001';
  end if;
  update app.commissions set payout_id = null, status = case when status = 'approved' then 'earned' else status end
    where payout_id = p_payout;
  update app.commission_adjustments set payout_id = null where payout_id = p_payout;
  update app.commission_payouts set status = 'cancelled' where id = p_payout;
end $$;

-- Resignation: mark Resigned + create a draft settlement listing customers & unpaid commission
create or replace function app.resign_agent(p_agent uuid, p_last_day date) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_id uuid; v_unpaid numeric;
begin
  perform app.assert_commission_boss();
  update app.agents set status = 'resigned', last_working_day = p_last_day, referral_active = false where id = p_agent;
  select coalesce(sum(amount), 0) into v_unpaid from app.commissions where agent_id = p_agent and status in ('pending','earned','approved');
  insert into app.agent_settlements (agent_id, last_working_day, unpaid_total, customer_decisions)
  select p_agent, p_last_day, v_unpaid, coalesce(jsonb_agg(jsonb_build_object('customer_id', c, 'action', 'transfer', 'to_agent_id', null)), '[]'::jsonb)
  from unnest(app.agent_customer_ids(p_agent)) c
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.apply_settlement(p_settlement uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare s app.agent_settlements; d jsonb; r record;
begin
  perform app.assert_commission_boss();
  select * into s from app.agent_settlements where id = p_settlement;
  if s.status = 'done' then raise exception 'Already applied.' using errcode = 'P0001'; end if;
  if s.status <> 'agreed' then raise exception 'Mark the settlement as Agreed first.' using errcode = 'P0001'; end if;
  for d in select * from jsonb_array_elements(s.customer_decisions) loop
    if d ->> 'action' = 'keep' then
      update app.agent_customers set end_date = nullif(d ->> 'until', '')::date
        where customer_id = (d ->> 'customer_id')::uuid and agent_id = s.agent_id and deleted_at is null
          and (end_date is null or end_date >= s.last_working_day);
    elsif d ->> 'action' = 'transfer' then
      if nullif(d ->> 'to_agent_id', '') is null then raise exception 'Choose the new agent for every transferred customer.' using errcode = 'P0001'; end if;
      perform app.transfer_customer((d ->> 'customer_id')::uuid, s.agent_id, (d ->> 'to_agent_id')::uuid, 'future',
        s.last_working_day + 1, 'Resignation settlement');
    elsif d ->> 'action' = 'house' then
      update app.agent_customers set end_date = s.last_working_day
        where customer_id = (d ->> 'customer_id')::uuid and agent_id = s.agent_id and deleted_at is null
          and (end_date is null or end_date > s.last_working_day);
      update app.customers set agent_id = null where id = (d ->> 'customer_id')::uuid;
    end if;
  end loop;
  if s.commission_decision in ('partial','forfeit') then
    for r in select * from app.commissions where agent_id = s.agent_id and status in ('pending','earned','approved') loop
      if r.payout_id is not null then
        update app.commission_payouts set gross = gross - r.amount, net = net - r.amount where id = r.payout_id and status <> 'paid';
      end if;
      update app.commissions set status = 'voided', payout_id = null,
        void_reason = case when s.commission_decision = 'forfeit' then 'Forfeited (settlement)' else 'Replaced by settlement amount' end
      where id = r.id;
    end loop;
    if s.commission_decision = 'partial' and coalesce(s.settlement_amount, 0) > 0 then
      insert into app.commission_adjustments (agent_id, amount, reason) values (s.agent_id, s.settlement_amount, 'Resignation settlement');
    end if;
  end if;
  update app.agent_settlements set status = 'done', applied_at = now() where id = p_settlement;
end $$;
