-- =====================================================================
-- 0003 PRODUCTS, PACKAGING, RECIPES, INVENTORY (Spec 6, 7.2, 7.3)
-- =====================================================================

create table app.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_zh_hans text, name_zh_hant text, name_tl text,
  vat_type text not null default 'vatable' check (vat_type in ('vatable','exempt')),
  sort int not null default 100,
  active boolean not null default true
);
select app.make_business_table('categories');

create table app.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  name_zh_hans text, name_zh_hant text, name_tl text,
  description text, description_zh_hans text, description_zh_hant text, description_tl text,
  category_id uuid references app.categories (id),
  photo_path text,
  unit text not null default 'pack' check (unit in ('pack','kg','box')),
  pack_weight_g numeric(10,2),
  default_price numeric(12,2) not null default 0 check (default_price >= 0),
  cost numeric(12,2) check (cost >= 0),
  low_stock_level numeric(12,2) not null default 0,
  storage text not null default 'frozen' check (storage in ('frozen','chilled','room')),
  vat_type text not null default 'vatable' check (vat_type in ('vatable','exempt')),
  packing_instruction text, packing_instruction_zh_hans text, packing_instruction_zh_hant text, packing_instruction_tl text,
  packing_photo_path text,
  active boolean not null default true,
  archived_at timestamptz
);
select app.make_business_table('products');
create index products_category_idx on app.products (category_id);

create table app.packaging_materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_zh_hans text, name_zh_hant text, name_tl text,
  unit text not null default 'pc',
  cost numeric(12,2),
  low_stock_level numeric(12,2) not null default 0,
  photo_path text,
  active boolean not null default true
);
select app.make_business_table('packaging_materials');

-- Packaging recipe: materials per 1 unit sold
create table app.product_packaging (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references app.products (id),
  material_id uuid not null references app.packaging_materials (id),
  qty_per_unit numeric(10,3) not null check (qty_per_unit > 0),
  note text
);
select app.make_business_table('product_packaging');
create unique index product_packaging_uq on app.product_packaging (product_id, material_id) where deleted_at is null;

create table app.batches (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('product','material')),
  product_id uuid references app.products (id),
  material_id uuid references app.packaging_materials (id),
  batch_no text not null,
  production_date date,
  expiry_date date,
  location text not null default 'freezer_1',
  received_qty numeric(12,3) not null default 0,
  notes text,
  check ((item_type = 'product' and product_id is not null and material_id is null)
      or (item_type = 'material' and material_id is not null and product_id is null))
);
select app.make_business_table('batches');
create index batches_product_idx on app.batches (product_id, expiry_date);

-- Every stock change (Spec 7.3). Stock on hand = sum(qty). Never edited.
create table app.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('product','material')),
  product_id uuid references app.products (id),
  material_id uuid references app.packaging_materials (id),
  batch_id uuid references app.batches (id),
  qty numeric(12,3) not null check (qty <> 0),
  kind text not null check (kind in ('stock_in','order_out','adjustment','spoilage','return','count')),
  reason text,
  order_id uuid,
  status text not null default 'posted' check (status in ('posted','pending_approval','rejected')),
  approved_by uuid,
  check (kind not in ('adjustment','spoilage','count') or coalesce(reason, '') <> '')
);
select app.make_business_table('stock_movements', false);
create index stock_movements_product_idx on app.stock_movements (product_id) where status = 'posted';
create index stock_movements_material_idx on app.stock_movements (material_id) where status = 'posted';
create index stock_movements_batch_idx on app.stock_movements (batch_id) where status = 'posted';

create or replace function app.stock_movements_immutable() returns trigger
language plpgsql as $$
begin
  if old.qty <> new.qty or old.product_id is distinct from new.product_id or old.material_id is distinct from new.material_id
     or old.batch_id is distinct from new.batch_id or old.kind <> new.kind then
    raise exception 'Stock movements cannot be edited. Add a new adjustment instead.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger stock_movements_immutable before update on app.stock_movements
  for each row execute function app.stock_movements_immutable();

-- Stock count (worker counts, app shows difference, boss approves)
create table app.stock_counts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  counted_by uuid default auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  notes text
);
select app.make_business_table('stock_counts');

create table app.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references app.stock_counts (id),
  item_type text not null check (item_type in ('product','material')),
  product_id uuid references app.products (id),
  material_id uuid references app.packaging_materials (id),
  batch_id uuid references app.batches (id),
  system_qty numeric(12,3) not null default 0,
  counted_qty numeric(12,3)
);
select app.make_business_table('stock_count_lines');

-- ---------------------------------------------------------------------
-- Stock views
-- ---------------------------------------------------------------------
create or replace view app.v_batch_stock with (security_invoker = true) as
select b.id as batch_id, b.item_type, b.product_id, b.material_id, b.batch_no, b.production_date, b.expiry_date,
       b.location, coalesce(sum(m.qty) filter (where m.status = 'posted'), 0) as qty
from app.batches b
left join app.stock_movements m on m.batch_id = b.id and m.deleted_at is null
where b.deleted_at is null
group by b.id;

create or replace function app.product_stock(p_product uuid) returns numeric
language sql stable security definer set search_path = app, public as $$
  select coalesce(sum(qty), 0) from app.stock_movements
  where product_id = p_product and status = 'posted' and deleted_at is null
$$;

create or replace function app.material_stock(p_material uuid) returns numeric
language sql stable security definer set search_path = app, public as $$
  select coalesce(sum(qty), 0) from app.stock_movements
  where material_id = p_material and status = 'posted' and deleted_at is null
$$;

-- Stock reserved by orders that are confirmed but not yet packed
create or replace function app.product_reserved(p_product uuid) returns numeric
language sql stable security definer set search_path = app, public as $$
  select 0::numeric  -- replaced in 0005 once orders exist
$$;

create or replace function app.stock_badge(p_product uuid) returns text
language sql stable security definer set search_path = app, public as $$
  select case
    when app.product_stock(p_product) - app.product_reserved(p_product) <= 0 then 'out'
    when app.product_stock(p_product) - app.product_reserved(p_product) <= p.low_stock_level then 'limited'
    else 'available' end
  from app.products p where p.id = p_product
$$;

-- FEFO: oldest-expiry batches first, returns how much to take from each.
create or replace function app.fefo_pick(p_product uuid, p_qty numeric)
returns table (batch_id uuid, batch_no text, location text, expiry_date date, take_qty numeric)
language plpgsql stable security definer set search_path = app, public as $$
declare
  r record;
  v_left numeric := p_qty;
begin
  for r in select * from app.v_batch_stock s
           where s.product_id = p_product and s.qty > 0
           order by s.expiry_date nulls last, s.production_date nulls last, s.batch_no loop
    exit when v_left <= 0;
    batch_id := r.batch_id; batch_no := r.batch_no; location := r.location; expiry_date := r.expiry_date;
    take_qty := least(r.qty, v_left);
    v_left := v_left - take_qty;
    return next;
  end loop;
end $$;

-- Masked product view: price/cost hidden by Master Control field switches.
create or replace view app.v_products with (security_invoker = true) as
select p.id, p.sku, p.name, p.name_zh_hans, p.name_zh_hant, p.name_tl,
       p.description, p.description_zh_hans, p.description_zh_hant, p.description_tl,
       p.category_id, c.name as category_name, c.name_zh_hans as category_name_zh_hans,
       c.name_zh_hant as category_name_zh_hant, c.name_tl as category_name_tl,
       p.photo_path, p.unit, p.pack_weight_g,
       case when app.field_on('price') then p.default_price end as default_price,
       case when app.field_on('cost') then p.cost end as cost,
       p.low_stock_level, p.storage, p.vat_type,
       p.packing_instruction, p.packing_instruction_zh_hans, p.packing_instruction_zh_hant, p.packing_instruction_tl,
       p.packing_photo_path, p.active, p.archived_at,
       case when app.field_on('stock_qty') then app.product_stock(p.id) end as stock_qty,
       app.stock_badge(p.id) as stock_badge,
       p.created_at, p.updated_at, p.deleted_at
from app.products p
left join app.categories c on c.id = p.category_id;

-- ---------------------------------------------------------------------
-- Stock-in / adjust helpers (adjustments above threshold need approval)
-- ---------------------------------------------------------------------
create or replace function app.stock_in(p_item_type text, p_item uuid, p_batch_no text, p_production date,
  p_expiry date, p_location text, p_qty numeric, p_notes text default null) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_batch uuid;
begin
  if not app.can('inventory', 2::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  if p_qty <= 0 then raise exception 'Quantity must be more than 0.' using errcode = 'P0001'; end if;
  insert into app.batches (item_type, product_id, material_id, batch_no, production_date, expiry_date, location, received_qty, notes)
  values (p_item_type, case when p_item_type = 'product' then p_item end, case when p_item_type = 'material' then p_item end,
          p_batch_no, p_production, p_expiry, coalesce(p_location, 'freezer_1'), p_qty, p_notes)
  returning id into v_batch;
  insert into app.stock_movements (item_type, product_id, material_id, batch_id, qty, kind, reason)
  values (p_item_type, case when p_item_type = 'product' then p_item end, case when p_item_type = 'material' then p_item end,
          v_batch, p_qty, 'stock_in', p_notes);
  return v_batch;
end $$;

create or replace function app.adjust_stock(p_item_type text, p_item uuid, p_batch uuid, p_qty numeric,
  p_kind text, p_reason text) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_id uuid; v_status text := 'posted';
begin
  if not app.can('inventory', 2::smallint) then raise exception 'Not allowed.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = 'P0001'; end if;
  if p_kind not in ('adjustment','spoilage','return') then raise exception 'Invalid kind.' using errcode = 'P0001'; end if;
  if app.needs_approval('stock_adjustment', abs(p_qty)) then v_status := 'pending_approval'; end if;
  insert into app.stock_movements (item_type, product_id, material_id, batch_id, qty, kind, reason, status)
  values (p_item_type, case when p_item_type = 'product' then p_item end, case when p_item_type = 'material' then p_item end,
          p_batch, p_qty, p_kind, p_reason, v_status)
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.decide_stock_movement(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not app.can('inventory', 5::smallint) then raise exception 'Only the boss can approve.' using errcode = 'P0001'; end if;
  update app.stock_movements set status = case when p_approve then 'posted' else 'rejected' end, approved_by = auth.uid()
  where id = p_id and status = 'pending_approval';
end $$;

create or replace function app.approve_stock_count(p_count uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare l record;
begin
  if not app.can('inventory', 5::smallint) then raise exception 'Only the boss can approve.' using errcode = 'P0001'; end if;
  for l in select * from app.stock_count_lines where count_id = p_count and deleted_at is null and counted_qty is not null loop
    if l.counted_qty <> l.system_qty then
      insert into app.stock_movements (item_type, product_id, material_id, batch_id, qty, kind, reason)
      values (l.item_type, l.product_id, l.material_id, l.batch_id, l.counted_qty - l.system_qty, 'count', 'Stock count');
    end if;
  end loop;
  update app.stock_counts set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_count;
end $$;

-- ---------------------------------------------------------------------
-- Seed data (Spec 6) — prices are 0 until the boss enters them.
-- ---------------------------------------------------------------------
insert into app.categories (name, name_zh_hans, name_zh_hant, name_tl, vat_type, sort) values
  ('Steak Series','牛排系列','牛排系列','Serye ng Steak','vatable',1),
  ('Core Product','核心产品','核心產品','Pangunahing Produkto','vatable',2),
  ('Sauces','酱料','醬料','Mga Sarsa','vatable',3),
  ('Yakiniku','烧肉','燒肉','Yakiniku','exempt',4);

insert into app.products (sku, name, name_zh_hans, name_zh_hant, name_tl, category_id, unit, storage, vat_type)
select v.sku, v.name, v.zh, v.zht, v.tl, c.id, v.unit, v.storage, c.vat_type
from (values
  ('ST-STRIP','Strip Loin Steak','西冷牛排','西冷牛排','Strip Loin Steak','Steak Series','pack','frozen'),
  ('ST-CHUCK','Chuck Eye Steak','肩胛眼肉牛排','肩胛眼肉牛排','Chuck Eye Steak','Steak Series','pack','frozen'),
  ('ST-RIBEYE','Rib Eye Steak','肉眼牛排','肉眼牛排','Rib Eye Steak','Steak Series','pack','frozen'),
  ('ST-TOPBL','Top Blade Steak','板腱牛排','板腱牛排','Top Blade Steak','Steak Series','pack','frozen'),
  ('CP-WAGYU','Wagyu-Style Cubes','和牛风味牛肉粒','和牛風味牛肉粒','Wagyu-Style Cubes','Core Product','pack','frozen'),
  ('CP-PATTY','Burger Patty','汉堡肉饼','漢堡肉餅','Burger Patty','Core Product','pack','frozen'),
  ('CP-BBQ','Beef BBQ Cuts','烧烤牛肉片','燒烤牛肉片','Beef BBQ Cuts','Core Product','pack','frozen'),
  ('CP-BPSTK','Black Pepper Steak','黑椒牛排','黑椒牛排','Black Pepper Steak','Core Product','pack','frozen'),
  ('SA-BPEP','Black Pepper Sauce','黑椒酱','黑椒醬','Black Pepper Sauce','Sauces','pack','room'),
  ('SA-MUSH','Mushroom Gravy','蘑菇酱','蘑菇醬','Mushroom Gravy','Sauces','pack','room'),
  ('SA-BBQ','BBQ Seasoning','烧烤调味料','燒烤調味料','BBQ Seasoning','Sauces','pack','room'),
  ('YK-TBC','Yakiniku (name to be confirmed)','烧肉（名称待确认）','燒肉（名稱待確認）','Yakiniku (kumpirmahin ang pangalan)','Yakiniku','pack','frozen')
) v(sku, name, zh, zht, tl, cat, unit, storage)
join app.categories c on c.name = v.cat;

insert into app.packaging_materials (code, name, name_zh_hans, name_zh_hant, name_tl, unit) values
  ('VB-M','Vacuum bag (medium)','真空袋（中）','真空袋（中）','Vacuum bag (katamtaman)','pc'),
  ('VB-L','Vacuum bag (large)','真空袋（大）','真空袋（大）','Vacuum bag (malaki)','pc'),
  ('LBL','Product label','产品标签','產品標籤','Label ng produkto','pc'),
  ('STK-FRZ','"Keep Frozen" sticker','"冷冻保存"贴纸','"冷凍保存"貼紙','Sticker na "Keep Frozen"','pc'),
  ('BOX','Carton box','纸箱','紙箱','Kahong karton','pc'),
  ('ICE','Ice pack','冰袋','冰袋','Ice pack','pc'),
  ('POUCH','Sauce pouch','酱料袋','醬料袋','Supot ng sarsa','pc');

-- Example recipe (Spec 7.2): Rib Eye 1 pack = 1 vacuum bag (medium) + 1 label + 1 Keep Frozen sticker
insert into app.product_packaging (product_id, material_id, qty_per_unit)
select p.id, m.id, 1 from app.products p, app.packaging_materials m
where p.sku in ('ST-STRIP','ST-CHUCK','ST-RIBEYE','ST-TOPBL','CP-WAGYU','CP-PATTY','CP-BBQ','CP-BPSTK','YK-TBC')
  and m.code in ('VB-M','LBL','STK-FRZ');
insert into app.product_packaging (product_id, material_id, qty_per_unit)
select p.id, m.id, 1 from app.products p, app.packaging_materials m
where p.sku in ('SA-BPEP','SA-MUSH','SA-BBQ') and m.code in ('POUCH','LBL');
update app.products set packing_instruction = 'Vacuum-seal, stick the label on the front and the "Keep Frozen" sticker on the back.'
where storage = 'frozen';
update app.products set packing_instruction = 'Fill the pouch, seal, stick the label on the front.'
where storage = 'room';
