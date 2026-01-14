/**
 * Eval Repository
 * 
 * Data access layer for workflow evals and eval runs using Supabase.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getAppEnv } from './env.js';

// ============================================================================
// WORKFLOW EVALS
// ============================================================================

/**
 * Get a workflow eval by ID
 * @param {string} evalId - Eval UUID
 * @returns {Promise<Object|null>} Eval object or null
 */
export async function getWorkflowEval(evalId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_evals')
    .select('*')
    .eq('id', evalId)
    .eq('env', env)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[DB] Error fetching workflow eval:', error);
    throw error;
  }

  return data ? transformWorkflowEval(data) : null;
}

/**
 * Get all evals for a workflow
 * @param {string} workflowId - Workflow UUID
 * @returns {Promise<Array>} List of evals
 */
export async function getWorkflowEvals(workflowId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_evals')
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('env', env)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] Error fetching workflow evals:', error);
    throw error;
  }

  return (data || []).map(transformWorkflowEval);
}

/**
 * Create a workflow eval
 * @param {Object} eval - Eval data
 * @param {string} eval.workflowId - Workflow UUID
 * @param {string} eval.name - Eval name
 * @param {Array} eval.casesJson - Eval cases array
 * @returns {Promise<Object>} Created eval
 */
export async function createWorkflowEval({ workflowId, name, casesJson }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_evals')
    .insert({
      workflow_id: workflowId,
      name,
      cases_json: casesJson || [],
      env,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating workflow eval:', error);
    throw error;
  }

  return transformWorkflowEval(data);
}

// ============================================================================
// WORKFLOW EVAL RUNS
// ============================================================================

/**
 * Create a workflow eval run
 * @param {Object} run - Run data
 * @param {string} run.evalId - Eval UUID
 * @param {string} [run.runId] - Workflow run UUID (optional)
 * @param {Object} run.resultsJson - Results JSON
 * @param {number} [run.score] - Overall score
 * @param {boolean} [run.passed] - Whether eval passed
 * @returns {Promise<Object>} Created eval run
 */
export async function createWorkflowEvalRun({ evalId, runId, resultsJson, score, passed }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_eval_runs')
    .insert({
      eval_id: evalId,
      run_id: runId || null,
      results_json: resultsJson,
      score: score || null,
      passed: passed !== undefined ? passed : null,
      env,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating workflow eval run:', error);
    throw error;
  }

  return transformWorkflowEvalRun(data);
}

/**
 * Get all eval runs for an eval
 * @param {string} evalId - Eval UUID
 * @param {number} [limit] - Limit results
 * @returns {Promise<Array>} List of eval runs
 */
export async function getWorkflowEvalRuns(evalId, limit) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  let query = supabase
    .from('workflow_eval_runs')
    .select('*')
    .eq('eval_id', evalId)
    .eq('env', env)
    .order('created_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[DB] Error fetching workflow eval runs:', error);
    throw error;
  }

  return (data || []).map(transformWorkflowEvalRun);
}

/**
 * Get an eval run by ID
 * @param {string} runId - Eval run UUID
 * @returns {Promise<Object|null>} Eval run object or null
 */
export async function getWorkflowEvalRun(runId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_eval_runs')
    .select('*')
    .eq('id', runId)
    .eq('env', env)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[DB] Error fetching workflow eval run:', error);
    throw error;
  }

  return data ? transformWorkflowEvalRun(data) : null;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Transform database workflow eval to frontend format
 * @param {Object} dbEval - Database row
 * @returns {Object} Frontend-compatible workflow eval
 */
function transformWorkflowEval(dbEval) {
  return {
    id: dbEval.id,
    workflowId: dbEval.workflow_id,
    name: dbEval.name,
    casesJson: dbEval.cases_json,
    env: dbEval.env,
    createdAt: dbEval.created_at,
  };
}

/**
 * Transform database workflow eval run to frontend format
 * @param {Object} dbRun - Database row
 * @returns {Object} Frontend-compatible workflow eval run
 */
function transformWorkflowEvalRun(dbRun) {
  return {
    id: dbRun.id,
    evalId: dbRun.eval_id,
    runId: dbRun.run_id,
    resultsJson: dbRun.results_json,
    score: dbRun.score,
    passed: dbRun.passed,
    env: dbRun.env,
    createdAt: dbRun.created_at,
  };
}
