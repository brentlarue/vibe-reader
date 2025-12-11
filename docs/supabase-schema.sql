-- Supabase Schema for The Signal RSS Reader
-- Run this SQL in your Supabase project's SQL Editor
-- 
-- This creates the necessary tables for storing feeds and feed items.
-- Designed for single-user use with server-side authentication.

-- ============================================================================
-- FEEDS TABLE
-- Stores RSS feed sources
-- ============================================================================

CREATE TABLE IF NOT EXISTS feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  rss_title TEXT,  -- Original RSS feed title (used for matching items)
  source_type TEXT NOT NULL DEFAULT 'rss',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for faster URL lookups
CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url);

-- ============================================================================
-- FEED_ITEMS TABLE
-- Stores individual articles/posts from feeds
-- ============================================================================

CREATE TABLE IF NOT EXISTS feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  external_id TEXT,  -- Original ID from the RSS feed (guid or link)
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  content_snippet TEXT,
  full_content TEXT,
  ai_summary TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',  -- 'inbox' | 'saved' | 'bookmarked' | 'archived'
  paywall_status TEXT NOT NULL DEFAULT 'unknown',  -- 'unknown' | 'free' | 'paid'
  source TEXT,  -- Display name of the source (from RSS feed title)
  source_type TEXT NOT NULL DEFAULT 'rss',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure we don't insert duplicate items for the same feed
  UNIQUE(feed_id, url)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_feed_items_feed_id ON feed_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_status ON feed_items(status);
CREATE INDEX IF NOT EXISTS idx_feed_items_published_at ON feed_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_url ON feed_items(url);

-- ============================================================================
-- PREFERENCES TABLE
-- Stores user preferences (theme, sidebar state, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- TRIGGERS FOR updated_at
-- Automatically update the updated_at timestamp on row changes
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for feeds table
DROP TRIGGER IF EXISTS update_feeds_updated_at ON feeds;
CREATE TRIGGER update_feeds_updated_at
  BEFORE UPDATE ON feeds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for feed_items table
DROP TRIGGER IF EXISTS update_feed_items_updated_at ON feed_items;
CREATE TRIGGER update_feed_items_updated_at
  BEFORE UPDATE ON feed_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for preferences table
DROP TRIGGER IF EXISTS update_preferences_updated_at ON preferences;
CREATE TRIGGER update_preferences_updated_at
  BEFORE UPDATE ON preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- For single-user app with service role key, RLS can be disabled
-- If you want additional security, uncomment and configure policies below
-- ============================================================================

-- Disable RLS for single-user app using service role key
ALTER TABLE feeds DISABLE ROW LEVEL SECURITY;
ALTER TABLE feed_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE preferences DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- After running this schema:
-- 
-- 1. Get your Supabase project URL from Settings > API > Project URL
-- 2. Get your Service Role Key from Settings > API > service_role key
--    (Keep this secret! Only use it server-side)
-- 
-- 3. Add these to your .env file:
--    SUPABASE_URL=https://your-project.supabase.co
--    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
-- 
-- 4. Restart your server to pick up the new environment variables

