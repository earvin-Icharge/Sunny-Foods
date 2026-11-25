-- =====================================================================
-- 0008 ROW LEVEL SECURITY + MASKED VIEWS (Spec 3a, 8.9, 8.12)
-- RLS reads the same permission tables as the app's can() checks.
-- Views hide sensitive fields per Master Control field switches, so
-- hidden values are never sent to the phone.
-- =====================================================================

-- Standard staff policies for a table controlled by one module
create or replace function app.staff_policies(p_table text, p_module text, p_write_level int default 3, p_insert_level int default 2)
returns void language plpgsql as $$
begin
  execute format('create policy %I on app.%I for select to authenticated using (app.is_staff() and app.can(%L, 1::smallint))',
    p_table || '_staff_read', p_table, p_module);
  execute format('create policy %I on app.%I for insert to authenticated with check (app.is_staff() and app.can(%L, %s::smallint))',
    p_table || '_staff_insert', p_table, p_module, p_insert_level);
  execute format('create policy %I on app.%I for update to authenticated using (app.is_staff() and app.can(%L, %s::smallint)) with check (app.is_staff() and app.can(%L, %s::smallint))',
    p_table || '_staff_update', p_table, p_module, p_write_level, p_module, p_write_level);
end $$;

-- settings & access control
create policy app_settings_read on app.app_settings for select to authenticated using (true);
create policy app_settings_write on app.app_settings for update to authenticated using (app.is_staff() and app.can('settings', 3::smallint));
create policy app_settings_insert on app.app_settings for insert to authenticated with check (app.is_staff() and app.can('settings', 3::smallint));

create policy roles_read on app.roles for select to authenticated using (true);
create policy roles_write on app.roles for insert to authenticated with check (app.can('settings', 5::smallint));
create policy roles_update on app.roles for update to authenticated using (app.can('settings', 5::smallint));
create policy rp_read on app.role_permissions for select to authenticated using (app.is_staff());
create policy rp_insert on app.role_permissions for insert to authenticated with check (app.can('settings', 5::smallint));
create policy rp_update on app.role_permissions for update to authenticated using (app.can('settings', 5::smallint));
create policy fv_read on app.field_visibility for select to authenticated using (app.is_staff());
create policy fv_insert on app.field_visibility for insert to authenticated with check (app.can('settings', 5::smallint));
create policy fv_update on app.field_visibility for update to authenticated using (app.can('settings', 5::smallint));
create policy upo_read on app.user_permission_overrides for select to authenticated using (user_id = auth.uid() or app.can('settings', 5::smallint));
create policy upo_insert on app.user_permission_overrides for insert to authenticated with check (app.can('settings', 5::smallint));
create policy upo_update on app.user_permission_overrides for update to authenticated using (app.can('settings', 5::smallint));
create policy ar_read on app.approval_rules for select to authenticated using (app.is_staff());
create policy ar_write on app.approval_rules for update to authenticated using (app.can('settings', 5::smallint));
create policy teams_read on app.teams for select to authenticated using (app.is_staff());
create policy teams_insert on app.teams for insert to authenticated with check (app.can('settings', 3::smallint));
create policy teams_update on app.teams for update to authenticated using (app.can('settings', 3::smallint));

create policy profiles_read on app.profiles for select to authenticated using (
  id = auth.uid() or app.is_staff()
  or (customer_id is not null and customer_id = any (app.my_customer_ids())));
create policy profiles_update on app.profiles for update to authenticated using (id = auth.uid() or app.can('settings', 3::smallint));
create policy profiles_insert on app.profiles for insert to authenticated with check (app.can('settings', 3::smallint));

-- catalog & inventory
select app.staff_policies('categories', 'products');
select app.staff_policies('products', 'products');
select app.staff_policies('packaging_materials', 'products');
select app.staff_policies('product_packaging', 'products');
create policy products_packing_read on app.products for select to authenticated using (app.is_staff() and app.can('packing', 1::smallint));
create policy pp_packing_read on app.product_packaging for select to authenticated using (app.is_staff() and app.can('packing', 1::smallint));
create policy pm_packing_read on app.packaging_materials for select to authenticated using (app.is_staff() and (app.can('packing', 1::smallint) or app.can('inventory', 1::smallint)));
create policy categories_inv_read on app.categories for select to authenticated using (app.is_staff() and app.can('inventory', 1::smallint));
create policy products_inv_read on app.products for select to authenticated using (app.is_staff() and (app.can('inventory', 1::smallint) or app.can('orders', 1::smallint)));
select app.staff_policies('batches', 'inventory', 3, 2);
create policy batches_packing_read on app.batches for select to authenticated using (app.is_staff() and app.can('packing', 1::smallint));
create policy sm_read on app.stock_movements for select to authenticated using (app.is_staff() and (app.can('inventory', 1::smallint) or app.can('packing', 1::smallint)));
create policy sm_insert on app.stock_movements for insert to authenticated with check (app.is_staff() and app.can('inventory', 2::smallint));
select app.staff_policies('stock_counts', 'inventory', 2, 2);
select app.staff_policies('stock_count_lines', 'inventory', 2, 2);

-- prices: only staff who may see prices; only the boss (customers=5) may set them
create policy price_tiers_read on app.price_tiers for select to authenticated using (app.is_staff() and app.field_on('price'));
create policy price_tiers_write on app.price_tiers for insert to authenticated with check (app.is_staff() and app.can('customers', 5::smallint));
create policy price_tiers_update on app.price_tiers for update to authenticated using (app.is_staff() and app.can('customers', 5::smallint));
create policy tier_prices_read on app.tier_prices for select to authenticated using (app.is_staff() and app.field_on('price'));
create policy tier_prices_write on app.tier_prices for insert to authenticated with check (app.is_staff() and app.can('customers', 5::smallint));
create policy tier_prices_update on app.tier_prices for update to authenticated using (app.is_staff() and app.can('customers', 5::smallint));
create policy customer_prices_read on app.customer_prices for select to authenticated using (app.is_staff() and app.field_on('price'));
create policy customer_prices_write on app.customer_prices for insert to authenticated with check (app.is_staff() and app.can('customers', 5::smallint));
create policy customer_prices_update on app.customer_prices for update to authenticated using (app.is_staff() and app.can('customers', 5::smallint));
create policy employee_limits_read on app.employee_limits for select to authenticated using (
  (app.is_staff() and app.can('customers', 1::smallint)) or customer_id = any (app.my_customer_ids()));
create policy employee_limits_write on app.employee_limits for insert to authenticated with check (app.is_staff() and app.can('customers', 5::smallint));
create policy employee_limits_update on app.employee_limits for update to authenticated using (app.is_staff() and app.can('customers', 5::smallint));

-- customers (staff by module scope; portal users see only their own company)
create policy customers_staff_read on app.customers for select to authenticated using (
  app.is_staff() and (app.can('customers', 1::smallint) or app.can('orders', 1::smallint) or app.can('deliveries', 1::smallint)
    or app.can('agents', 1::smallint) or app.can('payments', 1::smallint) or app.can('packing', 1::smallint)));
create policy customers_staff_insert on app.customers for insert to authenticated with check (app.is_staff() and app.can('customers', 2::smallint));
create policy customers_staff_update on app.customers for update to authenticated using (app.is_staff() and app.can('customers', 3::smallint));
create policy customers_portal_read on app.customers for select to authenticated using (id = any (app.my_customer_ids()));

create policy cu_read on app.customer_users for select to authenticated using (
  (app.is_staff() and app.can('customers', 1::smallint)) or customer_id = any (app.my_customer_ids()));
create policy cu_insert on app.customer_users for insert to authenticated with check (app.is_staff() and app.can('customers', 2::smallint));
create policy cu_update on app.customer_users for update to authenticated using (app.is_staff() and app.can('customers', 3::smallint));

create policy ca_read on app.customer_addresses for select to authenticated using (
  (app.is_staff() and app.can('customers', 1::smallint)) or customer_id = any (app.my_customer_ids()));
create policy ca_insert on app.customer_addresses for insert to authenticated with check (
  (app.is_staff() and app.can('customers', 2::smallint)) or customer_id = any (app.my_customer_ids()));
create policy ca_update on app.customer_addresses for update to authenticated using (
  (app.is_staff() and app.can('customers', 3::smallint)) or customer_id = any (app.my_customer_ids()));

create policy blocked_dates_read on app.blocked_delivery_dates for select to authenticated using (true);
create policy blocked_dates_insert on app.blocked_delivery_dates for insert to authenticated with check (app.is_staff() and app.can('settings', 3::smallint));
create policy blocked_dates_update on app.blocked_delivery_dates for update to authenticated using (app.is_staff() and app.can('settings', 3::smallint));

-- vouchers (boss creates; office can view/apply)
create policy vouchers_read on app.vouchers for select to authenticated using (app.is_staff() and app.can('vouchers', 1::smallint));
create policy vouchers_insert on app.vouchers for insert to authenticated with check (app.is_staff() and app.can('vouchers', 5::smallint));
create policy vouchers_update on app.vouchers for update to authenticated using (app.is_staff() and app.can('vouchers', 5::smallint));
create policy vt_read on app.voucher_targets for select to authenticated using (app.is_staff() and app.can('vouchers', 1::smallint));
create policy vt_insert on app.voucher_targets for insert to authenticated with check (app.is_staff() and app.can('vouchers', 5::smallint));
create policy vt_update on app.voucher_targets for update to authenticated using (app.is_staff() and app.can('vouchers', 5::smallint));
create policy vr_read on app.voucher_redemptions for select to authenticated using (
  (app.is_staff() and (app.can('vouchers', 1::smallint) or app.can('orders', 1::smallint))) or customer_id = any (app.my_customer_ids()));

-- orders: staff by scope (drivers see their deliveries), customers own, agents their customers'
create policy orders_staff_read on app.orders for select to authenticated using (
  app.is_staff() and (
    (app.can('orders', 1::smallint) and app.in_scope('orders', placed_by))
    or app.can('packing', 1::smallint)
    or (app.can('deliveries', 1::smallint) and (app.scope('deliveries') = 'all'
        or exists (select 1 from app.deliveries d where d.order_id = orders.id and d.driver_id = auth.uid() and d.deleted_at is null)))
    or app.can('payments', 1::smallint) and app.scope('payments') = 'all'
    or app.can('agents', 1::smallint) or app.can('reports', 1::smallint)));
create policy orders_portal_read on app.orders for select to authenticated using (customer_id = any (app.my_customer_ids()));
create policy orders_agent_read on app.orders for select to authenticated using (
  app.my_agent_id() is not null and (agent_id = app.my_agent_id() or customer_id = any (app.agent_customer_ids(app.my_agent_id()))));
create policy orders_staff_update on app.orders for update to authenticated using (app.is_staff() and app.can('orders', 3::smallint));

create policy oi_read on app.order_items for select to authenticated using (exists (select 1 from app.orders o where o.id = order_id));
create policy od_read on app.order_discounts for select to authenticated using (exists (select 1 from app.orders o where o.id = order_id));
create policy opc_read on app.order_packing_checks for select to authenticated using (
  app.is_staff() and (app.can('packing', 1::smallint) or app.can('orders', 1::smallint)));

create policy payments_staff_read on app.payments for select to authenticated using (
  app.is_staff() and app.can('payments', 1::smallint) and (app.scope('payments') = 'all'
    or exists (select 1 from app.deliveries d where d.order_id = payments.order_id and d.driver_id = auth.uid())));
create policy payments_portal_read on app.payments for select to authenticated using (customer_id = any (app.my_customer_ids()));
create policy payments_staff_update on app.payments for update to authenticated using (app.is_staff() and app.can('payments', 3::smallint));

create policy proofs_staff_read on app.payment_proofs for select to authenticated using (app.is_staff() and app.can('payments', 1::smallint));
create policy proofs_portal_read on app.payment_proofs for select to authenticated using (customer_id = any (app.my_customer_ids()));

create policy deliveries_read on app.deliveries for select to authenticated using (
  app.is_staff() and app.can('deliveries', 1::smallint) and (app.scope('deliveries') = 'all' or driver_id = auth.uid()));
create policy deliveries_update on app.deliveries for update to authenticated using (
  app.is_staff() and app.can('deliveries', 3::smallint) and (app.scope('deliveries') = 'all' or driver_id = auth.uid()));
create policy deliveries_insert on app.deliveries for insert to authenticated with check (app.is_staff() and app.can('deliveries', 3::smallint));

create policy cart_own on app.cart_items for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- agents & commissions (staff; agents see only their own)
create policy agents_staff_read on app.agents for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint));
create policy agents_staff_insert on app.agents for insert to authenticated with check (app.is_staff() and app.can('agents', 5::smallint));
create policy agents_staff_update on app.agents for update to authenticated using (app.is_staff() and app.can('agents', 5::smallint));
create policy agents_own_read on app.agents for select to authenticated using (id = app.my_agent_id());
create policy agents_customers_staff_read on app.agents for select to authenticated using (app.is_staff() and app.can('customers', 1::smallint));

create policy ac_staff_read on app.agent_customers for select to authenticated using (app.is_staff() and (app.can('agents', 1::smallint) or app.can('customers', 1::smallint)));
create policy ac_own_read on app.agent_customers for select to authenticated using (agent_id = app.my_agent_id());
create policy ac_insert on app.agent_customers for insert to authenticated with check (app.is_staff() and app.can('agents', 5::smallint));
create policy ac_update on app.agent_customers for update to authenticated using (app.is_staff() and app.can('agents', 5::smallint));

create policy cr_read on app.commission_rules for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint) and app.field_on('commission_rates'));
create policy cr_insert on app.commission_rules for insert to authenticated with check (app.is_staff() and app.can('agents', 5::smallint));
create policy cr_update on app.commission_rules for update to authenticated using (app.is_staff() and app.can('agents', 5::smallint));

create policy com_staff_read on app.commissions for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint));
create policy com_own_read on app.commissions for select to authenticated using (agent_id = app.my_agent_id());
create policy cadj_staff_read on app.commission_adjustments for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint));
create policy cadj_own_read on app.commission_adjustments for select to authenticated using (agent_id = app.my_agent_id());
create policy cpay_staff_read on app.commission_payouts for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint));
create policy cpay_own_read on app.commission_payouts for select to authenticated using (agent_id = app.my_agent_id() and status = 'paid');
create policy ctr_read on app.commission_transfers for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint));
create policy aset_read on app.agent_settlements for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint));
create policy aset_insert on app.agent_settlements for insert to authenticated with check (app.is_staff() and app.can('agents', 5::smallint));
create policy aset_update on app.agent_settlements for update to authenticated using (app.is_staff() and app.can('agents', 5::smallint));
create policy at_staff_read on app.agent_targets for select to authenticated using (app.is_staff() and app.can('agents', 1::smallint));
create policy at_own_read on app.agent_targets for select to authenticated using (agent_id = app.my_agent_id());
create policy at_insert on app.agent_targets for insert to authenticated with check (app.is_staff() and app.can('agents', 5::smallint));
create policy at_update on app.agent_targets for update to authenticated using (app.is_staff() and app.can('agents', 5::smallint));

-- safety, notifications, privacy
create policy dr_read on app.delete_requests for select to authenticated using (
  app.is_staff() and (requested_by = auth.uid() or app.can('trash', 1::smallint)));
alter table app.audit_log enable row level security;
create policy audit_read on app.audit_log for select to authenticated using (
  app.is_staff() and (app.can('trash', 1::smallint) or app.can('settings', 5::smallint)));
create policy notif_own_read on app.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_own_update on app.notifications for update to authenticated using (user_id = auth.uid());
create policy push_own on app.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy consent_own on app.privacy_consents for select to authenticated using (profile_id = auth.uid() or app.can('settings', 5::smallint));
create policy consent_insert on app.privacy_consents for insert to authenticated with check (profile_id = auth.uid());
create policy datareq_read on app.data_requests for select to authenticated using (profile_id = auth.uid() or app.can('settings', 5::smallint));

-- Internal helpers: not callable directly by users (only via the checked functions above)
revoke execute on function app.soft_delete(text, uuid) from public, authenticated;
revoke execute on function app.anonymize_profile(uuid) from public, authenticated;
revoke execute on function app.notify(uuid, text, text, text, text, jsonb) from public, authenticated;
revoke execute on function app.notify_staff(text, smallint, text, text, text, text, jsonb) from public, authenticated;
revoke execute on function app.notify_customer(uuid, text, text, text, text, jsonb) from public, authenticated;
revoke execute on function app.notify_agent(uuid, text, text, text, text, jsonb) from public, authenticated;
revoke execute on function app.write_order_lines(uuid, jsonb) from public, authenticated;
revoke execute on function app.calc_commissions(uuid) from public, authenticated;
revoke execute on function app.cancel_order_effects(uuid, text) from public, authenticated;
revoke execute on function app.build_packing_checks(uuid) from public, authenticated;
revoke execute on function app.make_business_table(text, boolean) from public, authenticated;
revoke execute on function app.staff_policies(text, text, int, int) from public, authenticated;
revoke execute on function app.refresh_payment_status(uuid) from public, authenticated;

-- ---------------------------------------------------------------------
-- MASKED VIEWS (security_invoker = RLS of the caller still applies)
-- ---------------------------------------------------------------------
create or replace function app.customer_balance(p_customer uuid) returns numeric
language sql stable security definer set search_path = app, public as $$
  select coalesce(sum(total - paid_amount), 0) from app.orders
  where customer_id = p_customer and status <> 'cancelled' and deleted_at is null and payment_status <> 'paid'
$$;

create or replace view app.v_customers with (security_invoker = true) as
select c.id, c.code, c.name, c.business_type,
  case when app.field_on('customer_contact') then c.contact_person end as contact_person,
  case when app.field_on('customer_contact') then c.phone end as phone,
  case when app.field_on('customer_contact') then c.email end as email,
  case when app.field_on('customer_address') then c.address end as address,
  case when app.field_on('customer_address') then c.lat end as lat,
  case when app.field_on('customer_address') then c.lng end as lng,
  c.default_delivery_method, c.payment_terms, c.allowed_payment_methods, c.price_tier_id, t.name as price_tier_name,
  c.agent_id, a.name as agent_name, c.status, c.is_employee_account, c.employee_profile_id,
  c.notes, c.permit_path, c.referral_code_used, c.approved_at, c.anonymized_at,
  case when app.field_on('customer_balance') then app.customer_balance(c.id) end as balance,
  (select max(o.created_at) from app.orders o where o.customer_id = c.id and o.deleted_at is null) as last_order_at,
  c.created_at, c.updated_at, c.deleted_at
from app.customers c
left join app.price_tiers t on t.id = c.price_tier_id
left join app.agents a on a.id = c.agent_id;

create or replace view app.v_orders with (security_invoker = true) as
select o.id, o.order_no, o.customer_id, c.name as customer_name, o.source, o.placed_by, o.agent_id, ag.name as agent_name,
  o.status, o.cancel_reason, o.delivery_date, o.time_window, o.delivery_method, o.courier_name,
  case when app.field_on('customer_address') then o.delivery_address end as delivery_address,
  case when app.field_on('customer_address') then o.lat end as lat,
  case when app.field_on('customer_address') then o.lng end as lng,
  case when app.field_on('customer_contact') then c.phone end as customer_phone,
  case when app.field_on('customer_contact') then c.contact_person end as contact_person,
  o.payment_method, o.payment_status, o.due_date,
  case when app.field_on('price') then o.subtotal end as subtotal,
  case when app.field_on('price') then o.tier_discount end as tier_discount,
  case when app.field_on('price') then o.voucher_discount end as voucher_discount,
  case when app.field_on('price') then o.manual_discount end as manual_discount,
  o.manual_discount_reason, o.manual_discount_flagged,
  case when app.field_on('price') then o.delivery_fee end as delivery_fee,
  case when app.field_on('price') then o.vatable_sales end as vatable_sales,
  case when app.field_on('price') then o.vat_exempt_sales end as vat_exempt_sales,
  case when app.field_on('price') then o.vat_amount end as vat_amount,
  case when app.field_on('price') then o.total end as total,
  case when app.field_on('payment_details') or app.field_on('price') then o.paid_amount end as paid_amount,
  case when app.field_on('commission_rates') or app.can('agents', 1::smallint) then o.commission_base end as commission_base,
  o.notes, o.internal_notes, o.bir_invoice_no, o.changed_by_staff,
  o.confirmed_at, o.packed_at, o.packing_photo_path, o.delivered_at, o.completed_at, o.cancelled_at,
  d.driver_id, dp.full_name as driver_name, d.status as delivery_status, d.scheduled_date, d.proof_path as delivery_proof_path,
  d.cod_collected,
  o.created_at, o.updated_at, o.deleted_at
from app.orders o
join app.customers c on c.id = o.customer_id
left join app.agents ag on ag.id = o.agent_id
left join app.deliveries d on d.order_id = o.id and d.deleted_at is null
left join app.profiles dp on dp.id = d.driver_id;

create or replace view app.v_order_items with (security_invoker = true) as
select i.id, i.order_id, i.product_id, i.product_name, i.sku, i.unit, i.qty, i.packed_qty, i.is_free, i.free_reason, i.sort,
  i.vat_type, i.price_source,
  case when app.field_on('price') or app.my_area() = 'portal' then i.regular_price end as regular_price,
  case when app.field_on('price') or app.my_area() = 'portal' then i.unit_price end as unit_price,
  case when app.field_on('price') or app.my_area() = 'portal' then i.line_subtotal end as line_subtotal,
  case when app.field_on('price') or app.my_area() = 'portal' then i.line_total end as line_total,
  case when app.field_on('price') or app.my_area() = 'portal' then i.line_discount end as line_discount,
  case when app.field_on('price') or app.my_area() = 'portal' then i.net_amount end as net_amount,
  p.photo_path, p.storage, p.name_zh_hans, p.name_zh_hant, p.name_tl,
  i.deleted_at
from app.order_items i join app.products p on p.id = i.product_id;

-- Portal-safe order view: no internal notes, no commission, no snapshot.
create or replace view app.v_portal_orders with (security_invoker = true) as
select o.id, o.order_no, o.customer_id, o.source, o.status, o.cancel_reason, o.delivery_date, o.time_window, o.delivery_method,
  o.courier_name, o.delivery_address, o.payment_method, o.payment_status, o.due_date, o.subtotal, o.tier_discount,
  o.voucher_discount, o.manual_discount, o.delivery_fee, o.vatable_sales, o.vat_exempt_sales, o.vat_amount, o.total,
  o.paid_amount, o.notes, o.changed_by_staff, o.confirmed_at, o.packed_at, o.delivered_at, o.completed_at, o.cancelled_at,
  o.bir_invoice_no, o.created_at
from app.orders o
where o.deleted_at is null and o.customer_id = any (app.my_customer_ids());
