-- =====================================================================
-- SAMPLE DATA for looking around the app (2026-11-26, asked by Earvin).
-- NOT real: prices, stock, customers, vouchers and orders are examples.
-- Everything added is marked "SAMPLE" (customer names, batch numbers,
-- voucher names, order notes) and the app shows a "SAMPLE DATA" strip
-- while the setting 'sample_data' exists. Remove before go-live.
-- Runs once (stops if already loaded). Uses the normal order functions,
-- so totals, VAT, stock and commissions are calculated like real ones.
-- =====================================================================
do $$
declare
  v_owner uuid; v_driver uuid; v_agent uuid; v_agent_user uuid; v_broker uuid;
  v_regular uuid; v_wholesale uuid; v_day date; v_id uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  o jsonb; o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid; o7 uuid; o8 uuid; o9 uuid; o10 uuid;
  r record;
begin
  if app.setting('sample_data') is not null then
    raise notice 'Sample data is already loaded — nothing done.';
    return;
  end if;

  -- who does what (test logins if they exist)
  select id into v_owner from app.profiles where role_key = 'owner' and active and deleted_at is null
    order by (email like 'test+owner%') desc, created_at limit 1;
  if v_owner is null then raise exception 'Needs an active Owner login.'; end if;
  select id into v_driver from app.profiles where role_key = 'driver' and active and deleted_at is null order by created_at limit 1;
  select id, profile_id into v_agent, v_agent_user from app.agents where status = 'active' and deleted_at is null and type = 'agent' and profile_id is not null
    order by (referral_code = 'TEST-AGENT') desc, created_at limit 1;
  select id into v_broker from app.agents where status = 'active' and deleted_at is null and type = 'broker'
    order by (referral_code = 'TEST-BROKER') desc, created_at limit 1;
  select id into v_regular from app.price_tiers where key = 'regular';
  select id into v_wholesale from app.price_tiers where key = 'wholesale';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);

  -- 1. SAMPLE prices + low-stock levels (real product names, example prices)
  for r in select * from (values
      ('ST-RIBEYE', 495, 20), ('ST-STRIP', 455, 20), ('ST-CHUCK', 345, 20), ('ST-TOPBL', 365, 20),
      ('CP-BBQ', 285, 30), ('CP-BPSTK', 310, 30), ('CP-PATTY', 220, 50), ('CP-WAGYU', 395, 20),
      ('SA-BBQ', 65, 40), ('SA-BPEP', 75, 40), ('SA-MUSH', 75, 40), ('YK-TBC', 260, 20)) x(sku, price, low)
  loop
    update app.products set default_price = r.price, low_stock_level = r.low where sku = r.sku;
    if v_wholesale is not null then
      insert into app.tier_prices (tier_id, product_id, price)
        select v_wholesale, id, round(r.price * 0.9) from app.products where sku = r.sku
        on conflict do nothing;
    end if;
  end loop;

  -- 2. SAMPLE stock (batch numbers start with SAMPLE-). Two batches expire soon, Top Blade is low.
  for r in select * from (values
      ('ST-RIBEYE', 'SAMPLE-RIB-01', 12, 'freezer_1', 15), ('ST-RIBEYE', 'SAMPLE-RIB-02', 150, 'freezer_1', 60),
      ('ST-STRIP', 'SAMPLE-STR-01', 160, 'freezer_1', 50), ('ST-CHUCK', 'SAMPLE-CHK-01', 170, 'freezer_2', 45),
      ('ST-TOPBL', 'SAMPLE-TOP-01', 165, 'freezer_2', 8), ('CP-BBQ', 'SAMPLE-BBQ-01', 140, 'freezer_2', 80),
      ('CP-BPSTK', 'SAMPLE-BPS-01', 150, 'freezer_2', 70), ('CP-PATTY', 'SAMPLE-PAT-01', 9, 'freezer_1', 40),
      ('CP-PATTY', 'SAMPLE-PAT-02', 180, 'freezer_1', 200), ('CP-WAGYU', 'SAMPLE-WAG-01', 155, 'freezer_1', 35),
      ('SA-BBQ', 'SAMPLE-SBQ-01', 300, 'shelf', 120), ('SA-BPEP', 'SAMPLE-SBP-01', 300, 'shelf', 90),
      ('SA-MUSH', 'SAMPLE-SMU-01', 300, 'shelf', 100), ('YK-TBC', 'SAMPLE-YAK-01', 120, 'freezer_2', 40)) x(sku, batch, days, loc, qty)
  loop
    perform app.stock_in('product', (select id from app.products where sku = r.sku), r.batch,
      current_date - 7, current_date + r.days, r.loc, r.qty, 'SAMPLE stock');
  end loop;
  for r in select id, code from app.packaging_materials where deleted_at is null loop
    perform app.stock_in('material', r.id, 'SAMPLE-' || r.code, current_date - 7, null, 'shelf', 300, 'SAMPLE stock');
  end loop;

  -- 3. SAMPLE customers (4 approved, 1 waiting for approval)
  insert into app.customers (name, business_type, contact_person, phone, email, address, lat, lng, status, payment_terms, price_tier_id, approved_at, approved_by)
    values ('SAMPLE · Kusina ni Aling Rosa', 'restaurant', 'Rosa Santos', '0917 555 0101', null, 'Quezon City (sample address)', 14.6760, 121.0437, 'approved', 'cod', v_regular, now(), v_owner)
    returning id into c1;
  insert into app.customers (name, business_type, contact_person, phone, email, address, lat, lng, status, payment_terms, price_tier_id, approved_at, approved_by)
    values ('SAMPLE · Brew & Bite Café', 'cafe', 'Mark Reyes', '0918 555 0102', null, 'Makati City (sample address)', 14.5547, 121.0244, 'approved', 'cod', v_regular, now(), v_owner)
    returning id into c2;
  insert into app.customers (name, business_type, contact_person, phone, email, address, lat, lng, status, payment_terms, price_tier_id, approved_at, approved_by)
    values ('SAMPLE · Grill Masters Resto', 'restaurant', 'Jun dela Cruz', '0919 555 0103', null, 'Pasig City (sample address)', 14.5764, 121.0851, 'approved', 'credit_15', v_regular, now(), v_owner)
    returning id into c3;
  insert into app.customers (name, business_type, contact_person, phone, email, address, lat, lng, status, payment_terms, price_tier_id, approved_at, approved_by)
    values ('SAMPLE · Metro Meat Distributor', 'distributor', 'Liza Tan', '0920 555 0104', null, 'Santa Rosa, Laguna (sample address)', 14.3122, 121.1114, 'approved', 'credit_30', coalesce(v_wholesale, v_regular), now(), v_owner)
    returning id into c4;
  insert into app.customers (name, business_type, contact_person, phone, email, address, lat, lng, status, payment_terms, price_tier_id)
    values ('SAMPLE · Tita''s Carinderia', 'restaurant', 'Nena Garcia', '0921 555 0105', null, 'Carmona, Cavite (sample address)', 14.3132, 121.0577, 'pending', 'cod', v_regular)
    returning id into c5;
  insert into app.customer_addresses (customer_id, label, address, lat, lng, is_default)
    select id, 'Main', address, lat, lng, true from app.customers where id in (c1, c2, c3, c4, c5);
  if v_agent is not null then
    perform app.link_customer_agent(c1, v_agent, 'assigned', current_date - 30);
    perform app.link_customer_agent(c4, v_agent, 'assigned', current_date - 30);
  end if;
  if v_broker is not null then perform app.link_customer_agent(c2, v_broker, 'assigned', current_date - 30); end if;

  -- 4. SAMPLE vouchers
  insert into app.vouchers (name, code, type, value, min_order, per_customer_limit)
    values ('SAMPLE · 10% off orders ₱3,000+', 'SAMPLE10', 'pct_order', 10, 3000, 3);
  insert into app.vouchers (name, code, type, value, min_order)
    values ('SAMPLE · Free delivery ₱8,000+', null, 'free_delivery', 0, 8000);

  -- 5. SAMPLE orders in every stage (delivery day: next day that is not Sunday)
  v_day := current_date + 1;
  if extract(dow from v_day) = 0 then v_day := v_day + 1; end if;

  -- helper shape: customer, items, payment, notes
  o1 := null;
  if v_agent_user is not null then  -- placed by the agent for their customer (agent app)
    perform set_config('request.jwt.claims', json_build_object('sub', v_agent_user)::text, true);
    o := app.place_order(jsonb_build_object('customer_id', c1, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'cod',
      'notes', 'SAMPLE order (placed by agent)', 'items', jsonb_build_array(
        jsonb_build_object('product_id', (select id from app.products where sku = 'ST-RIBEYE'), 'qty', 10),
        jsonb_build_object('product_id', (select id from app.products where sku = 'CP-PATTY'), 'qty', 20),
        jsonb_build_object('product_id', (select id from app.products where sku = 'SA-MUSH'), 'qty', 10))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o1 refused: %', o->'errors'; end if;
  o1 := (o->>'order_id')::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  end if;

  o := app.place_order(jsonb_build_object('customer_id', c2, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'gcash',
    'voucher_code', 'SAMPLE10', 'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-PATTY'), 'qty', 15),
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-BPSTK'), 'qty', 10))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o2 refused: %', o->'errors'; end if;
  o2 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c3, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'credit_15',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'ST-STRIP'), 'qty', 12),
      jsonb_build_object('product_id', (select id from app.products where sku = 'ST-CHUCK'), 'qty', 12),
      jsonb_build_object('product_id', (select id from app.products where sku = 'SA-BBQ'), 'qty', 10))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o3 refused: %', o->'errors'; end if;
  o3 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c4, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'credit_30',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-PATTY'), 'qty', 60),
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-BBQ'), 'qty', 30))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o4 refused: %', o->'errors'; end if;
  o4 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c1, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'cod',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-WAGYU'), 'qty', 8),
      jsonb_build_object('product_id', (select id from app.products where sku = 'ST-RIBEYE'), 'qty', 6))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o5 refused: %', o->'errors'; end if;
  o5 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c2, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'cod',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-PATTY'), 'qty', 10),
      jsonb_build_object('product_id', (select id from app.products where sku = 'SA-MUSH'), 'qty', 10))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o6 refused: %', o->'errors'; end if;
  o6 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c3, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'cod',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'ST-RIBEYE'), 'qty', 8),
      jsonb_build_object('product_id', (select id from app.products where sku = 'SA-BPEP'), 'qty', 6))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o7 refused: %', o->'errors'; end if;
  o7 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c4, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'credit_30',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-PATTY'), 'qty', 80),
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-WAGYU'), 'qty', 20),
      jsonb_build_object('product_id', (select id from app.products where sku = 'SA-BBQ'), 'qty', 40))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o8 refused: %', o->'errors'; end if;
  o8 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c1, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'cod',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'YK-TBC'), 'qty', 10),
      jsonb_build_object('product_id', (select id from app.products where sku = 'ST-CHUCK'), 'qty', 6))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o9 refused: %', o->'errors'; end if;
  o9 := (o->>'order_id')::uuid;
  o := app.place_order(jsonb_build_object('customer_id', c2, 'delivery_method', 'own_truck', 'delivery_date', v_day, 'payment_method', 'cod',
    'notes', 'SAMPLE order', 'internal_notes', 'SAMPLE', 'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from app.products where sku = 'CP-PATTY'), 'qty', 5))));
  if not coalesce((o->>'ok')::boolean, false) then raise exception 'Sample order o10 refused: %', o->'errors'; end if;
  o10 := (o->>'order_id')::uuid;

  -- move them along: o1, o2 stay New; o3 Confirmed; o4 Packing; o5 Packed; o6 Out for delivery;
  -- o7, o9 Delivered + paid (these complete themselves); o8 Delivered, 30-day credit, now overdue; o10 Cancelled
  foreach v_id in array array[o3, o4, o5, o6, o7, o8, o9] loop
    perform app.set_order_status(v_id, 'confirmed');
  end loop;
  foreach v_id in array array[o4, o5, o6, o7, o8, o9] loop
    perform app.set_order_status(v_id, 'packing');
  end loop;
  -- o4: half of the packing list ticked
  perform app.toggle_packing_check(id, true) from (select id, row_number() over (order by id) n from app.order_packing_checks where order_id = o4) x where n % 2 = 1;
  foreach v_id in array array[o5, o6, o7, o8, o9] loop
    perform app.toggle_packing_check(id, true) from app.order_packing_checks where order_id = v_id;
    perform app.mark_packed(v_id);
  end loop;
  foreach v_id in array array[o6, o7, o8, o9] loop
    perform app.assign_delivery(v_id, coalesce(v_driver, v_owner), current_date);
    perform app.set_order_status(v_id, 'out_for_delivery');
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(v_driver, v_owner))::text, true);
  perform app.mark_delivered(o7, 'sample/proof-photo.jpg', (select total from app.orders where id = o7), 'SAMPLE delivery');
  perform app.mark_delivered(o8, 'sample/proof-photo.jpg', 0, 'SAMPLE delivery');
  perform app.mark_delivered(o9, 'sample/proof-photo.jpg', (select total from app.orders where id = o9), 'SAMPLE delivery');
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  perform app.set_order_status(o10, 'cancelled', 'SAMPLE — customer changed plans');
  -- o8: pretend it was delivered 35 days ago so its 30-day credit is overdue
  update app.orders set due_date = current_date - 5 where id = o8;
  perform app.refresh_payment_status(o8);
  perform app.job_mark_overdue();

  -- 6. switch on the SAMPLE DATA strip
  insert into app.app_settings (key, value, description)
    values ('sample_data', jsonb_build_object('loaded_at', now(), 'customers', jsonb_build_array(c1, c2, c3, c4, c5)),
            'SAMPLE data is loaded (example prices, stock, customers, orders). Remove before go-live.');
  raise notice 'Sample data loaded.';
end $$;
