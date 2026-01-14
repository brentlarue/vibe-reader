/**
 * Workflow API Client
 * 
 * Provides functions to interact with the workflow API endpoints.
 */

import { Workflow, WorkflowRun, WorkflowRunStep } from '../types';

const API_BASE = '/api/workflows';

/**
 * Run a workflow
 * @param {string} slug - Workflow slug
 * @param {Object} input - Workflow input
 * @param {string} [userId] - User ID (optional)
 * @param {string} [fromStepId] - Step ID to start from (optional)
 * @returns {Promise<WorkflowRun>}
 */
export async function runWorkflow(
  slug: string,
  input: Record<string, unknown>,
  userId?: string,
  fromStepId?: string
): Promise<WorkflowRun> {
  const response = await fetch(`${API_BASE}/${slug}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ input, userId, fromStepId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to run workflow: ${response.statusText}`);
  }

  const data = await response.json();
  return data.run;
}

/**
 * Get workflow by slug
 * @param {string} slug - Workflow slug
 * @returns {Promise<Workflow>}
 */
export async function getWorkflow(slug: string): Promise<Workflow> {
  const response = await fetch(`${API_BASE}/${slug}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get workflow: ${response.statusText}`);
  }

  const data = await response.json();
  return data.workflow;
}

/**
 * Get workflow run by ID
 * @param {string} runId - Run ID
 * @returns {Promise<WorkflowRun>}
 */
export async function getWorkflowRun(runId: string): Promise<WorkflowRun> {
  const response = await fetch(`${API_BASE}/runs/${runId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get workflow run: ${response.statusText}`);
  }

  const data = await response.json();
  return data.run;
}

/**
 * Get workflow runs
 * @param {string} slug - Workflow slug
 * @param {number} [limit] - Limit results
 * @returns {Promise<WorkflowRun[]>}
 */
export async function getWorkflowRuns(slug: string, limit?: number): Promise<WorkflowRun[]> {
  const url = new URL(`${API_BASE}/${slug}/runs`, window.location.origin);
  if (limit) {
    url.searchParams.set('limit', limit.toString());
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get workflow runs: ${response.statusText}`);
  }

  const data = await response.json();
  return data.runs;
}

/**
 * Get all workflows
 * @returns {Promise<Workflow[]>}
 */
export async function getAllWorkflows(): Promise<Workflow[]> {
  const response = await fetch(API_BASE, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get workflows: ${response.statusText}`);
  }

  const data = await response.json();
  return data.workflows;
}

/**
 * Seed workflows
 * @returns {Promise<Workflow>}
 */
export async function seedWorkflows(): Promise<Workflow> {
  const response = await fetch(`${API_BASE}/seed`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to seed workflows: ${response.statusText}`);
  }

  const data = await response.json();
  return data.workflow;
}

/**
 * Update workflow definition
 * @param {string} slug - Workflow slug
 * @param {Object} definitionJson - Updated workflow definition
 * @returns {Promise<Workflow>}
 */
export async function updateWorkflowDefinition(
  slug: string,
  definitionJson: Record<string, unknown>
): Promise<Workflow> {
  const response = await fetch(`${API_BASE}/${slug}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ definitionJson }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to update workflow: ${response.statusText}`);
  }

  const data = await response.json();
  return data.workflow;
}

/**
 * Rerun workflow from a specific step
 * @param {string} slug - Workflow slug
 * @param {string} runId - Original run ID
 * @param {string} fromStepId - Step ID to start from
 * @param {Object} input - Workflow input
 * @returns {Promise<WorkflowRun>}
 */
export async function rerunFromStep(
  slug: string,
  runId: string,
  fromStepId: string,
  input: Record<string, unknown>
): Promise<WorkflowRun> {
  const response = await fetch(`${API_BASE}/${slug}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ input, fromStepId, originalRunId: runId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to rerun workflow: ${response.statusText}`);
  }

  const data = await response.json();
  return data.run;
}

/**
 * Cancel a running workflow
 * @param {string} runId - Run UUID
 * @returns {Promise<WorkflowRun>}
 */
export async function cancelWorkflowRun(runId: string): Promise<WorkflowRun> {
  const response = await fetch(`${API_BASE}/runs/${runId}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to cancel workflow: ${response.statusText}`);
  }

  const data = await response.json();
  return data.run;
}
