#!/bin/bash
# Rebuilds a local test database and loads every migration in order.
H=/var/lib/postgresql/sf; PORT=54329; DB=${DB:-sf_test}
psql -h $H -p $PORT -U postgres -qc "drop database if exists $DB" -c "create database $DB" >/dev/null
psql -h $H -p $PORT -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$(dirname $0)/00_supabase_stub.sql" >/dev/null || exit 1
for f in "$(dirname $0)"/../migrations/*.sql; do
  out=$(psql -h $H -p $PORT -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$f" 2>&1) || { echo "FAILED: $f"; echo "$out" | grep -v NOTICE | head -20; exit 1; }
done
echo "All migrations loaded."
