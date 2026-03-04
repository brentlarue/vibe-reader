-- Migration: Add feature_requests and feature_request_votes tables
-- Purpose: HN-style feature request board with upvoting

CREATE TABLE IF NOT EXISTS feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  vote_count INT NOT NULL DEFAULT 1,
  env TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_request_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  env TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(feature_request_id, user_id, env)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feature_requests_env_vote_count ON feature_requests(env, vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_feature_requests_env_created_at ON feature_requests(env, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_request_votes_request_id ON feature_request_votes(feature_request_id);
CREATE INDEX IF NOT EXISTS idx_feature_request_votes_user_id_env ON feature_request_votes(user_id, env);

-- RPC functions for atomic vote operations
CREATE OR REPLACE FUNCTION increment_feature_request_votes(request_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE feature_requests SET vote_count = vote_count + 1, updated_at = now() WHERE id = request_id;
$$;

CREATE OR REPLACE FUNCTION decrement_feature_request_votes(request_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE feature_requests SET vote_count = GREATEST(vote_count - 1, 0), updated_at = now() WHERE id = request_id;
$$;

-- RLS: Strategy B (permissive, app-layer isolation)
ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on feature_requests" ON feature_requests
  FOR ALL
  USING ((select auth.role()) IN ('authenticated', 'service_role'))
  WITH CHECK ((select auth.role()) IN ('authenticated', 'service_role'));

ALTER TABLE feature_request_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on feature_request_votes" ON feature_request_votes
  FOR ALL
  USING ((select auth.role()) IN ('authenticated', 'service_role'))
  WITH CHECK ((select auth.role()) IN ('authenticated', 'service_role'));
