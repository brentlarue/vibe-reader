-- Migration: Fix preferences table - Complete fix
-- This will add missing columns and handle existing data

-- Step 1: Add key column if missing
ALTER TABLE preferences 
ADD COLUMN IF NOT EXISTS key TEXT;

-- Step 2: Add value column if missing  
ALTER TABLE preferences 
ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}';

-- Step 3: Ensure env column exists with default
ALTER TABLE preferences 
ADD COLUMN IF NOT EXISTS env TEXT DEFAULT 'prod';

-- Step 4: Set default values for any NULL values
UPDATE preferences SET env = 'prod' WHERE env IS NULL;
UPDATE preferences SET value = '{}' WHERE value IS NULL;

-- Step 5: Delete any rows that don't have a key (they're invalid)
-- These rows can't be used anyway without a key
DELETE FROM preferences WHERE key IS NULL;

-- Step 6: Drop old unique constraint if it exists
ALTER TABLE preferences 
DROP CONSTRAINT IF EXISTS preferences_key_unique;

-- Step 7: Add unique constraint on (key, env)
ALTER TABLE preferences 
ADD CONSTRAINT preferences_key_env_unique UNIQUE (key, env);

-- Step 8: Now make key NOT NULL (safe since we deleted NULL keys)
ALTER TABLE preferences 
ALTER COLUMN key SET NOT NULL;

-- Step 9: Make value NOT NULL
ALTER TABLE preferences 
ALTER COLUMN value SET NOT NULL;

-- Step 10: Make env NOT NULL
ALTER TABLE preferences 
ALTER COLUMN env SET NOT NULL;

-- Step 11: Add index for performance
CREATE INDEX IF NOT EXISTS idx_preferences_key_env ON preferences(key, env);

-- Step 12: Verify the structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'preferences'
ORDER BY ordinal_position;
