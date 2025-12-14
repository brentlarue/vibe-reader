-- Migration: Fix preferences table to add missing key and value columns
-- This fixes the table structure to match what the application code expects

-- Add key column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'preferences' 
    AND column_name = 'key'
  ) THEN
    ALTER TABLE preferences ADD COLUMN key TEXT;
  END IF;
END $$;

-- Add value column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'preferences' 
    AND column_name = 'value'
  ) THEN
    ALTER TABLE preferences ADD COLUMN value JSONB DEFAULT '{}';
  END IF;
END $$;

-- Make key NOT NULL after adding it (if there are existing rows, you may need to populate them first)
-- First, let's check if there are any rows without keys
DO $$ 
BEGIN
  -- If there are rows with NULL keys, we need to handle them
  -- For now, we'll allow NULL temporarily, then you can populate and make NOT NULL
  IF EXISTS (SELECT 1 FROM preferences WHERE key IS NULL) THEN
    RAISE NOTICE 'Warning: There are rows with NULL keys. Please populate them before making key NOT NULL.';
  END IF;
END $$;

-- Update the unique constraint to include env (if it doesn't exist)
-- First, drop the old unique constraint on key if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'preferences_key_unique'
  ) THEN
    ALTER TABLE preferences DROP CONSTRAINT preferences_key_unique;
  END IF;
END $$;

-- Add unique constraint on (key, env) if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'preferences_key_env_unique'
  ) THEN
    ALTER TABLE preferences ADD CONSTRAINT preferences_key_env_unique UNIQUE (key, env);
  END IF;
END $$;

-- Make key NOT NULL (only if all rows have keys)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM preferences WHERE key IS NULL) THEN
    ALTER TABLE preferences ALTER COLUMN key SET NOT NULL;
  ELSE
    RAISE NOTICE 'Cannot set key to NOT NULL because there are NULL values. Please populate them first.';
  END IF;
END $$;

-- Make value NOT NULL with default
ALTER TABLE preferences ALTER COLUMN value SET DEFAULT '{}';
DO $$ 
BEGIN
  UPDATE preferences SET value = '{}' WHERE value IS NULL;
  ALTER TABLE preferences ALTER COLUMN value SET NOT NULL;
END $$;

-- Ensure env column exists and has a default
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'preferences' 
    AND column_name = 'env'
  ) THEN
    ALTER TABLE preferences ADD COLUMN env TEXT NOT NULL DEFAULT 'prod';
  END IF;
END $$;

-- Set default 'prod' for any existing NULL env values
UPDATE preferences SET env = 'prod' WHERE env IS NULL;

-- Add index on (key, env) for faster lookups
CREATE INDEX IF NOT EXISTS idx_preferences_key_env ON preferences(key, env);
