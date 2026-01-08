/**
 * Custom Feeds Router
 * 
 * Handles internally-generated RSS feeds that are scraped and maintained
 * by our backend rather than fetched from external RSS sources.
 * 
 * Currently supports:
 * - NeverEnough Newsletter (https://www.neverenough.com/newsletter)
 */

import express from 'express';
import { scrapeAllIssues, getFeedMetadata, SOURCE_NAME, ARCHIVE_URL, fetchArticleContent } from '../scrapers/neverenough.js';
import { isSupabaseConfigured } from '../db/supabaseClient.js';
import { getAppEnv } from '../db/env.js';
import * as feedRepo from '../db/feedRepository.js';

const router = express.Router();

// Constants for the NeverEnough feed
const NEVERENOUGH_FEED_URL = '/api/custom-feeds/neverenough/rss.xml';
const NEVERENOUGH_SOURCE_TYPE = 'custom';

/**
 * Ensure the NeverEnough feed exists in the database
 * Creates it if it doesn't exist
 * @returns {Promise<Object>} The feed object
 */
async function ensureNeverEnoughFeed() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured - custom feeds require database');
  }

  const fullFeedUrl = NEVERENOUGH_FEED_URL;
  
  // Check if feed already exists
  let feed = await feedRepo.getFeedByUrl(fullFeedUrl);
  
  if (!feed) {
    // Create the feed
    const metadata = getFeedMetadata();
    feed = await feedRepo.createFeed({
      url: fullFeedUrl,
      displayName: metadata.title,
      rssTitle: metadata.title,
      sourceType: NEVERENOUGH_SOURCE_TYPE,
    });
    console.log(`[Custom Feeds] Created NeverEnough feed with ID: ${feed.id}`);
  }
  
  return feed;
}

/**
 * POST /api/custom-feeds/neverenough/refresh
 * 
 * Scrapes the NeverEnough newsletter archive and stores new issues.
 * Idempotent - only inserts items that don't already exist.
 */
router.post('/neverenough/refresh', async (req, res) => {
  console.log('[Custom Feeds] NeverEnough refresh requested');
  
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ 
        error: 'Database not configured',
        message: 'Custom feeds require Supabase to be configured'
      });
    }

    // Ensure feed exists
    const feed = await ensureNeverEnoughFeed();
    
    // Scrape all issues
    console.log('[Custom Feeds] Starting NeverEnough scrape...');
    const issues = await scrapeAllIssues({ maxPages: 10 });
    
    if (issues.length === 0) {
      console.warn('[Custom Feeds] No issues found during scrape');
      return res.json({ 
        success: true, 
        message: 'Scrape completed but no issues found',
        newItems: 0,
        totalScraped: 0,
      });
    }

    // Get existing items to track what's new
    const existingItems = await feedRepo.getFeedItems({ feedId: feed.id });
    const existingUrls = new Set(existingItems.map(item => item.url));
    
    // Filter to only new items (items that don't exist yet)
    const newIssues = issues.filter(issue => !existingUrls.has(issue.url));
    
    if (newIssues.length === 0) {
      console.log('[Custom Feeds] No new issues to add');
      return res.json({
        success: true,
        message: 'No new issues found',
        newItems: 0,
        totalScraped: issues.length,
      });
    }

    // Sort by date descending (newest first) and limit to 5, like regular RSS feeds
    const sortedNewIssues = [...newIssues].sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
    const limitedNewIssues = sortedNewIssues.slice(0, 5);

    // Fetch full content for each new issue
    console.log(`[Custom Feeds] Fetching full content for ${limitedNewIssues.length} issues...`);
    for (const issue of limitedNewIssues) {
      if (!issue.fullContent) {
        issue.fullContent = await fetchArticleContent(issue.url);
        // Small delay between fetches to be respectful
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Transform issues to feed items format
    // Use feed.rssTitle as source for proper feed matching (consistent with other feeds)
    const feedItems = limitedNewIssues.map(issue => ({
      title: issue.title,
      url: issue.url,
      publishedAt: issue.publishedAt,
      contentSnippet: issue.contentSnippet,
      fullContent: issue.fullContent || '', // Include full article content
      source: feed.rssTitle || SOURCE_NAME, // Use rssTitle for proper feed matching
      sourceType: NEVERENOUGH_SOURCE_TYPE,
      status: 'inbox',
    }));

    // Upsert new items
    await feedRepo.upsertFeedItems(feed.id, feedItems);
    
    console.log(`[Custom Feeds] Added ${limitedNewIssues.length} new NeverEnough issues (limited to 5 most recent)`);
    
    return res.json({
      success: true,
      message: `Added ${limitedNewIssues.length} new issues`,
      newItems: limitedNewIssues.length,
      totalScraped: issues.length,
      totalNew: newIssues.length, // Total new items found (before limit)
    });
  } catch (error) {
    console.error('[Custom Feeds] Error refreshing NeverEnough feed:', error);
    return res.status(500).json({
      error: 'Failed to refresh feed',
      message: error.message,
    });
  }
});

/**
 * GET /api/custom-feeds/neverenough/rss.xml
 * 
 * Generates and serves an RSS 2.0 feed from stored NeverEnough issues.
 * This endpoint can be subscribed to like any external RSS feed.
 */
router.get('/neverenough/rss.xml', async (req, res) => {
  console.log('[Custom Feeds] NeverEnough RSS requested');
  
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ 
        error: 'Database not configured',
        message: 'Custom feeds require Supabase to be configured'
      });
    }

    // Ensure feed exists
    const feed = await ensureNeverEnoughFeed();
    
    // Get all items for this feed, ordered by date
    const items = await feedRepo.getFeedItems({ feedId: feed.id });
    
    // Get feed metadata
    const metadata = getFeedMetadata();
    
    // Generate RSS XML
    const rssXml = generateRssXml(metadata, items);
    
    // Set appropriate headers
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    return res.send(rssXml);
  } catch (error) {
    console.error('[Custom Feeds] Error generating NeverEnough RSS:', error);
    return res.status(500).json({
      error: 'Failed to generate RSS feed',
      message: error.message,
    });
  }
});

/**
 * GET /api/custom-feeds/neverenough/info
 * 
 * Returns information about the NeverEnough custom feed.
 * Useful for debugging and subscription setup.
 */
router.get('/neverenough/info', async (req, res) => {
  try {
    const metadata = getFeedMetadata();
    
    let feedInfo = {
      ...metadata,
      rssUrl: NEVERENOUGH_FEED_URL,
      sourceType: NEVERENOUGH_SOURCE_TYPE,
    };

    if (isSupabaseConfigured()) {
      try {
        const feed = await feedRepo.getFeedByUrl(NEVERENOUGH_FEED_URL);
        if (feed) {
          const items = await feedRepo.getFeedItems({ feedId: feed.id });
          feedInfo.feedId = feed.id;
          feedInfo.itemCount = items.length;
          feedInfo.status = 'active';
        } else {
          feedInfo.status = 'not_initialized';
          feedInfo.itemCount = 0;
        }
      } catch (e) {
        feedInfo.status = 'error';
        feedInfo.error = e.message;
      }
    } else {
      feedInfo.status = 'database_not_configured';
    }

    return res.json(feedInfo);
  } catch (error) {
    console.error('[Custom Feeds] Error getting NeverEnough info:', error);
    return res.status(500).json({
      error: 'Failed to get feed info',
      message: error.message,
    });
  }
});

/**
 * POST /api/custom-feeds/neverenough/refetch-content
 * 
 * Refetches full article content for existing items that are missing it.
 * This is useful for items that were stored before content fetching was added.
 */
router.post('/neverenough/refetch-content', async (req, res) => {
  console.log('[Custom Feeds] NeverEnough refetch-content requested');
  
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ 
        error: 'Database not configured',
        message: 'Custom feeds require Supabase to be configured'
      });
    }

    // Get feed
    const feed = await feedRepo.getFeedByUrl(NEVERENOUGH_FEED_URL);
    if (!feed) {
      return res.status(404).json({
        error: 'Feed not found',
        message: 'NeverEnough feed has not been initialized',
      });
    }
    
    // Get existing items that are missing fullContent
    const existingItems = await feedRepo.getFeedItems({ feedId: feed.id });
    const itemsMissingContent = existingItems.filter(item => 
      !item.fullContent || item.fullContent.trim() === ''
    );
    
    if (itemsMissingContent.length === 0) {
      return res.json({
        success: true,
        message: 'All items already have full content',
        updatedItems: 0,
      });
    }

    console.log(`[Custom Feeds] Fetching content for ${itemsMissingContent.length} items missing content...`);
    
    let updatedCount = 0;
    for (const item of itemsMissingContent) {
      try {
        const fullContent = await fetchArticleContent(item.url);
        if (fullContent) {
          // Update the item with full content
          await feedRepo.upsertFeedItems(feed.id, [{
            ...item,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            contentSnippet: item.contentSnippet,
            fullContent: fullContent,
            source: item.source,
            sourceType: item.sourceType,
            status: item.status,
          }]);
          updatedCount++;
          console.log(`[Custom Feeds] Updated content for: ${item.title}`);
        }
        // Small delay between fetches to be respectful
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`[Custom Feeds] Error fetching content for ${item.url}:`, e.message);
      }
    }
    
    console.log(`[Custom Feeds] Refetch complete. Updated ${updatedCount} items`);
    
    return res.json({
      success: true,
      message: `Updated content for ${updatedCount} items`,
      updatedItems: updatedCount,
      totalMissingContent: itemsMissingContent.length,
    });
  } catch (error) {
    console.error('[Custom Feeds] Error refetching content:', error);
    return res.status(500).json({
      error: 'Failed to refetch content',
      message: error.message,
    });
  }
});

/**
 * POST /api/custom-feeds/neverenough/load-older
 * 
 * Fetches and stores 5 older items than the oldest existing item.
 * Works like the "Get 5 older posts" feature for regular RSS feeds.
 */
router.post('/neverenough/load-older', async (req, res) => {
  console.log('[Custom Feeds] NeverEnough load-older requested');
  
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ 
        error: 'Database not configured',
        message: 'Custom feeds require Supabase to be configured'
      });
    }

    // Ensure feed exists
    const feed = await ensureNeverEnoughFeed();
    
    // Get all existing items to find the oldest
    const existingItems = await feedRepo.getFeedItems({ feedId: feed.id });
    
    if (existingItems.length === 0) {
      return res.status(400).json({
        error: 'No existing items',
        message: 'Cannot load older items: feed has no items. Use refresh first.',
      });
    }

    // Find the oldest existing item's timestamp
    const existingUrls = new Set(existingItems.map(item => item.url));
    const oldestExistingTimestamp = Math.min(
      ...existingItems
        .filter(item => item.publishedAt)
        .map(item => new Date(item.publishedAt).getTime())
    );
    
    console.log(`[Custom Feeds] Looking for items older than: ${new Date(oldestExistingTimestamp).toISOString()}`);

    // Scrape all pages to find older items
    const allIssues = await scrapeAllIssues({ maxPages: 10 });
    
    // Filter to items older than our oldest AND not already stored
    const olderIssues = allIssues
      .filter(issue => {
        if (!issue.publishedAt) return false;
        const issueTime = new Date(issue.publishedAt).getTime();
        return issueTime < oldestExistingTimestamp && !existingUrls.has(issue.url);
      })
      .sort((a, b) => {
        // Sort by date descending (newest of the old ones first)
        const dateA = new Date(a.publishedAt).getTime();
        const dateB = new Date(b.publishedAt).getTime();
        return dateB - dateA;
      })
      .slice(0, 5); // Limit to 5

    if (olderIssues.length === 0) {
      return res.json({
        success: true,
        message: 'No older items found. You may have reached the end of the archive.',
        newItems: 0,
      });
    }

    // Fetch full content for each older issue
    console.log(`[Custom Feeds] Fetching full content for ${olderIssues.length} older issues...`);
    for (const issue of olderIssues) {
      if (!issue.fullContent) {
        issue.fullContent = await fetchArticleContent(issue.url);
        // Small delay between fetches to be respectful
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Transform and insert items
    const feedItems = olderIssues.map(issue => ({
      title: issue.title,
      url: issue.url,
      publishedAt: issue.publishedAt,
      contentSnippet: issue.contentSnippet,
      fullContent: issue.fullContent || '', // Include full article content
      source: feed.rssTitle || SOURCE_NAME,
      sourceType: NEVERENOUGH_SOURCE_TYPE,
      status: 'inbox',
    }));

    await feedRepo.upsertFeedItems(feed.id, feedItems);
    
    console.log(`[Custom Feeds] Added ${olderIssues.length} older NeverEnough issues`);
    
    return res.json({
      success: true,
      message: `Added ${olderIssues.length} older items`,
      newItems: olderIssues.length,
      items: feedItems.map(item => ({
        title: item.title,
        publishedAt: item.publishedAt,
      })),
    });
  } catch (error) {
    console.error('[Custom Feeds] Error loading older NeverEnough items:', error);
    return res.status(500).json({
      error: 'Failed to load older items',
      message: error.message,
    });
  }
});

/**
 * Generate RSS 2.0 XML from feed metadata and items
 * @param {Object} metadata - Feed metadata
 * @param {Array} items - Feed items
 * @returns {string} RSS XML string
 */
function generateRssXml(metadata, items) {
  // Escape special XML characters
  const escapeXml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Format date to RFC 822 (required by RSS 2.0)
  const formatRfc822 = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toUTCString();
  };

  // Build items XML
  const itemsXml = items.map(item => {
    const pubDate = item.publishedAt ? `<pubDate>${formatRfc822(item.publishedAt)}</pubDate>` : '';
    const description = item.contentSnippet ? `<description>${escapeXml(item.contentSnippet)}</description>` : '';
    
    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      ${pubDate}
      ${description}
    </item>`;
  }).join('\n');

  // Build full RSS document
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(metadata.title)}</title>
    <link>${escapeXml(metadata.link)}</link>
    <description>${escapeXml(metadata.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${formatRfc822(new Date().toISOString())}</lastBuildDate>
    <atom:link href="${escapeXml(NEVERENOUGH_FEED_URL)}" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;

  return rss;
}

export default router;
export { ensureNeverEnoughFeed, NEVERENOUGH_FEED_URL };
