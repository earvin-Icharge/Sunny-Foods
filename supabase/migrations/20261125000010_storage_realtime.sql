-- =====================================================================
-- 0010 STORAGE BUCKETS + LIVE NOTIFICATIONS (Spec 2, 7.9)
-- =====================================================================
do $$
begin
  -- Supabase Storage: product photos are public; everything else private (signed links only).
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('product-photos', 'product-photos', true) on conflict (id) do nothing;
    insert into storage.buckets (id, name, public) values ('private', 'private', false) on conflict (id) do nothing;
  end if;
  -- Realtime: new notifications reach open screens within seconds (new-order sound alert).
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table app.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
