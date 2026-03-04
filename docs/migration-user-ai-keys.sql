-- Migration: User AI Keys
-- Allows each user to store their own encrypted API keys for LLM providers

CREATE TABLE user_ai_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
  encrypted_key TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  env TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, env)
);

-- Index for fast lookups by user
CREATE INDEX idx_user_ai_keys_user_id ON user_ai_keys(user_id);

-- RLS policies (service role bypasses these, but good practice)
ALTER TABLE user_ai_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own keys"
  ON user_ai_keys
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
