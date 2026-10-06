-- Jace Store: give the server (service_role) access to the app tables.
-- Needed when "Automatically expose new tables" is off. service_role already
-- bypasses Row Level Security; it just needs table privileges.
-- Run once in Supabase SQL Editor (after 003). Safe to re-run.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Future tables created by the postgres role get the same access automatically.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

notify pgrst, 'reload schema';
