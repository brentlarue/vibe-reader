/**
 * LLM Debug Routes
 *
 * Provides debug endpoints for testing LLM calls without running full workflows.
 * All endpoints require authentication.
 */

import express from 'express';
import { callLLM } from '../llm/modelRouter.js';
import { getModelProvider } from '../llm/config.js';
import { getUserAiKey } from '../db/userAiKeyRepository.js';

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

    // Resolve user's API key for this model's provider
    const provider = getModelProvider(model);
    const apiKey = await getUserAiKey(req.user.id, provider);

    if (!apiKey) {
      return res.status(400).json({
        error: `No ${provider} API key configured`,
        code: 'MISSING_USER_AI_KEY',
        message: `Add your ${provider} API key in Settings to use this model.`,
      });
    }

    const result = await callLLM({
      model,
      apiKey,
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

    return res.status(500).json({
      success: false,
      error: error.message,
      errorType: error.type || 'unknown',
      retryAfter: error.retryAfter,
    });
  }
});

export default router;
