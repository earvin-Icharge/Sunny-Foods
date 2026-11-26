-- =====================================================================
-- 0016 Dedicated login for the app server (used in DATABASE_URL).
-- The password is NOT stored here: it is set once on the live database
-- (as a one-way SCRAM fingerprint) and saved only in Vercel.
-- bypassrls: needed for sign-up/system jobs; normal requests switch to
-- role "authenticated" (lib/db.ts asUser) so RLS applies.
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'sf_app') then
    create role sf_app login bypassrls;
  end if;
end $$;
grant authenticated to sf_app;
grant usage on schema app to sf_app;
grant all on all tables in schema app to sf_app;
grant all on all sequences in schema app to sf_app;
grant execute on all functions in schema app to sf_app;
alter default privileges in schema app grant all on tables to sf_app;
alter default privileges in schema app grant all on sequences to sf_app;
alter default privileges in schema app grant execute on functions to sf_app;
