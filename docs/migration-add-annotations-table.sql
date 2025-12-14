-- Migration: Add annotations table for Notes and Highlights
-- This table stores user highlights and notes from articles

CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id UUID NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('highlight', 'note')),
  content TEXT NOT NULL,
  env TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure annotations are scoped by environment
  UNIQUE(id, env)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_annotations_feed_item_id ON annotations(feed_item_id);
CREATE INDEX IF NOT EXISTS idx_annotations_feed_id ON annotations(feed_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_env ON annotations(env);

-- Add trigger for updated_at (though we don't update annotations, keeping consistent)
CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS for single-user app
ALTER TABLE annotations DISABLE ROW LEVEL SECURITY;
