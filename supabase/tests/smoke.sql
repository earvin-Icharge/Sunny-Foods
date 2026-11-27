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
-- self sign-up (0017): staff + agent requests, confirm once, who can see/decide
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000011','newstaff@test'),('00000000-0000-0000-0000-000000000012','newagent@test');
insert into app.signup_requests (user_id, area, full_name, email, note) values ('00000000-0000-0000-0000-000000000011','internal','New Staff','newstaff@test','warehouse');
insert into app.signup_requests (user_id, area, full_name, email, agent_type) values ('00000000-0000-0000-0000-000000000012','agent','New Agent','newagent@test','broker');
select app.signup_confirmed('00000000-0000-0000-0000-000000000011') as staff_req_status, app.signup_confirmed('00000000-0000-0000-0000-000000000011') as again_no_second_notice;
select app.signup_confirmed('00000000-0000-0000-0000-000000000012') as agent_req_status, app.signup_confirmed('00000000-0000-0000-0000-000000000099') is null as unknown_is_null;
select kind, count(*) from app.notifications where kind = 'signup_request' group by kind;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
select count(*) as owner_sees_requests from app.signup_requests;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003"}',false);
select count(*) as warehouse_sees_requests from app.signup_requests;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000011"}',false);
select count(*) as pending_person_sees_own from app.signup_requests;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006"}',false);
update app.signup_requests set status = 'approved';
select count(*) as agent_cannot_approve from app.signup_requests where status = 'approved';
reset role;
-- approve_signup (0018): one step, owner approves staff (warehouse) + agent (broker); agent cannot
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006"}',false);
do $$ begin perform app.approve_signup((select id from app.signup_requests where area='agent'), 'broker');
  exception when others then raise notice 'agent cannot approve: %', sqlerrm; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
select app.approve_signup((select id from app.signup_requests where area='internal'), 'warehouse') is not null as staff_approved;
select app.approve_signup((select id from app.signup_requests where area='agent'), 'broker', null, 'percent', 3) is not null as agent_approved;
do $$ begin perform app.approve_signup((select id from app.signup_requests where area='agent'), 'broker');
  exception when others then raise notice 'second approve refused: %', sqlerrm; end $$;
reset role;
select p.full_name, p.role_key, a.referral_code, a.default_rate, (select count(*) from app.privacy_consents c where c.profile_id = p.id) as consents
  from app.profiles p left join app.agents a on a.id = p.agent_id where p.id in ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012');
select full_name, status from app.signup_requests order by area;
-- 0019: login profiles in the SAME transaction as the new agent / employee customer (L-010)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000021','newagent2@test'),('00000000-0000-0000-0000-000000000022','emp2@test'),('00000000-0000-0000-0000-000000000023','hacker@test');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
begin;
insert into app.agents (id, name, email, referral_code) values ('a0000000-0000-0000-0000-000000000021','Pedro','newagent2@test','AG-PEDRO');
select app.create_agent_profile('00000000-0000-0000-0000-000000000021','a0000000-0000-0000-0000-000000000021');
insert into app.customers (id, name, status, is_employee_account) values ('c0000000-0000-0000-0000-000000000022','Emp (employee)','approved',true);
select app.create_portal_profile('00000000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-000000000022','Emp','emp2@test','employee',true,'00000000-0000-0000-0000-000000000003',true);
commit;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005"}',false);
do $$ begin perform app.create_portal_profile('00000000-0000-0000-0000-000000000023','c0000000-0000-0000-0000-000000000001','X','hacker@test','customer');
  exception when others then raise notice 'customer cannot create logins: %', sqlerrm; end $$;
reset role;
select p.full_name, p.role_key, p.agent_id is not null as has_agent, p.customer_id is not null as has_customer, p.must_change_password,
  (select profile_id from app.agents where id = 'a0000000-0000-0000-0000-000000000021') = p.id as agent_linked,
  exists (select 1 from app.customer_users cu where cu.profile_id = p.id) as company_linked
from app.profiles p where p.id in ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000023');
-- 0020: Home data per role — staff get stock alerts only, no money stats; warehouse is not a driver
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',false);
select 'owner' as who, d->'driver' as driver, d->'new_orders' is not null and d->>'new_orders' is not null as overview, d->>'unpaid_amount' is not null as money from (select app.dashboard() d) x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002"}',false);
select 'office' as who, d->'driver' as driver, d->>'new_orders' is not null as overview, d->>'unpaid_amount' is not null as money, d->>'overdue' is not null as overdue, d->>'to_pack' is not null as to_pack, app.can('vouchers', 1::smallint) as vouchers, app.can('agents', 1::smallint) as agents from (select app.dashboard() d) x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003"}',false);
select 'warehouse' as who, d->'driver' as driver, d->>'new_orders' is not null as overview, d->>'unpaid_amount' is not null as money, d->>'to_pack' is not null as to_pack, app.can('customers', 1::smallint) as sees_customers, app.can('deliveries', 1::smallint) as sees_deliveries, app.field_on('price') as prices from (select app.dashboard() d) x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004"}',false);
select 'driver' as who, d->'driver' as driver, d->>'to_deliver' is not null as my_deliveries, d->>'unpaid_amount' is not null as money from (select app.dashboard() d) x;
reset role;
