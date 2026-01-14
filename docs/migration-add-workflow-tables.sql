-- Migration: Add workflow tables for agentic workflow system
-- This creates tables for workflows, runs, steps, and evals
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ============================================================================
-- WORKFLOWS TABLE
-- Stores workflow definitions (the templates/blueprints)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  definition_json JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  env TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique slug per environment
  UNIQUE(slug, env)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflows_slug ON workflows(slug);
CREATE INDEX IF NOT EXISTS idx_workflows_env ON workflows(env);
CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);

-- ============================================================================
-- WORKFLOW_RUNS TABLE
-- Stores individual workflow execution instances
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id TEXT,  -- Optional: for multi-user support in future
  input_json JSONB NOT NULL DEFAULT '{}',
  output_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'failed' | 'partial'
  cost_estimate NUMERIC(10, 4),  -- Estimated cost in USD
  actual_cost NUMERIC(10, 4),    -- Actual cost in USD
  env TEXT NOT NULL DEFAULT 'prod',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_env ON workflow_runs(env);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id ON workflow_runs(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- WORKFLOW_RUN_STEPS TABLE
-- Stores individual step executions within a workflow run
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,  -- Step ID from workflow definition
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,  -- 'llm' | 'tool' | 'transform' | 'gate'
  model TEXT,  -- Model name if LLM step (e.g., 'gpt-4o', 'gpt-4o-mini')
  prompt_system TEXT,  -- System prompt if LLM step
  prompt_user TEXT,    -- User prompt if LLM step
  input_json JSONB,    -- Step input data
  output_json JSONB,   -- Step output data
  tool_trace_json JSONB,  -- Tool execution trace (requests, responses)
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  error_message TEXT,  -- Error message if failed
  token_count INTEGER,  -- Token count if LLM step (total tokens)
  cost NUMERIC(10, 4),  -- Cost in USD for this step
  env TEXT NOT NULL DEFAULT 'prod',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run_id ON workflow_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_step_id ON workflow_run_steps(step_id);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_status ON workflow_run_steps(status);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_env ON workflow_run_steps(env);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_started_at ON workflow_run_steps(started_at);

-- ============================================================================
-- WORKFLOW_EVALS TABLE
-- Stores evaluation definitions (test cases)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_evals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cases_json JSONB NOT NULL DEFAULT '[]',
  env TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique name per workflow per environment
  UNIQUE(workflow_id, name, env)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflow_evals_workflow_id ON workflow_evals(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_evals_env ON workflow_evals(env);

-- ============================================================================
-- WORKFLOW_EVAL_RUNS TABLE
-- Stores evaluation execution results
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_id UUID NOT NULL REFERENCES workflow_evals(id) ON DELETE CASCADE,
  run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,  -- Optional: link to specific run
  results_json JSONB NOT NULL DEFAULT '{}',
  score NUMERIC(5, 2),  -- Overall score (0-100)
  passed BOOLEAN,       -- Whether eval passed (score >= threshold)
  env TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflow_eval_runs_eval_id ON workflow_eval_runs(eval_id);
CREATE INDEX IF NOT EXISTS idx_workflow_eval_runs_run_id ON workflow_eval_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_eval_runs_score ON workflow_eval_runs(score);
CREATE INDEX IF NOT EXISTS idx_workflow_eval_runs_passed ON workflow_eval_runs(passed);
CREATE INDEX IF NOT EXISTS idx_workflow_eval_runs_env ON workflow_eval_runs(env);
CREATE INDEX IF NOT EXISTS idx_workflow_eval_runs_created_at ON workflow_eval_runs(created_at DESC);

-- ============================================================================
-- TRIGGERS FOR updated_at
-- Automatically update the updated_at timestamp on row changes
-- ============================================================================

-- Trigger for workflows table
DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS and create policies (following security fix pattern)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_evals ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_eval_runs ENABLE ROW LEVEL SECURITY;

-- Create policies for workflows table
DROP POLICY IF EXISTS "Allow all operations on workflows" ON workflows;
CREATE POLICY "Allow all operations on workflows" ON workflows
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create policies for workflow_runs table
DROP POLICY IF EXISTS "Allow all operations on workflow_runs" ON workflow_runs;
CREATE POLICY "Allow all operations on workflow_runs" ON workflow_runs
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create policies for workflow_run_steps table
DROP POLICY IF EXISTS "Allow all operations on workflow_run_steps" ON workflow_run_steps;
CREATE POLICY "Allow all operations on workflow_run_steps" ON workflow_run_steps
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create policies for workflow_evals table
DROP POLICY IF EXISTS "Allow all operations on workflow_evals" ON workflow_evals;
CREATE POLICY "Allow all operations on workflow_evals" ON workflow_evals
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create policies for workflow_eval_runs table
DROP POLICY IF EXISTS "Allow all operations on workflow_eval_runs" ON workflow_eval_runs;
CREATE POLICY "Allow all operations on workflow_eval_runs" ON workflow_eval_runs
  FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- After running this migration:
-- 
-- 1. All tables are created with proper indexes and constraints
-- 2. RLS is enabled with permissive policies (service role bypasses anyway)
-- 3. updated_at triggers are set up for workflows table
-- 4. Environment isolation is built-in via 'env' column
-- 
-- Next steps:
-- - Add TypeScript types matching this schema
-- - Implement workflow repository functions
-- - Seed initial workflow definitions
