/**
 * Feed Validation Tool
 * 
 * Validates an RSS/Atom feed URL by fetching and parsing it.
 * Returns metadata about the feed including freshness and activity.
 */

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000, // 10 second timeout
  maxRedirects: 5,
  customFields: {
    item: [],
  },
});

/**
 * Validate an RSS/Atom feed
 * @param {Object} params
 * @param {string} params.url - Feed URL to validate
 * @param {number} [params.freshnessDays=30] - Consider feed "fresh" if last item within N days
 * @returns {Promise<{ok: boolean, title?: string, siteUrl?: string, lastPublishedAt?: string, itemCount?: number, error?: string}>}
 */
export async function validateFeed({ url, freshnessDays = 30 }) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required and must be a string');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }

  try {
    // Fetch and parse feed
    const feed = await parser.parseURL(url);
    
    if (!feed) {
      return {
        ok: false,
        error: 'Failed to parse feed',
      };
    }

    // Extract feed metadata
    const title = feed.title || undefined;
    const siteUrl = feed.link || feed.feedUrl || undefined;
    
    // Get items and find most recent
    const items = feed.items || [];
    const itemCount = items.length;
    
    let lastPublishedAt = undefined;
    if (items.length > 0) {
      // Find most recent item by pubDate
      const dates = items
        .map(item => item.pubDate ? new Date(item.pubDate).getTime() : 0)
        .filter(time => time > 0);
      
      if (dates.length > 0) {
        const mostRecent = new Date(Math.max(...dates));
        lastPublishedAt = mostRecent.toISOString();
      }
    }

    // Check freshness
    let isFresh = true;
    if (lastPublishedAt && freshnessDays) {
      const lastDate = new Date(lastPublishedAt);
      const daysAgo = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      isFresh = daysAgo <= freshnessDays;
    }

    // Consider feed valid if it has at least a title and some items
    const isValid = !!title && itemCount > 0;

    return {
      ok: isValid,
      title,
      siteUrl,
      lastPublishedAt,
      itemCount,
      isFresh,
      error: isValid ? undefined : 'Feed appears inactive or invalid',
    };
  } catch (error) {
    // Retry once on network errors
    if (error.message?.includes('timeout') || error.message?.includes('network')) {
      try {
        console.log(`[FeedValidation] Retrying feed validation for ${url}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        const feed = await parser.parseURL(url);
        const items = feed.items || [];
        
        return {
          ok: true,
          title: feed.title,
          siteUrl: feed.link || feed.feedUrl,
          lastPublishedAt: items[0]?.pubDate ? new Date(items[0].pubDate).toISOString() : undefined,
          itemCount: items.length,
        };
      } catch (retryError) {
        return {
          ok: false,
          error: `Network error: ${retryError.message}`,
        };
      }
    }

    return {
      ok: false,
      error: error.message || 'Failed to validate feed',
    };
  }
}
