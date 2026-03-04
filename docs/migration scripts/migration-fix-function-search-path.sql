-- Migration: Fix function search path security issues
-- Purpose: Prevent SQL injection via mutable search_path on RPC functions
-- Resolves: "Function Search Path Mutable" warnings from Supabase Security Advisor

-- Drop and recreate increment_feature_request_votes with immutable search_path
DROP FUNCTION IF EXISTS increment_feature_request_votes(uuid);

CREATE FUNCTION increment_feature_request_votes(request_id UUID)
RETURNS void
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  UPDATE feature_requests SET vote_count = vote_count + 1, updated_at = now() WHERE id = request_id;
$$;

-- Drop and recreate decrement_feature_request_votes with immutable search_path
DROP FUNCTION IF EXISTS decrement_feature_request_votes(uuid);

CREATE FUNCTION decrement_feature_request_votes(request_id UUID)
RETURNS void
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  UPDATE feature_requests SET vote_count = GREATEST(vote_count - 1, 0), updated_at = now() WHERE id = request_id;
$$;
