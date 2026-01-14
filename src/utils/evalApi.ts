/**
 * Eval API Client
 * 
 * Provides functions to interact with the eval API endpoints.
 */

import { WorkflowEval, WorkflowEvalRun } from '../types';

const API_BASE = '/api/evals';

/**
 * Get all evals for a workflow
 * @param {string} workflowId - Workflow UUID
 * @returns {Promise<WorkflowEval[]>}
 */
export async function getWorkflowEvals(workflowId: string): Promise<WorkflowEval[]> {
  if (!workflowId || workflowId === 'undefined' || workflowId === 'null') {
    return [];
  }

  const response = await fetch(`${API_BASE}/workflow/${workflowId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    // If 404, return empty array (no evals found is not an error)
    if (response.status === 404) {
      return [];
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get evals: ${response.statusText}`);
  }

  const data = await response.json();
  return data.evals || [];
}

/**
 * Get eval by ID
 * @param {string} evalId - Eval UUID
 * @returns {Promise<WorkflowEval>}
 */
export async function getEval(evalId: string): Promise<WorkflowEval> {
  const response = await fetch(`${API_BASE}/${evalId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get eval: ${response.statusText}`);
  }

  const data = await response.json();
  return data.eval;
}

/**
 * Run an evaluation
 * @param {string} evalId - Eval UUID
 * @returns {Promise<WorkflowEvalRun>}
 */
export async function runEval(evalId: string): Promise<WorkflowEvalRun> {
  const response = await fetch(`${API_BASE}/${evalId}/run`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to run eval: ${response.statusText}`);
  }

  const data = await response.json();
  return data.evalRun;
}

/**
 * Get eval runs for an eval
 * @param {string} evalId - Eval UUID
 * @param {number} [limit] - Limit results
 * @returns {Promise<WorkflowEvalRun[]>}
 */
export async function getWorkflowEvalRuns(evalId: string, limit?: number): Promise<WorkflowEvalRun[]> {
  const url = new URL(`${API_BASE}/${evalId}/runs`, window.location.origin);
  if (limit) {
    url.searchParams.set('limit', limit.toString());
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get eval runs: ${response.statusText}`);
  }

  const data = await response.json();
  return data.runs;
}

/**
 * Get eval run by ID
 * @param {string} runId - Eval run UUID
 * @returns {Promise<WorkflowEvalRun>}
 */
export async function getWorkflowEvalRun(runId: string): Promise<WorkflowEvalRun> {
  const response = await fetch(`${API_BASE}/runs/${runId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get eval run: ${response.statusText}`);
  }

  const data = await response.json();
  return data.evalRun;
}

/**
 * Seed evaluation for a workflow
 * This calls the workflows seed endpoint which seeds both workflow and eval
 * @returns {Promise<void>}
 */
export async function seedEval(): Promise<void> {
  const response = await fetch('/api/workflows/seed', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to seed eval: ${response.statusText}`);
  }

  // Response is not needed, just need to ensure it succeeded
  await response.json();
}
