-- Migration: Add Daily Brief Support
-- Adds columns for audio brief storage and brief metadata
-- Also creates daily_brief_runs table for tracking workflow runs

-- ============================================================================
-- FEED_ITEMS: Add audio brief columns
-- ============================================================================

ALTER TABLE feed_items 
ADD COLUMN IF NOT EXISTS audio_brief_url TEXT,
ADD COLUMN IF NOT EXISTS audio_brief_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS brief_order INTEGER;

-- Index for querying items by brief order
CREATE INDEX IF NOT EXISTS idx_feed_items_brief_order ON feed_items(brief_order) WHERE brief_order IS NOT NULL;

-- ============================================================================
-- DAILY_BRIEF_RUNS: Track workflow execution state
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_brief_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  env TEXT NOT NULL DEFAULT 'prod',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  error_details JSONB,
  metadata JSONB DEFAULT '{}', -- Store stats like article_count, audio_url, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One run per date per environment
  UNIQUE(date, env)
);

-- Indexes for querying runs
CREATE INDEX IF NOT EXISTS idx_daily_brief_runs_date ON daily_brief_runs(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_brief_runs_status ON daily_brief_runs(status);
CREATE INDEX IF NOT EXISTS idx_daily_brief_runs_env ON daily_brief_runs(env);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_daily_brief_runs_updated_at ON daily_brief_runs;
CREATE TRIGGER update_daily_brief_runs_updated_at
  BEFORE UPDATE ON daily_brief_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS (single-user app)
ALTER TABLE daily_brief_runs DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- This migration adds:
-- 1. Audio brief storage fields to feed_items
-- 2. Brief order for sorting articles in the brief
-- 3. daily_brief_runs table for tracking workflow execution
-- 
-- The daily_brief_runs table stores:
-- - Execution status and timestamps
-- - Error messages and details
-- - Metadata (article count, audio URL, etc.)
-- - One run per date per environment
