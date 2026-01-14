/**
 * Tool Debug Routes
 * 
 * Provides debug endpoints for testing tools without running full workflows.
 * All endpoints require authentication.
 */

import express from 'express';
import { executeTool } from '../tools/adapters.js';

const router = express.Router();

/**
 * GET /api/debug/web-search
 * Test web search tool
 * Query params: q (query), limit (optional, default 10)
 */
router.get('/web-search', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    const result = await executeTool('web_search', {
      query: q,
      limit: parseInt(limit) || 5,
    });
    
    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        metadata: result.metadata,
      });
    }
    
    return res.json({
      success: true,
      results: result.data,
      count: result.data?.length || 0,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('[Tools] Error in web-search debug endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /api/debug/discover-feeds
 * Test feed discovery tool
 * Query params: url (website URL)
 */
router.get('/discover-feeds', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'Query parameter "url" is required' });
    }
    
    const result = await executeTool('discover_feed_urls', { url });
    
    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        metadata: result.metadata,
      });
    }
    
    return res.json({
      success: true,
      ...result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('[Tools] Error in discover-feeds debug endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /api/debug/validate-feed
 * Test feed validation tool
 * Query params: url (feed URL), freshnessDays (optional, default 30)
 */
router.get('/validate-feed', async (req, res) => {
  try {
    const { url, freshnessDays } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'Query parameter "url" is required' });
    }
    
    const result = await executeTool('validate_feed', {
      url,
      freshnessDays: freshnessDays ? parseInt(freshnessDays) : 30,
    });
    
    return res.json({
      success: result.success,
      ...result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('[Tools] Error in validate-feed debug endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

export default router;
