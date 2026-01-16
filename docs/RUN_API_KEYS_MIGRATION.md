# Running the API Keys Migration

The `api_keys` table needs to be created in your Supabase database before you can generate API keys.

## Option 1: Run via Supabase Dashboard (Easiest)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New query**
5. Copy and paste the contents of `docs/migration-add-api-keys.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned"

## Option 2: Check if Table Already Exists

1. In Supabase Dashboard → **Table Editor**
2. Look for a table called `api_keys`
3. If it exists, you're good! The error might be something else.
4. If it doesn't exist, run the migration (Option 1)

## After Running Migration

1. Restart your backend (`npm run dev`)
2. Try generating the API key again in your browser console
3. It should work now!

## If You Still Get Errors

Check your backend terminal for the exact error message. Common issues:
- Database connection problems
- Missing Supabase credentials in `.env`
- Table permissions issues
