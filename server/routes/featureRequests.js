import express from 'express';
import { isSupabaseConfigured } from '../db/supabaseClient.js';
import {
  listFeatureRequests,
  createFeatureRequest,
  toggleVote,
} from '../db/featureRequestRepository.js';

const router = express.Router();

// GET /api/feature-requests?sort=top|new
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({
        error: 'Database not configured',
        message: 'Feature requests require Supabase to be configured',
      });
    }

    const sort = req.query.sort === 'new' ? 'new' : 'top'; // default 'top'
    const requests = await listFeatureRequests(req.user.id, sort);

    return res.json(requests);
  } catch (error) {
    console.error('[FeatureRequests] GET error:', error);
    return res.status(500).json({
      error: 'Failed to load feature requests',
      message: error.message,
    });
  }
});

// POST /api/feature-requests
router.post('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({
        error: 'Database not configured',
        message: 'Feature requests require Supabase to be configured',
      });
    }

    const { title, description } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Title is required',
      });
    }

    const request = await createFeatureRequest(
      req.user.id,
      req.user.email,
      title.trim(),
      description ? description.trim() : null
    );

    return res.status(201).json({
      success: true,
      message: 'Feature request created',
      data: request,
    });
  } catch (error) {
    console.error('[FeatureRequests] POST error:', error);
    return res.status(500).json({
      error: 'Failed to create feature request',
      message: error.message,
    });
  }
});

// POST /api/feature-requests/:id/vote
router.post('/:id/vote', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({
        error: 'Database not configured',
        message: 'Feature requests require Supabase to be configured',
      });
    }

    const result = await toggleVote(req.user.id, req.params.id);

    return res.json({
      success: true,
      message: result.voted ? 'Voted' : 'Unvoted',
      data: result,
    });
  } catch (error) {
    console.error('[FeatureRequests] Vote error:', error);
    return res.status(500).json({
      error: 'Failed to toggle vote',
      message: error.message,
    });
  }
});

export default router;
