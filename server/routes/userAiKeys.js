/**
 * User AI Keys Routes
 *
 * Endpoints for managing per-user LLM API keys.
 */

import express from 'express';
import { saveUserAiKey, listUserAiKeys, deleteUserAiKey } from '../db/userAiKeyRepository.js';
import { validateKey } from '../llm/validateKey.js';

const router = express.Router();

const VALID_PROVIDERS = ['openai', 'anthropic', 'google'];

/**
 * GET /api/user-ai-keys
 * List saved keys (provider + hint only)
 */
router.get('/', async (req, res) => {
  try {
    const keys = await listUserAiKeys(req.user.id);
    return res.json({ keys });
  } catch (error) {
    console.error('[UserAiKeys] List error:', error);
    return res.status(500).json({ error: 'Failed to list keys' });
  }
});

/**
 * PUT /api/user-ai-keys/:provider
 * Validate + encrypt + save a key
 */
router.put('/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey } = req.body;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'apiKey is required' });
    }

    // Validate the key before saving
    const validation = await validateKey(provider, apiKey.trim());
    if (!validation.valid) {
      return res.status(400).json({
        error: 'API key validation failed',
        detail: validation.error,
      });
    }

    // Save the encrypted key
    const result = await saveUserAiKey(req.user.id, provider, apiKey.trim());
    return res.json(result);
  } catch (error) {
    console.error('[UserAiKeys] Save error:', error);
    return res.status(500).json({ error: 'Failed to save key' });
  }
});

/**
 * DELETE /api/user-ai-keys/:provider
 * Remove a key
 */
router.delete('/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }

    await deleteUserAiKey(req.user.id, provider);
    return res.json({ success: true });
  } catch (error) {
    console.error('[UserAiKeys] Delete error:', error);
    return res.status(500).json({ error: 'Failed to delete key' });
  }
});

export default router;
