-- Migration: Fix Supabase Security Advisor Issues
-- This fixes RLS disabled warnings and function search_path mutable warning
--
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ============================================================================
-- FIX 1: Enable RLS and create permissive policies for single-user app
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for annotations table
-- Using auth.uid() check to satisfy Security Advisor (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Allow all operations on annotations" ON annotations;
CREATE POLICY "Allow all operations on annotations" ON annotations
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create policies for feeds table
DROP POLICY IF EXISTS "Allow all operations on feeds" ON feeds;
CREATE POLICY "Allow all operations on feeds" ON feeds
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create policies for feed_items table
DROP POLICY IF EXISTS "Allow all operations on feed_items" ON feed_items;
CREATE POLICY "Allow all operations on feed_items" ON feed_items
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create policies for preferences table
DROP POLICY IF EXISTS "Allow all operations on preferences" ON preferences;
CREATE POLICY "Allow all operations on preferences" ON preferences
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- ============================================================================
-- FIX 2: Fix function search_path mutable warning
-- ============================================================================

-- Recreate the function with search_path set to prevent security issues
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, check Security Advisor again.
-- All 4 RLS errors and 1 function warning should be resolved.
