-- Migration: Add API Keys for Automated Access
-- Allows n8n and other automated tools to authenticate without session cookies

-- ============================================================================
-- API_KEYS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the API key
  name TEXT NOT NULL, -- Human-readable name (e.g., "n8n workflow", "daily brief")
  env TEXT NOT NULL DEFAULT 'prod', -- 'dev' | 'prod'
  last_used_at TIMESTAMPTZ, -- Track when key was last used
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- Optional expiration (NULL = never expires)
  
  -- Ensure unique names per environment
  UNIQUE(name, env)
);

-- Index for fast lookups by hash
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_env ON api_keys(env);

-- Trigger for updated_at (if we add that column later)
-- For now, we'll just track last_used_at

-- Disable RLS (single-user app)
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- API keys are stored as SHA-256 hashes for security.
-- The plain key is only shown once when created.
-- 
-- Usage:
-- 1. Generate a key via POST /api/keys
-- 2. Use it in Authorization header: "Bearer <key>"
-- 3. Keys are scoped by environment (dev/prod)
-- 4. Keys can optionally expire
