/**
 * Feeds Bulk Router
 *
 * Handles bulk operations on feeds, particularly OPML imports.
 */

import express from 'express';
import * as feedRepo from '../db/feedRepository.js';

const router = express.Router();

/**
 * POST /api/feeds/bulk
 *
 * Bulk create feeds from an OPML import.
 * Accepts up to 200 feeds per request to avoid memory issues.
 * Skips RSS item fetch — items will be loaded lazily on first navigation.
 */
router.post('/bulk', async (req, res) => {
  const { feeds } = req.body;
  const userId = req.user.id;

  // Validate request
  if (!Array.isArray(feeds) || feeds.length === 0) {
    return res.status(400).json({ error: 'feeds array is required' });
  }

  if (feeds.length > 200) {
    return res.status(400).json({ error: 'Maximum 200 feeds per import' });
  }

  const added = [];
  const duplicates = [];
  const failed = [];

  // Process each feed sequentially
  for (const feed of feeds) {
    const { url, displayName } = feed;

    // Validate feed object
    if (!url || typeof url !== 'string') {
      failed.push({ url: url || '', error: 'Invalid URL' });
      continue;
    }

    try {
      // Check if feed already exists (prevent duplicates)
      const existing = await feedRepo.getFeedByUrl(url, userId);
      if (existing) {
        duplicates.push(url);
        continue;
      }

      // Create the feed without fetching RSS items (skip rssTitle for now)
      const created = await feedRepo.createFeed({
        url,
        displayName: displayName || url,
        rssTitle: null,
        sourceType: 'rss',
        userId,
      });

      added.push(created);
    } catch (err) {
      // Handle unique constraint violation (race condition: another request just added this URL)
      if (err.code === '23505') {
        duplicates.push(url);
      } else {
        console.error('[Feeds/Bulk] Error creating feed', {
          userId,
          url,
          displayName,
          timestamp: new Date().toISOString(),
          errorMessage: err.message,
          errorCode: err.code,
        });
        failed.push({ url, error: err.message || 'Unknown error' });
      }
    }
  }

  return res.json({ added, duplicates, failed });
});

export default router;
