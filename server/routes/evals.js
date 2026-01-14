/**
 * Eval API Routes
 * 
 * Provides endpoints for running and viewing workflow evaluations.
 * All endpoints require authentication.
 */

import express from 'express';
import {
  getWorkflowEval,
  getWorkflowEvals,
  getWorkflowEvalRuns,
  getWorkflowEvalRun,
} from '../db/evalRepository.js';
import { runEval } from '../evals/runner.js';

const router = express.Router();

/**
 * GET /api/evals/workflow/:workflowId
 * Get all evals for a workflow
 */
router.get('/workflow/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;

    if (!workflowId || workflowId === 'undefined' || workflowId === 'null') {
      return res.json({
        success: true,
        evals: [],
      });
    }

    const evals = await getWorkflowEvals(workflowId);

    return res.json({
      success: true,
      evals: evals || [],
    });
  } catch (error) {
    console.error('[Eval] Error fetching evals:', error);
    // Return empty array instead of error for missing evals
    if (error.message?.includes('not found') || error.code === 'PGRST116') {
      return res.json({
        success: true,
        evals: [],
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/evals/:id
 * Get eval by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const workflowEval = await getWorkflowEval(id);
    if (!workflowEval) {
      return res.status(404).json({ error: `Eval not found: ${id}` });
    }

    return res.json({
      success: true,
      eval: workflowEval,
    });
  } catch (error) {
    console.error('[Eval] Error fetching eval:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/evals/:id/run
 * Run an evaluation
 */
router.post('/:id/run', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await runEval(id);

    return res.json({
      success: true,
      evalRun: result,
    });
  } catch (error) {
    console.error('[Eval] Error running eval:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/evals/:id/runs
 * Get eval runs for an eval
 */
router.get('/:id/runs', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const runs = await getWorkflowEvalRuns(id, limit ? parseInt(limit) : undefined);

    return res.json({
      success: true,
      runs,
    });
  } catch (error) {
    console.error('[Eval] Error fetching eval runs:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/evals/runs/:runId
 * Get eval run by ID
 */
router.get('/runs/:runId', async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await getWorkflowEvalRun(runId);
    if (!run) {
      return res.status(404).json({ error: `Eval run not found: ${runId}` });
    }

    return res.json({
      success: true,
      evalRun: run,
    });
  } catch (error) {
    console.error('[Eval] Error fetching eval run:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
