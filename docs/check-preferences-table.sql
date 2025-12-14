-- Diagnostic query to check preferences table structure
-- Run this in Supabase SQL Editor to verify the table is set up correctly

-- Check columns
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'preferences'
ORDER BY ordinal_position;

-- Check constraints
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.preferences'::regclass;

-- Check indexes
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'preferences' 
  AND schemaname = 'public';

-- Check current data (if any)
SELECT * FROM preferences LIMIT 10;
