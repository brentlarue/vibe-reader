-- Migration: Fix Auth RLS Initialization Plan performance warnings
-- Supabase Performance Advisor: auth.role() re-evaluates per row; wrap in (select auth.role())
-- Run this in Supabase SQL Editor
--
-- Affected tables: annotations, feeds, feed_items, preferences

-- Annotations
DROP POLICY IF EXISTS "Allow all operations on annotations" ON annotations;
CREATE POLICY "Allow all operations on annotations" ON annotations
  FOR ALL
  USING ((select auth.role()) IN ('authenticated', 'service_role'))
  WITH CHECK ((select auth.role()) IN ('authenticated', 'service_role'));

-- Feeds
DROP POLICY IF EXISTS "Allow all operations on feeds" ON feeds;
CREATE POLICY "Allow all operations on feeds" ON feeds
  FOR ALL
  USING ((select auth.role()) IN ('authenticated', 'service_role'))
  WITH CHECK ((select auth.role()) IN ('authenticated', 'service_role'));

-- Feed items
DROP POLICY IF EXISTS "Allow all operations on feed_items" ON feed_items;
CREATE POLICY "Allow all operations on feed_items" ON feed_items
  FOR ALL
  USING ((select auth.role()) IN ('authenticated', 'service_role'))
  WITH CHECK ((select auth.role()) IN ('authenticated', 'service_role'));

-- Preferences
DROP POLICY IF EXISTS "Allow all operations on preferences" ON preferences;
CREATE POLICY "Allow all operations on preferences" ON preferences
  FOR ALL
  USING ((select auth.role()) IN ('authenticated', 'service_role'))
  WITH CHECK ((select auth.role()) IN ('authenticated', 'service_role'));
