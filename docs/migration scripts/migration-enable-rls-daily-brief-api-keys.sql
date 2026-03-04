-- Migration: Enable RLS on daily_brief_runs and api_keys
-- Fixes Supabase Security Advisor "RLS Disabled in Public" errors
--
-- These tables are accessed only by the server using the service role key.
-- The service role bypasses RLS, so enabling it has no effect on server access.
-- Enabling RLS without permissive policies blocks anon/authenticated access,
-- which is correct since these tables should never be exposed to clients.

-- Enable RLS (no policies = deny all for anon/authenticated; service role bypasses)
ALTER TABLE daily_brief_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
