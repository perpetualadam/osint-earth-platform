-- Fix: role "osint" does not exist
-- Run as cluster superuser (often `postgres`). Password must match .env POSTGRES_PASSWORD.
--
--   docker exec -i infrastructure-postgres-1 psql -U postgres -d postgres -f - < database/ensure_osint_role.sql
-- If `-U postgres` fails, your image may use only POSTGRES_USER from init — use that user instead.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osint') THEN
    CREATE ROLE osint WITH LOGIN PASSWORD 'changeme_postgres_password';
  END IF;
END
$$;

\c osint_earth
GRANT USAGE ON SCHEMA public TO osint;
GRANT CREATE ON SCHEMA public TO osint;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO osint;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO osint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO osint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO osint;
