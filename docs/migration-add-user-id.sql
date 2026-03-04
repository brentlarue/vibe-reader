-- Migration: Add user_id to all tables for multi-user support
-- Run this BEFORE deploying the new auth code

-- Add nullable user_id to all tables
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feeds_user_id ON feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_user_id ON feed_items(user_id);
CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user_id ON annotations(user_id);

-- Drop old unique constraints (will re-add with user_id after data migration)
ALTER TABLE feeds DROP CONSTRAINT IF EXISTS feeds_url_key;
ALTER TABLE preferences DROP CONSTRAINT IF EXISTS preferences_key_key;
