/**
 * LLM Debug Routes
 * 
 * Provides debug endpoints for testing LLM calls without running full workflows.
 * All endpoints require authentication.
 */

import express from 'express';
import { callLLM } from '../llm/modelRouter.js';

const router = express.Router();

/**
 * POST /api/debug/llm
 * Test LLM call
 * Body: { model, system, user, jsonSchema, temperature }
 */
router.post('/llm', async (req, res) => {
  try {
    const { model, system, user, jsonSchema, temperature } = req.body;
    
    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }
    
    if (!system && !user) {
      return res.status(400).json({ error: 'Either system or user prompt is required' });
    }
    
    const result = await callLLM({
      model,
      system: system || '',
      user: user || '',
      jsonSchema: jsonSchema || undefined,
      temperature: temperature !== undefined ? temperature : undefined,
    });
    
    return res.json({
      success: true,
      output: result.output,
      tokens: result.tokens,
      cost: result.cost,
      duration: result.duration,
    });
  } catch (error) {
    console.error('[LLM] Error in debug endpoint:', error);
    
    // Return structured error
    return res.status(500).json({
      success: false,
      error: error.message,
      errorType: error.type || 'unknown',
      retryAfter: error.retryAfter,
    });
  }
});

export default router;
