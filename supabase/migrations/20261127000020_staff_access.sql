-- =====================================================================
-- 0020 STAFF ACCESS (decided by Earvin, 2026-11-27)
-- Office + Warehouse do inventory and packing work. They may VIEW orders,
-- customers and deliveries (who and where to deliver), but get no vouchers,
-- no agents and no money stats. Their Home shows stock alerts only.
-- All of this stays editable in Master Control.
--   Home (dashboard module): View (1) = orders to pack + stock alerts;
--                            Edit or higher (3+) = full overview.
--   Money stats (unpaid total, today's sales, overdue list) need the
--   "sales_totals" switch (Boss / Admin).
-- =====================================================================

-- Office: no vouchers, no agents, no customer balances / money totals
insert into app.role_permissions (role_key, module, level, scope) values
  ('office', 'vouchers', 0, 'all'), ('office', 'agents', 0, 'all')
on conflict (role_key, module) do update set level = excluded.level, scope = excluded.scope, deleted_at = null;
insert into app.field_visibility (role_key, field, value) values
  ('office', 'customer_balance', 'off'), ('office', 'sales_totals', 'off')
on conflict (role_key, field) do update set value = excluded.value, deleted_at = null;

-- Warehouse: view orders, customers (name, address, contact) and all deliveries
insert into app.role_permissions (role_key, module, level, scope) values
  ('warehouse', 'orders', 1, 'all'), ('warehouse', 'customers', 1, 'all'), ('warehouse', 'deliveries', 1, 'all')
on conflict (role_key, module) do update set level = excluded.level, scope = excluded.scope, deleted_at = null;
insert into app.field_visibility (role_key, field, value) values
  ('warehouse', 'customer_address', 'on'), ('warehouse', 'customer_contact', 'on'), ('warehouse', 'price', 'off'),
  ('warehouse', 'customer_balance', 'off'), ('warehouse', 'sales_totals', 'off')
on conflict (role_key, field) do update set value = excluded.value, deleted_at = null;

-- Home screen data
create or replace function app.dashboard() returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare
  v_days int := app.setting_num('expiry_alert_days', 14)::int;
  -- a driver = may see deliveries, but only their own (no deliveries right at all is NOT a driver)
  v_driver boolean := app.can('deliveries', 1::smallint) and app.scope('deliveries') = 'own';
  v_overview boolean := app.can('dashboard', 3::smallint);   -- Boss / Admin
  v_money boolean := app.field_on('sales_totals');           -- money stats
begin
  if not app.is_staff() then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'driver', v_driver,
    'to_pack', case when app.can('packing', 1::smallint) or v_overview then
        (select count(*) from app.orders where deleted_at is null and status in ('confirmed','packing')) end,
    'new_orders', case when v_overview then (select count(*) from app.orders where deleted_at is null and status = 'new') end,
    'to_deliver', case when v_overview or v_driver then
        (select count(*) from app.orders o where o.deleted_at is null and o.status in ('packed','out_for_delivery')
          and (not v_driver or exists (select 1 from app.deliveries d where d.order_id = o.id and d.driver_id = auth.uid()))) end,
    'unpaid_amount', case when v_money then
        (select coalesce(sum(total - paid_amount), 0) from app.orders where deleted_at is null and status <> 'cancelled' and payment_status <> 'paid') end,
    'today_sales', case when v_money then
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
    'overdue', case when v_money and app.can('payments', 1::smallint) and app.scope('payments') = 'all' then coalesce((
        select jsonb_agg(jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'customer', c.name, 'due_date', o.due_date,
          'balance', case when app.field_on('customer_balance') then o.total - o.paid_amount end) order by o.due_date)
        from app.orders o join app.customers c on c.id = o.customer_id
        where o.deleted_at is null and o.payment_status = 'overdue'), '[]'::jsonb) end,
    'pending_customers', case when v_overview and app.can('customers', 3::smallint) then
        (select count(*) from app.customers where status = 'pending' and deleted_at is null) end,
    'pending_proofs', case when v_overview and app.can('payments', 3::smallint) then
        (select count(*) from app.payment_proofs where status = 'pending' and deleted_at is null) end,
    'pending_deletes', case when v_overview and app.can('trash', 5::smallint) then
        (select count(*) from app.delete_requests where status = 'pending' and deleted_at is null) end,
    'flagged_discounts', case when v_overview and app.can('orders', 5::smallint) then
        (select count(*) from app.orders where manual_discount_flagged and deleted_at is null and status <> 'cancelled') end
  );
end $$;
