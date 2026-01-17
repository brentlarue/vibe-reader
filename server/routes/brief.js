/**
 * Brief Router
 * 
 * Handles daily brief functionality:
 * - Feed refresh
 * - Daily items query
 * - Brief metadata
 * - Audio storage
 * - Brief run tracking
 */

import express from 'express';
import * as feedRepo from '../db/feedRepository.js';
import * as briefRepo from '../db/briefRepository.js';
import { isSupabaseConfigured } from '../db/supabaseClient.js';
import { getAppEnv } from '../db/env.js';
import { retryWithBackoff, isRetriableError } from '../utils/retry.js';
import { aggregateCosts } from '../utils/costTracking.js';

const router = express.Router();

/**
 * POST /api/brief/refresh
 * Refresh all RSS feeds
 */
router.post('/refresh', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const feeds = await feedRepo.getFeeds();
    const rssFeeds = feeds.filter(f => f.sourceType === 'rss');

    if (rssFeeds.length === 0) {
      return res.json({
        success: true,
        feedsRefreshed: 0,
        itemsAdded: 0,
        message: 'No RSS feeds to refresh',
      });
    }

    let totalItemsAdded = 0;
    const errors = [];

    // Refresh each feed
    for (const feed of rssFeeds) {
      try {
        // Use retry logic for feed parsing
        const parsedFeed = await retryWithBackoff(
          async () => {
            const Parser = (await import('rss-parser')).default;
            const parser = new Parser({
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TheSignalReader/1.0)',
                'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
              },
              customFields: {
                item: [
                  ['content:encoded', 'contentEncoded'],
                  ['content', 'content'],
                ],
              },
            });
            return await parser.parseURL(feed.url);
          },
          {
            maxRetries: 2,
            initialDelay: 1000,
            shouldRetry: isRetriableError,
          }
        );
        
        // Parse dates
        const parseDate = (item) => {
          const dateFields = [
            item.pubDate,
            item.isoDate,
            item.published,
            item.updated,
            item.date,
          ];
          
          for (const dateStr of dateFields) {
            if (!dateStr) continue;
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              return parsed.toISOString();
            }
          }
          return null;
        };

        // Get existing items for this feed to check for duplicates
        const existingItems = await feedRepo.getFeedItems({ feedId: feed.id });
        const existingUrls = new Set(existingItems.map(item => item.url));

        // Transform RSS items to FeedItem format
        const newItems = (parsedFeed.items || [])
          .filter(item => {
            const url = item.link || '';
            return url && !existingUrls.has(url);
          })
          .map(item => {
            const url = item.link || '';
            const guid = item.guid || item.id || url;
            
            return {
              externalId: guid,
              title: item.title || 'Untitled',
              url: url,
              publishedAt: parseDate(item) || new Date().toISOString(),
              contentSnippet: item.contentSnippet || item.summary || '',
              fullContent: item.contentEncoded || item.content || item['content:encoded'] || item.description || '',
              source: parsedFeed.title || feed.rssTitle || feed.name,
              sourceType: 'rss',
              status: 'inbox',
            };
          });

        if (newItems.length > 0) {
          await feedRepo.upsertFeedItems(feed.id, newItems);
          totalItemsAdded += newItems.length;
          console.log(`[Brief] Refreshed feed ${feed.name}: ${newItems.length} new items`);
        }
      } catch (error) {
        console.error(`[Brief] Error refreshing feed ${feed.name}:`, error);
        errors.push({
          feed: feed.name,
          error: error.message || 'Unknown error',
        });
      }
    }

    return res.json({
      success: true,
      feedsRefreshed: rssFeeds.length,
      itemsAdded: totalItemsAdded,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Brief] Error refreshing feeds:', error);
    return res.status(500).json({
      error: 'Failed to refresh feeds',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/brief/items
 * Get items for a specific date (for daily brief)
 * Query params: date (YYYY-MM-DD, defaults to today)
 */
router.get('/items', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const items = await briefRepo.getBriefItems(date);
    
    return res.json(items);
  } catch (error) {
    console.error('[Brief] Error fetching brief items:', error);
    return res.status(500).json({
      error: 'Failed to fetch brief items',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/brief/metadata
 * Get brief metadata for a specific date
 * Query params: date (YYYY-MM-DD, defaults to today)
 */
router.get('/metadata', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const metadata = await briefRepo.getBriefMetadata(date);
    
    // Include cost summary if available
    if (metadata.runMetadata) {
      const costSummary = aggregateCosts(metadata.runMetadata);
      metadata.costSummary = costSummary;
    }
    
    return res.json(metadata);
  } catch (error) {
    console.error('[Brief] Error fetching brief metadata:', error);
    return res.status(500).json({
      error: 'Failed to fetch brief metadata',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * POST /api/brief/audio
 * Store audio URL for an item
 * Body: { itemId: string, audioUrl: string, order?: number }
 */
router.post('/audio', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { itemId, audioUrl, order } = req.body;

    if (!itemId || !audioUrl) {
      return res.status(400).json({ error: 'itemId and audioUrl are required' });
    }

    await briefRepo.updateItemAudioBrief(itemId, audioUrl, order);
    
    return res.json({ success: true });
  } catch (error) {
    console.error('[Brief] Error storing audio URL:', error);
    return res.status(500).json({
      error: 'Failed to store audio URL',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/brief/runs
 * Get recent brief runs
 * Query params: limit (defaults to 10)
 */
router.get('/runs', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const runs = await briefRepo.getRecentBriefRuns(limit, offset);
    
    return res.json(runs);
  } catch (error) {
    console.error('[Brief] Error fetching brief runs:', error);
    return res.status(500).json({
      error: 'Failed to fetch brief runs',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/brief/runs/:date
 * Get brief run for a specific date
 */
router.get('/runs/:date', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { date } = req.params;
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const run = await briefRepo.getBriefRun(date);
    
    if (!run) {
      return res.status(404).json({ error: 'Brief run not found' });
    }
    
    return res.json(run);
  } catch (error) {
    console.error('[Brief] Error fetching brief run:', error);
    return res.status(500).json({
      error: 'Failed to fetch brief run',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * POST /api/brief/runs
 * Create or update a brief run
 * Body: { date: string, status: string, metadata?: object, errorMessage?: string, errorDetails?: object }
 */
router.post('/runs', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { date, status, metadata, errorMessage, errorDetails } = req.body;

    if (!date || !status) {
      return res.status(400).json({ error: 'date and status are required' });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const updates = {
      status,
      metadata: metadata || {},
    };

    if (status === 'running') {
      updates.started_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updates.error_message = errorMessage;
      // Ensure error is tracked in metadata
      if (!updates.metadata.errors) {
        updates.metadata.errors = [];
      }
      updates.metadata.errors.push({
        message: errorMessage,
        details: errorDetails || {},
        timestamp: new Date().toISOString(),
      });
    }

    if (errorDetails) {
      updates.error_details = errorDetails;
    }

    // Aggregate cost data if metadata contains cost information
    if (metadata && (metadata.openAICosts || metadata.elevenLabsCosts || metadata.costs)) {
      const costSummary = aggregateCosts(metadata);
      updates.metadata.costSummary = costSummary;
    }

    const run = await briefRepo.upsertBriefRun(date, updates);
    
    return res.json(run);
  } catch (error) {
    console.error('[Brief] Error upserting brief run:', error);
    return res.status(500).json({
      error: 'Failed to upsert brief run',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/brief/storage-url
 * Get the Supabase Storage URL pattern for audio briefs
 * Returns: { storageUrl: string } where storageUrl is the base URL for audio-briefs bucket
 */
router.get('/storage-url', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      return res.status(503).json({ error: 'Supabase URL not configured' });
    }

    // Extract project ref from URL (e.g., https://xxxxx.supabase.co)
    const match = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
    if (!match) {
      return res.status(500).json({ error: 'Invalid Supabase URL format' });
    }

    const projectRef = match[1];
    const storageUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/audio-briefs`;
    
    return res.json({ storageUrl });
  } catch (error) {
    console.error('[Brief] Error getting storage URL:', error);
    return res.status(500).json({
      error: 'Failed to get storage URL',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * DELETE /api/brief/:date
 * Delete a daily brief (run record and audio file)
 */
router.delete('/:date', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { date } = req.params;
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const env = getAppEnv();

    // Get the brief run to check if audio file exists
    const run = await briefRepo.getBriefRun(date);
    
    if (!run) {
      return res.status(404).json({ error: 'Brief not found' });
    }

    // Delete audio file from Supabase Storage if it exists
    const audioFilePath = `${date}.mp3`;
    try {
      const supabaseModule = await import('../db/supabaseClient.js');
      const supabase = supabaseModule.supabase;
      
      if (supabase) {
        const { error: storageError } = await supabase
          .storage
          .from('audio-briefs')
          .remove([audioFilePath]);

        if (storageError && storageError.message !== 'Object not found') {
          console.warn(`[Brief] Error deleting audio file ${audioFilePath}:`, storageError);
          // Continue with database deletion even if storage deletion fails
        } else {
          console.log(`[Brief] Deleted audio file: ${audioFilePath}`);
        }
      }
    } catch (storageErr) {
      console.warn(`[Brief] Error accessing storage to delete file:`, storageErr);
      // Continue with database deletion
    }

    // Delete the brief run from database
    const supabaseModule = await import('../db/supabaseClient.js');
    const supabase = supabaseModule.supabase;
    
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { error: deleteError } = await supabase
      .from('daily_brief_runs')
      .delete()
      .eq('date', date)
      .eq('env', env);

    if (deleteError) {
      console.error('[Brief] Error deleting brief run:', deleteError);
      throw deleteError;
    }

    console.log(`[Brief] Deleted brief for ${date}`);
    
    return res.json({ success: true, message: 'Brief deleted successfully' });
  } catch (error) {
    console.error('[Brief] Error deleting brief:', error);
    return res.status(500).json({
      error: 'Failed to delete brief',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * POST /api/brief/generate
 * Trigger n8n workflow to generate a daily brief
 * Body: { date?: string } (optional, defaults to today)
 */
router.post('/generate', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { date } = req.body;
    const briefDate = date || new Date().toISOString().split('T')[0];
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(briefDate)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Check if n8n webhook URL is configured
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      return res.status(503).json({ error: 'n8n webhook URL not configured' });
    }

    // Check if brief already exists for this date
    const existingRun = await briefRepo.getBriefRun(briefDate);
    
    if (existingRun && existingRun.status === 'completed') {
      // Get current article count for this date
      const currentItems = await briefRepo.getBriefItems(briefDate);
      const currentArticleCount = currentItems.length;
      
      // Get article count from existing brief metadata
      const existingArticleCount = existingRun.metadata?.articleCount || 0;
      
      // If article counts match, prevent regeneration
      if (currentArticleCount === existingArticleCount && existingArticleCount > 0) {
        return res.status(409).json({
          error: 'Brief already exists',
          message: `A brief for ${briefDate} already exists with ${existingArticleCount} articles. No need to regenerate.`,
          date: briefDate,
          articleCount: existingArticleCount,
        });
      }
      
      // If article counts differ or no audio exists, allow regeneration (will replace existing)
      console.log(`[Brief] Regenerating brief for ${briefDate}: existing count=${existingArticleCount}, new count=${currentArticleCount}`);
    }

    // Create or update brief run status to "running"
    await briefRepo.upsertBriefRun(briefDate, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    // Trigger n8n workflow via webhook
    try {
      const webhookResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: briefDate,
        }),
      });

      if (!webhookResponse.ok) {
        throw new Error(`n8n webhook returned ${webhookResponse.status}`);
      }

      const webhookData = await webhookResponse.json().catch(() => ({}));
      
      return res.json({
        success: true,
        date: briefDate,
        message: 'Brief generation started',
        executionId: webhookData.executionId || null,
      });
    } catch (webhookError) {
      // Update brief run status to failed
      await briefRepo.upsertBriefRun(briefDate, {
        status: 'failed',
        error_message: `Failed to trigger workflow: ${webhookError.message}`,
        completed_at: new Date().toISOString(),
      });

      return res.status(500).json({
        error: 'Failed to trigger workflow',
        message: webhookError.message,
      });
    }
  } catch (error) {
    console.error('[Brief] Error triggering generation:', error);
    return res.status(500).json({
      error: 'Failed to trigger brief generation',
      message: error.message || 'Unknown error',
    });
  }
});

export default router;
