-- =====================================================================
-- 0015 Fixed search_path on every app function (Supabase security advisor)
-- signup_attempts / voucher_attempts intentionally have RLS on and NO
-- policies: only the server (system access) writes and reads them.
-- =====================================================================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'app' and p.prokind = 'f'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    execute format('alter function %s set search_path = app, public', f.sig);
  end loop;
end $$;
