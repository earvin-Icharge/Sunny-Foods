-- Smoke run of the main flow (local test DB only)
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001','owner@test'),('00000000-0000-0000-0000-000000000002','office@test'),
 ('00000000-0000-0000-0000-000000000003','ware@test'),('00000000-0000-0000-0000-000000000004','driver@test'),
 ('00000000-0000-0000-0000-000000000005','cust@test'),('00000000-0000-0000-0000-000000000006','agent@test'),
 ('00000000-0000-0000-0000-000000000007','agent2@test');
insert into app.profiles (id, full_name, email, role_key) values
 ('00000000-0000-0000-0000-000000000001','Owner','owner@test','owner'),('00000000-0000-0000-0000-000000000002','Office','office@test','office'),
 ('00000000-0000-0000-0000-000000000003','Ware','ware@test','warehouse'),('00000000-0000-0000-0000-000000000004','Driver','driver@test','driver');
insert into app.agents (id, name, referral_code, default_rate) values
 ('a0000000-0000-0000-0000-000000000001','Juan','AG-JUAN',5),('a0000000-0000-0000-0000-000000000002','Maria','AG-MARIA',5);
insert into app.customers (id, name, status, address) values ('c0000000-0000-0000-0000-000000000001','Cafe Uno','approved','Makati');
insert into app.profiles (id, full_name, email, role_key, customer_id) values ('00000000-0000-0000-0000-000000000005','Cust','cust@test','customer','c0000000-0000-0000-0000-000000000001');
insert into app.customer_users (customer_id, profile_id, is_primary) values ('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005',true);
insert into app.profiles (id, full_name, email, role_key, agent_id) values
 ('00000000-0000-0000-0000-000000000006','Juan','agent@test','agent','a0000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000007','Maria','agent2@test','agent','a0000000-0000-0000-0000-000000000002');
update app.agents set profile_id='00000000-0000-0000-0000-000000000006' where id='a0000000-0000-0000-0000-000000000001';
update app.agents set profile_id='00000000-0000-0000-0000-000000000007' where id='a0000000-0000-0000-0000-000000000002';
update app.products set default_price = 1000;
insert into app.agent_customers (agent_id, customer_id, start_date) values ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', current_date - 1);
insert into app.vouchers (name, code, type, value, min_order, per_customer_limit) values ('Test 10%','TEST10','pct_order',10,3000,1);

select id as ribeye from app.products where sku='ST-RIBEYE' \gset
-- owner stocks in
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
select app.stock_in('product', :'ribeye', 'B1', current_date, current_date+10, 'freezer_1', 50) is not null as stocked;
select app.stock_in('product', :'ribeye', 'B0', current_date, current_date+5, 'freezer_2', 3) is not null as stocked2;

-- customer: quote below minimum, then place order with voucher
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005"}',false);
select app.quote_order(jsonb_build_object('customer_id','c0000000-0000-0000-0000-000000000001','voucher_code','TEST10',
  'items', jsonb_build_array(jsonb_build_object('product_id',:'ribeye','qty',2))))->'voucher' as quote_2000;
select (app.place_order(jsonb_build_object('customer_id','c0000000-0000-0000-0000-000000000001','voucher_code','TEST10',
  'delivery_method','own_truck','delivery_date', (current_date + 2 + case when extract(dow from current_date+2)=0 then 1 else 0 end)::text,
  'payment_method','cod',
  'items', jsonb_build_array(jsonb_build_object('product_id',:'ribeye','qty',5))))
  - 'quote') as placed;
select app.quote_order(jsonb_build_object('customer_id','c0000000-0000-0000-0000-000000000001','voucher_code','TEST10',
  'items', jsonb_build_array(jsonb_build_object('product_id',:'ribeye','qty',5))))->'voucher'->>'reason' as second_try;
select order_no, subtotal, voucher_discount, vatable_sales, vat_amount, total from app.v_portal_orders;

-- office confirms, warehouse packs
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002"}',false);
select app.set_order_status((select id from app.orders limit 1), 'confirmed');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003"}',false);
select total, subtotal from app.v_orders;  -- warehouse: prices hidden (nulls)
select app.set_order_status((select id from app.orders limit 1), 'packing');
select check_type, required_qty, (select batch_no from app.batches b where b.id = batch_id) from app.order_packing_checks order by check_type, required_qty;
do $$ begin perform app.mark_packed((select id from app.orders limit 1)); exception when others then raise notice 'expected block: %', sqlerrm; end $$;
select app.toggle_packing_check(id, true) from app.order_packing_checks;
select app.mark_packed((select id from app.orders limit 1));
select kind, qty, item_type from app.stock_movements where kind='order_out' order by item_type, qty;

-- office assigns driver; driver delivers with COD = total
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002"}',false);
select app.assign_delivery((select id from app.orders limit 1), '00000000-0000-0000-0000-000000000004', current_date);
select app.set_order_status((select id from app.orders limit 1), 'out_for_delivery');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004"}',false);
select app.mark_delivered((select id from app.orders limit 1), 'proof.jpg', (select total from app.orders limit 1));
reset role;
select status, payment_status, paid_amount from app.orders;
select agent_id, base_amount, rate, amount, status from app.commissions;

-- owner payout run
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
select app.create_payout_run(current_date - 1, current_date + 1) as payouts;
select app.approve_payout((select id from app.commission_payouts limit 1));
select app.mark_payout_paid((select id from app.commission_payouts limit 1), current_date, 'gcash', 'REF1', null);
select status from app.commissions;
-- transfer customer Juan -> Maria (future + unpaid)
select app.transfer_customer('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','future_unpaid', current_date, 'Test move') is not null as transferred;
-- agent views
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000007"}',false);
select jsonb_array_length(app.agent_customers_list()) as maria_customers;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006"}',false);
select jsonb_array_length(app.agent_customers_list()) as juan_customers_after_transfer, app.agent_home()->'commission_unpaid' as juan_unpaid;
select count(*) as juan_sees_orders from app.orders;
reset role;
-- hard delete blocked
do $$ begin delete from app.orders; exception when others then raise notice 'delete blocked: %', sqlerrm; end $$;
-- dashboard + catalog + report
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
select app.dashboard() - 'low_stock' - 'expiring' as dash;
select jsonb_array_length(app.report('sales_by_product', current_date - 30, current_date)) as report_rows;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005"}',false);
select (app.portal_catalog('c0000000-0000-0000-0000-000000000001')->0) - 'description' as first_product;
select app.request_my_data('deletion','please') is not null as data_req;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
select app.decide_data_request((select id from app.data_requests limit 1), true);
reset role;
select name, phone, status from app.customers; select order_no, total from app.orders;
-- order WITHOUT a voucher must be accepted (regression check)
insert into app.customers (id, name, status) values ('c0000000-0000-0000-0000-000000000002','Resto Dos','approved');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002"}',false);
select (app.place_order(jsonb_build_object('customer_id','c0000000-0000-0000-0000-000000000002','delivery_method','pickup',
  'payment_method','cash','items', jsonb_build_array(jsonb_build_object('product_id',:'ribeye','qty',1)))) - 'quote') as no_voucher_order;
reset role;
