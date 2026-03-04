-- Migration: Add reading_order column to feed_items
-- Run this in your Supabase project's SQL editor

ALTER TABLE feed_items
ADD COLUMN IF NOT EXISTS reading_order TEXT;

-- Optional: index for querying by reading_order within saved items
CREATE INDEX IF NOT EXISTS idx_feed_items_reading_order
  ON feed_items(reading_order);

