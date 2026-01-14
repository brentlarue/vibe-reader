/**
 * Workflow API Routes
 * 
 * Provides endpoints for managing workflows and executing workflow runs.
 * All endpoints require authentication.
 */

import express from 'express';
import { getWorkflowBySlug, getWorkflow, getWorkflowRuns, getWorkflowRun, getWorkflows, getWorkflowRunSteps, updateWorkflowRun } from '../db/workflowRepository.js';
import { runWorkflow } from '../workflows/runner.js';
import { seedFeedDiscoveryWorkflow, seedFeedDiscoveryEval } from '../workflows/seed.js';

const router = express.Router();

/**
 * GET /api/workflows
 * Get all workflows
 */
router.get('/', async (req, res) => {
  try {
    const workflows = await getWorkflows();

    return res.json({
      success: true,
      workflows,
    });
  } catch (error) {
    console.error('[Workflow] Error fetching workflows:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/workflows/seed
 * Seed default workflows (feed discovery) and evals
 */
router.post('/seed', async (req, res) => {
  try {
    const workflow = await seedFeedDiscoveryWorkflow();
    
    // Also seed eval
    let workflowEval = null;
    try {
      workflowEval = await seedFeedDiscoveryEval();
    } catch (error) {
      console.warn('[Workflow] Failed to seed eval:', error.message);
    }

    return res.json({
      success: true,
      workflow,
      eval: workflowEval,
      message: 'Workflow and eval seeded successfully',
    });
  } catch (error) {
    console.error('[Workflow] Error seeding workflow:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/workflows/:slug/run
 * Execute a workflow by slug
 * Body: { input, userId?, fromStepId?, originalRunId? }
 */
router.post('/:slug/run', async (req, res) => {
  try {
    const { slug } = req.params;
    const { input, userId, fromStepId, originalRunId } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    // Get workflow
    const workflow = await getWorkflowBySlug(slug);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow not found: ${slug}` });
    }

    // If rerunning from a step, we need to get the original run's input
    let workflowInput = input;
    if (fromStepId && originalRunId) {
      const originalRun = await getWorkflowRun(originalRunId);
      if (originalRun) {
        workflowInput = originalRun.inputJson;
      }
    }

    // Run workflow
    const result = await runWorkflow(workflow, workflowInput, userId, fromStepId);

    return res.json({
      success: true,
      run: result,
    });
  } catch (error) {
    console.error('[Workflow] Error executing workflow:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/workflows/runs/:runId/cancel
 * Cancel a running workflow
 */
router.post('/runs/:runId/cancel', async (req, res) => {
  try {
    const { runId } = req.params;

    // Get the run to check its current status
    const run = await getWorkflowRun(runId);
    if (!run) {
      return res.status(404).json({ error: `Workflow run not found: ${runId}` });
    }

    // Only allow cancelling runs that are pending or running
    if (run.status !== 'pending' && run.status !== 'running') {
      return res.status(400).json({ 
        error: `Cannot cancel workflow run with status: ${run.status}` 
      });
    }

    // Update run status to cancelled
    const finishedAt = new Date().toISOString();
    const updated = await updateWorkflowRun(runId, {
      status: 'cancelled',
      finishedAt,
    });

    return res.json({
      success: true,
      run: updated,
    });
  } catch (error) {
    console.error('[Workflow] Error cancelling workflow run:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/workflows/:slug
 * Get workflow by slug
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const workflow = await getWorkflowBySlug(slug);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow not found: ${slug}` });
    }

    return res.json({
      success: true,
      workflow,
    });
  } catch (error) {
    console.error('[Workflow] Error fetching workflow:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/workflows/:slug
 * Update workflow definition
 * Body: { definitionJson }
 */
router.put('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { definitionJson } = req.body;

    if (!definitionJson) {
      return res.status(400).json({ error: 'definitionJson is required' });
    }

    const { updateWorkflow } = await import('../db/workflowRepository.js');
    const workflow = await getWorkflowBySlug(slug);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow not found: ${slug}` });
    }

    const updated = await updateWorkflow(workflow.id, { definitionJson });

    return res.json({
      success: true,
      workflow: updated,
    });
  } catch (error) {
    console.error('[Workflow] Error updating workflow:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/workflows/:slug/runs
 * Get workflow runs
 */
router.get('/:slug/runs', async (req, res) => {
  try {
    const { slug } = req.params;
    const { limit } = req.query;

    const workflow = await getWorkflowBySlug(slug);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow not found: ${slug}` });
    }

    const runs = await getWorkflowRuns(workflow.id, limit ? parseInt(limit) : undefined);

    return res.json({
      success: true,
      runs,
    });
  } catch (error) {
    console.error('[Workflow] Error fetching workflow runs:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/workflows/runs/:runId
 * Get workflow run by ID with steps
 */
router.get('/runs/:runId', async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await getWorkflowRun(runId);
    if (!run) {
      return res.status(404).json({ error: `Workflow run not found: ${runId}` });
    }

    // Get steps for this run
    const steps = await getWorkflowRunSteps(runId);

    return res.json({
      success: true,
      run: {
        ...run,
        steps,
      },
    });
  } catch (error) {
    console.error('[Workflow] Error fetching workflow run:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
