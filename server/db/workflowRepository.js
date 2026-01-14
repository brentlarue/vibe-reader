/**
 * Workflow Repository
 * 
 * Data access layer for workflows, runs, and steps using Supabase.
 * All functions return plain JS objects suitable for the frontend.
 * 
 * All operations are scoped by environment (env column) to ensure
 * strict dev/prod data isolation.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getAppEnv } from './env.js';

// ============================================================================
// WORKFLOWS
// ============================================================================

/**
 * Get all workflows
 * @returns {Promise<Array>} List of workflows
 */
export async function getWorkflows() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('env', env)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error fetching workflows:', error);
    throw error;
  }

  return (data || []).map(transformWorkflow);
}

/**
 * Get a workflow by ID
 * @param {string} workflowId - Workflow UUID
 * @returns {Promise<Object|null>} Workflow object or null
 */
export async function getWorkflow(workflowId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .eq('env', env)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[DB] Error fetching workflow:', error);
    throw error;
  }

  return data ? transformWorkflow(data) : null;
}

/**
 * Get a workflow by slug
 * @param {string} slug - Workflow slug
 * @returns {Promise<Object|null>} Workflow object or null
 */
export async function getWorkflowBySlug(slug) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('slug', slug)
    .eq('env', env)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[DB] Error fetching workflow by slug:', error);
    throw error;
  }

  return data ? transformWorkflow(data) : null;
}

/**
 * Create a new workflow
 * @param {Object} workflow - Workflow data
 * @param {string} workflow.name - Workflow name
 * @param {string} workflow.slug - Workflow slug (unique)
 * @param {Object} workflow.definitionJson - Workflow definition JSON
 * @param {number} [workflow.version=1] - Version number
 * @returns {Promise<Object>} Created workflow
 */
export async function createWorkflow({ name, slug, definitionJson, version = 1 }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflows')
    .insert({
      name,
      slug,
      definition_json: definitionJson,
      version,
      env,
    })
    .select()
    .single();

  if (error) {
    // If duplicate key error, try to get the existing workflow
    if (error.code === '23505' || error.message?.includes('duplicate key')) {
      console.log('[DB] Workflow already exists, fetching existing workflow');
      const existing = await getWorkflowBySlug(slug);
      if (existing) {
        return existing;
      }
    }
    console.error('[DB] Error creating workflow:', error);
    throw error;
  }

  return transformWorkflow(data);
}

/**
 * Update a workflow
 * @param {string} workflowId - Workflow UUID
 * @param {Object} updates - Updates object
 * @param {string} [updates.name] - New name
 * @param {Object} [updates.definitionJson] - New definition JSON
 * @param {number} [updates.version] - New version
 * @returns {Promise<Object>} Updated workflow
 */
export async function updateWorkflow(workflowId, updates) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const updateData = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.definitionJson !== undefined) updateData.definition_json = updates.definitionJson;
  if (updates.version !== undefined) updateData.version = updates.version;

  const { data, error } = await supabase
    .from('workflows')
    .update(updateData)
    .eq('id', workflowId)
    .eq('env', env)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating workflow:', error);
    throw error;
  }

  return transformWorkflow(data);
}

// ============================================================================
// WORKFLOW RUNS
// ============================================================================

/**
 * Create a new workflow run
 * @param {Object} run - Run data
 * @param {string} run.workflowId - Workflow UUID
 * @param {string} [run.userId] - User ID (optional)
 * @param {Object} run.inputJson - Input JSON
 * @param {number} [run.costEstimate] - Estimated cost
 * @returns {Promise<Object>} Created run
 */
export async function createWorkflowRun({ workflowId, userId, inputJson, costEstimate }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_runs')
    .insert({
      workflow_id: workflowId,
      user_id: userId || null,
      input_json: inputJson || {},
      cost_estimate: costEstimate || null,
      status: 'pending',
      env,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating workflow run:', error);
    throw error;
  }

  return transformWorkflowRun(data);
}

/**
 * Get a workflow run by ID
 * @param {string} runId - Run UUID
 * @returns {Promise<Object|null>} Run object or null
 */
export async function getWorkflowRun(runId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .eq('env', env)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[DB] Error fetching workflow run:', error);
    throw error;
  }

  return data ? transformWorkflowRun(data) : null;
}

/**
 * Get all runs for a workflow
 * @param {string} workflowId - Workflow UUID
 * @param {number} [limit] - Limit results
 * @returns {Promise<Array>} List of runs
 */
export async function getWorkflowRuns(workflowId, limit) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  let query = supabase
    .from('workflow_runs')
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('env', env)
    .order('created_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[DB] Error fetching workflow runs:', error);
    throw error;
  }

  return (data || []).map(transformWorkflowRun);
}

/**
 * Update a workflow run
 * @param {string} runId - Run UUID
 * @param {Object} updates - Updates object
 * @param {string} [updates.status] - New status
 * @param {Object} [updates.outputJson] - Output JSON
 * @param {number} [updates.actualCost] - Actual cost
 * @param {string} [updates.startedAt] - Started timestamp
 * @param {string} [updates.finishedAt] - Finished timestamp
 * @returns {Promise<Object>} Updated run
 */
export async function updateWorkflowRun(runId, updates) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const updateData = {};
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.outputJson !== undefined) updateData.output_json = updates.outputJson;
  if (updates.actualCost !== undefined) updateData.actual_cost = updates.actualCost;
  if (updates.startedAt !== undefined) updateData.started_at = updates.startedAt;
  if (updates.finishedAt !== undefined) updateData.finished_at = updates.finishedAt;

  const { data, error } = await supabase
    .from('workflow_runs')
    .update(updateData)
    .eq('id', runId)
    .eq('env', env)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating workflow run:', error);
    throw error;
  }

  return transformWorkflowRun(data);
}

// ============================================================================
// WORKFLOW RUN STEPS
// ============================================================================

/**
 * Create a workflow run step
 * @param {Object} step - Step data
 * @param {string} step.runId - Run UUID
 * @param {string} step.stepId - Step ID from definition
 * @param {string} step.stepName - Step name
 * @param {string} step.stepType - Step type ('llm' | 'tool' | 'transform' | 'gate')
 * @param {string} [step.model] - Model name if LLM step
 * @param {string} [step.promptSystem] - System prompt if LLM step
 * @param {string} [step.promptUser] - User prompt if LLM step
 * @param {Object} [step.inputJson] - Input JSON
 * @returns {Promise<Object>} Created step
 */
export async function createWorkflowRunStep({
  runId,
  stepId,
  stepName,
  stepType,
  model,
  promptSystem,
  promptUser,
  inputJson,
}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_run_steps')
    .insert({
      run_id: runId,
      step_id: stepId,
      step_name: stepName,
      step_type: stepType,
      model: model || null,
      prompt_system: promptSystem || null,
      prompt_user: promptUser || null,
      input_json: inputJson || null,
      status: 'pending',
      env,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating workflow run step:', error);
    throw error;
  }

  return transformWorkflowRunStep(data);
}

/**
 * Get all steps for a workflow run
 * @param {string} runId - Run UUID
 * @returns {Promise<Array>} List of steps
 */
export async function getWorkflowRunSteps(runId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('workflow_run_steps')
    .select('*')
    .eq('run_id', runId)
    .eq('env', env)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error fetching workflow run steps:', error);
    throw error;
  }

  return (data || []).map(transformWorkflowRunStep);
}

/**
 * Update a workflow run step
 * @param {string} stepId - Step UUID
 * @param {Object} updates - Updates object
 * @param {string} [updates.status] - New status
 * @param {Object} [updates.outputJson] - Output JSON
 * @param {Object} [updates.toolTraceJson] - Tool trace JSON
 * @param {string} [updates.errorMessage] - Error message
 * @param {number} [updates.tokenCount] - Token count
 * @param {number} [updates.cost] - Cost
 * @param {string} [updates.startedAt] - Started timestamp
 * @param {string} [updates.finishedAt] - Finished timestamp
 * @returns {Promise<Object>} Updated step
 */
export async function updateWorkflowRunStep(stepId, updates) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const updateData = {};
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.outputJson !== undefined) updateData.output_json = updates.outputJson;
  if (updates.toolTraceJson !== undefined) updateData.tool_trace_json = updates.toolTraceJson;
  if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;
  if (updates.tokenCount !== undefined) updateData.token_count = updates.tokenCount;
  if (updates.cost !== undefined) updateData.cost = updates.cost;
  if (updates.startedAt !== undefined) updateData.started_at = updates.startedAt;
  if (updates.finishedAt !== undefined) updateData.finished_at = updates.finishedAt;

  const { data, error } = await supabase
    .from('workflow_run_steps')
    .update(updateData)
    .eq('id', stepId)
    .eq('env', env)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating workflow run step:', error);
    throw error;
  }

  return transformWorkflowRunStep(data);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Transform database workflow to frontend format
 * @param {Object} dbWorkflow - Database row
 * @returns {Object} Frontend-compatible workflow
 */
function transformWorkflow(dbWorkflow) {
  return {
    id: dbWorkflow.id,
    name: dbWorkflow.name,
    slug: dbWorkflow.slug,
    definitionJson: dbWorkflow.definition_json,
    version: dbWorkflow.version,
    env: dbWorkflow.env,
    createdAt: dbWorkflow.created_at,
    updatedAt: dbWorkflow.updated_at,
  };
}

/**
 * Transform database workflow run to frontend format
 * @param {Object} dbRun - Database row
 * @returns {Object} Frontend-compatible workflow run
 */
function transformWorkflowRun(dbRun) {
  return {
    id: dbRun.id,
    workflowId: dbRun.workflow_id,
    userId: dbRun.user_id,
    inputJson: dbRun.input_json,
    outputJson: dbRun.output_json,
    status: dbRun.status,
    costEstimate: dbRun.cost_estimate,
    actualCost: dbRun.actual_cost,
    env: dbRun.env,
    startedAt: dbRun.started_at,
    finishedAt: dbRun.finished_at,
    createdAt: dbRun.created_at,
  };
}

/**
 * Transform database workflow run step to frontend format
 * @param {Object} dbStep - Database row
 * @returns {Object} Frontend-compatible workflow run step
 */
function transformWorkflowRunStep(dbStep) {
  return {
    id: dbStep.id,
    runId: dbStep.run_id,
    stepId: dbStep.step_id,
    stepName: dbStep.step_name,
    stepType: dbStep.step_type,
    model: dbStep.model,
    promptSystem: dbStep.prompt_system,
    promptUser: dbStep.prompt_user,
    inputJson: dbStep.input_json,
    outputJson: dbStep.output_json,
    toolTraceJson: dbStep.tool_trace_json,
    status: dbStep.status,
    errorMessage: dbStep.error_message,
    tokenCount: dbStep.token_count,
    cost: dbStep.cost,
    env: dbStep.env,
    startedAt: dbStep.started_at,
    finishedAt: dbStep.finished_at,
    createdAt: dbStep.created_at,
  };
}
