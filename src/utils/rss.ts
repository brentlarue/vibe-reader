import { FeedItem } from '../types';
import { apiFetch } from './apiFetch';

/**
 * Normalizes URLs to RSS feed URLs for common platforms (Medium, Substack)
 * If the URL is already an RSS feed, returns it as-is
 */
export function normalizeFeedUrl(inputUrl: string): string {
  try {
    const url = new URL(inputUrl.trim());
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname;

    // Check if already an RSS feed URL
    const rssIndicators = ['.rss', '.xml', '/feed', '/rss', '/feed.xml', '/rss.xml'];
    const isAlreadyRss = rssIndicators.some(indicator => 
      pathname.toLowerCase().includes(indicator.toLowerCase())
    );

    if (isAlreadyRss) {
      return inputUrl.trim();
    }

    // Handle Medium URLs
    if (hostname.includes('medium.com')) {
      // Remove trailing slash from pathname if present
      let cleanPath = pathname.replace(/\/$/, '');
      
      // If path starts with /, insert /feed after it
      if (cleanPath.startsWith('/')) {
        const normalized = `${url.protocol}//${url.hostname}/feed${cleanPath}`;
        console.log('Normalized feed URL', inputUrl, '→', normalized);
        return normalized;
      } else {
        // Path doesn't start with / (unlikely but handle it)
        const normalized = `${url.protocol}//${url.hostname}/feed/${cleanPath}`;
        console.log('Normalized feed URL', inputUrl, '→', normalized);
        return normalized;
      }
    }

    // Handle Substack URLs (both .substack.com and custom domains)
    if (hostname.endsWith('.substack.com')) {
      // Substack feeds are always at /feed regardless of the page URL
      // Check if /feed is already in the path
      if (pathname.toLowerCase().includes('/feed')) {
        return inputUrl.trim();
      }
      
      // Always use root /feed for Substack
      const normalized = `${url.protocol}//${url.hostname}/feed`;
      console.log('Normalized feed URL', inputUrl, '→', normalized);
      return normalized;
    }

    // Handle custom Substack domains (domains that host Substack publications)
    // For any URL without RSS indicators, try appending /feed as many Substack publications use custom domains
    // We'll let the fetch function handle validation - if /feed doesn't work, it will throw an error
    // This is a best-effort approach for common patterns
    if (!isAlreadyRss) {
      // Try /feed for the root path (common Substack pattern)
      if (!pathname || pathname === '/' || pathname === '') {
        const normalized = `${url.protocol}//${url.hostname}/feed`;
        console.log('Normalized feed URL (attempting /feed):', inputUrl, '→', normalized);
        return normalized;
      }
    }

    // For other URLs, return as-is
    return inputUrl.trim();
  } catch (error) {
    // If URL parsing fails, return original
    console.warn('Failed to normalize URL:', inputUrl, error);
    return inputUrl.trim();
  }
}

/**
 * Formats a URL into a clean title by removing protocol, www, and trailing slashes
 */
export function formatUrlAsTitle(url: string): string {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    // Remove www. prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    return hostname;
  } catch {
    // If URL parsing fails, clean it up manually
    let cleaned = url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('/')[0];
    return cleaned || 'Feed';
  }
}

/**
 * Fetches and parses an RSS feed from a URL using our server-side proxy
 * Returns FeedItem[] with up to 5 items that are newer than the newest existing item for this feed
 * Items are sorted by publishedAt descending
 * Also returns the feed title from the RSS feed
 */
export async function fetchRss(feedUrl: string, existingItems: FeedItem[] = [], feedRssTitle?: string): Promise<{ items: FeedItem[], feedTitle: string }> {
  console.log('Fetching RSS for', feedUrl);
  
  try {
    // Use our server-side RSS proxy to avoid CORS and rate limit issues
    const response = await apiFetch('/api/rss-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedUrl }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Failed to fetch RSS feed: ${response.status}`);
    }

    const data = await response.json();

    // Check if proxy returned an error
    if (data.status === 'error') {
      const errorMessage = data.message || data.error || 'Failed to fetch RSS feed';
      throw new Error(errorMessage);
    }

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid RSS feed response: no items array');
    }

    // Get feed title or use hostname
    const feedTitle = data.feed?.title || formatUrlAsTitle(feedUrl);

    // Find existing items for this specific feed (for determining newest existing article)
    // Match by source field (which should be the rssTitle)
    const feedExistingItems = existingItems.filter(item => {
      // Match by source - prefer feedRssTitle if provided, otherwise use feedTitle from RSS
      const matchTitle = feedRssTitle || feedTitle;
      return item.source === matchTitle;
    });

    // Find the newest existing item's publishedAt timestamp
    let newestExistingTimestamp: number | null = null;
    if (feedExistingItems.length > 0) {
      const timestamps = feedExistingItems
        .map(item => new Date(item.publishedAt).getTime())
        .filter(time => !isNaN(time));
      
      if (timestamps.length > 0) {
        newestExistingTimestamp = Math.max(...timestamps);
        console.log('Newest existing item for feed:', feedTitle, 'timestamp:', new Date(newestExistingTimestamp).toISOString());
      }
    }

    // Map all rss2json items to FeedItems first (before deduplication and filtering)
    // This allows us to sort by date and take the 5 most recent, then filter duplicates
    const allFeedItems: FeedItem[] = data.items
      .map((item: any, index: number) => {
        // Extract stable ID - prioritize guid if it exists and is non-empty, otherwise use link
        const guid = item.guid && item.guid.trim() ? item.guid.trim() : null;
        const url = item.link && item.link.trim() ? item.link.trim() : '';
        const title = item.title || '';
        
        // Use guid if available and valid
        // Otherwise use URL if available (most stable for Atom feeds)
        // Otherwise generate a stable ID based on feed URL + title/URL
        let id: string;
        if (guid) {
          id = guid;
        } else if (url) {
          // Use URL as ID, but create a more URL-safe version for routing
          // Keep original URL but also ensure it's properly formatted
          id = url;
        } else {
          // Last resort: create a hash-like ID from feed URL and title
          const baseString = `${feedUrl}-${title || index}`;
          id = baseString.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 200);
        }
        
        // Log ID generation for debugging
        if (!guid && url) {
          console.log('Generated ID from URL:', { originalUrl: url, id: id.substring(0, 100) });
        }

        // Parse date - handle null from server (means no date found in feed)
        let publishedAt: string;
        if (item.pubDate) {
          const pubDate = new Date(item.pubDate);
          if (!isNaN(pubDate.getTime())) {
            publishedAt = pubDate.toISOString();
          } else {
            // Invalid date string - log warning but still use it
            console.warn('Invalid date format for item:', item.title, item.pubDate);
            publishedAt = new Date().toISOString();
          }
        } else {
          // No date provided - use current time as fallback (should be rare after server fix)
          console.warn('No publication date found for item:', item.title || item.link);
          publishedAt = new Date().toISOString();
        }

        // Extract content - rss2json provides content, description, and contentSnippet
        // Atom feeds may use different field names, so check multiple possibilities
        const rawContent = item.content || item['content:encoded'] || item.description || item.contentSnippet || '';
        const fullContent = rawContent.trim();
        
        // Extract content snippet for preview - prefer contentSnippet if available (plain text)
        // Otherwise strip HTML from content/description
        // Note: We don't truncate here - let CSS handle visual truncation with ellipsis
        let contentSnippet = '';
        if (item.contentSnippet && item.contentSnippet.trim()) {
          contentSnippet = item.contentSnippet.trim();
        } else if (fullContent) {
          contentSnippet = fullContent
            .replace(/<[^>]*>/g, '') // Strip HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        }

        const feedItem = {
          id,
          source: feedTitle,
          sourceType: 'rss' as const,
          title: item.title || 'Untitled',
          url,
          publishedAt,
          contentSnippet: contentSnippet || (item.title || 'No content available'),
          aiSummary: undefined,
          status: 'inbox' as const,
          fullContent: fullContent || undefined,
        };

        // Debug logging for Atom feeds
        if (feedUrl.includes('.atom') || feedUrl.includes('atom')) {
          console.log('Atom feed item:', {
            id: feedItem.id,
            title: feedItem.title,
            hasContent: !!feedItem.fullContent,
            contentLength: feedItem.fullContent?.length || 0,
            hasSnippet: !!feedItem.contentSnippet,
          });
        }

        return feedItem;
      });

    // Normalize URLs for better deduplication (remove trailing slashes, normalize query params)
    const normalizeUrl = (url: string): string => {
      if (!url) return '';
      try {
        const urlObj = new URL(url);
        // Remove trailing slash from pathname
        urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
        // Sort query params for consistency
        urlObj.search = new URLSearchParams(urlObj.searchParams).toString();
        return urlObj.toString();
      } catch {
        return url.trim().replace(/\/$/, '');
      }
    };

    // Sort by publishedAt descending (newest first)
    allFeedItems.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateB - dateA;
    });

    // Filter to only include items newer than the newest existing item (if any)
    let itemsNewerThanExisting = allFeedItems;
    if (newestExistingTimestamp !== null) {
      itemsNewerThanExisting = allFeedItems.filter(item => {
        const itemTimestamp = new Date(item.publishedAt).getTime();
        // Only include items that are newer (greater timestamp) than the newest existing
        // Use > (not >=) to avoid re-fetching items with the exact same timestamp
        return !isNaN(itemTimestamp) && itemTimestamp > newestExistingTimestamp!;
      });
      console.log('Filtered to items newer than existing:', itemsNewerThanExisting.length, 'out of', allFeedItems.length, 'total items');
    } else {
      console.log('No existing items found for feed, will consider all items (up to 5 newest)');
    }

    // Create sets for deduplication - check against ALL existing items (regardless of status)
    // Normalize URLs for comparison
    const existingUrls = new Set(
      existingItems
        .map(item => normalizeUrl(item.url))
        .filter(Boolean)
    );
    const existingIds = new Set(existingItems.map(item => item.id).filter(Boolean));
    
    // Also check by normalized URL to catch items where URL changed slightly
    const existingNormalizedUrls = new Set(
      existingItems
        .map(item => {
          if (item.id && !item.id.startsWith('http')) {
            // If ID is not a URL, check if it matches any existing item's normalized URL
            return null;
          }
          return normalizeUrl(item.id || item.url);
        })
        .filter(Boolean)
    );

    // Filter out duplicates from items that are newer than existing, then limit to 5
    // We filter duplicates first, then take top 5 of what's new
    const newItems: FeedItem[] = [];
    for (const item of itemsNewerThanExisting) {
      if (newItems.length >= 5) break; // Stop once we have 5 new items
      
      const normalizedItemUrl = normalizeUrl(item.url);
      // Only normalize ID if it looks like a URL (starts with http)
      const normalizedItemId = item.id.startsWith('http') ? normalizeUrl(item.id) : item.id;
      
      // Check for duplicates by multiple methods:
      // 1. Exact ID match
      // 2. Normalized URL match (handles trailing slash, query param differences)
      // 3. If ID is a URL, check normalized ID against existing normalized URLs
      const isDuplicate = 
        existingIds.has(item.id) ||
        (normalizedItemUrl && existingUrls.has(normalizedItemUrl)) ||
        (item.id.startsWith('http') && normalizedItemId && existingNormalizedUrls.has(normalizedItemId));
      
      if (!isDuplicate) {
        newItems.push(item);
      }
    }

    console.log('Fetched', newItems.length, 'new items from', feedUrl, 
      `(found ${allFeedItems.length} total items, ${itemsNewerThanExisting.length} newer than existing, ${itemsNewerThanExisting.length - newItems.length} were duplicates, limited to 5)`);

    return {
      items: newItems,
      feedTitle: feedTitle
    };
  } catch (error) {
    console.error('RSS fetch error', feedUrl, error);
    // Re-throw the error so the caller can handle it and show appropriate messages
    throw error;
  }
}

/**
 * Fetches and parses older RSS items (5 items older than the oldest existing item for this feed)
 * This is useful for fetching historical content from feeds
 * @param feedUrl - The RSS feed URL
 * @param existingItems - All existing feed items to check against
 * @param feedRssTitle - Optional RSS title for matching items to this feed
 * @returns Promise with items array and feedTitle
 */
export async function fetchOlderRss(feedUrl: string, existingItems: FeedItem[] = [], feedRssTitle?: string): Promise<{ items: FeedItem[], feedTitle: string }> {
  console.log('Fetching older RSS items for', feedUrl);
  
  try {
    // Use our server-side RSS proxy
    const response = await apiFetch('/api/rss-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedUrl }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Failed to fetch RSS feed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'error') {
      const errorMessage = data.message || data.error || 'Failed to fetch RSS feed';
      throw new Error(errorMessage);
    }

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid RSS feed response: no items array');
    }

    const feedTitle = data.feed?.title || formatUrlAsTitle(feedUrl);

    // Find existing items for this specific feed
    const feedExistingItems = existingItems.filter(item => {
      const matchTitle = feedRssTitle || feedTitle;
      return item.source === matchTitle;
    });

    // Find the OLDEST existing item's publishedAt timestamp (for fetching older items)
    let oldestExistingTimestamp: number | null = null;
    if (feedExistingItems.length > 0) {
      const timestamps = feedExistingItems
        .map(item => new Date(item.publishedAt).getTime())
        .filter(time => !isNaN(time));
      
      if (timestamps.length > 0) {
        oldestExistingTimestamp = Math.min(...timestamps); // MIN (oldest), not MAX
        console.log('Oldest existing item for feed:', feedTitle, 'timestamp:', new Date(oldestExistingTimestamp).toISOString());
      }
    }

    if (oldestExistingTimestamp === null) {
      throw new Error('No existing items found for this feed. Cannot fetch older posts without existing items.');
    }

    // Map all items to FeedItems (similar to fetchRss)
    const allFeedItems: FeedItem[] = data.items.map((item: any, index: number) => {
      const guid = item.guid && item.guid.trim() ? item.guid.trim() : null;
      const url = item.link && item.link.trim() ? item.link.trim() : '';
      const title = item.title || '';
      
      let id: string;
      if (guid) {
        id = guid;
      } else if (url) {
        id = url;
      } else {
        const baseString = `${feedUrl}-${title || index}`;
        id = baseString.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 200);
      }

      let publishedAt: string;
      if (item.pubDate) {
        const pubDate = new Date(item.pubDate);
        if (!isNaN(pubDate.getTime())) {
          publishedAt = pubDate.toISOString();
        } else {
          publishedAt = new Date().toISOString();
        }
      } else {
        publishedAt = new Date().toISOString();
      }

      const rawContent = item.content || item['content:encoded'] || item.description || item.contentSnippet || '';
      const fullContent = rawContent.trim();
      
      let contentSnippet = '';
      if (item.contentSnippet && item.contentSnippet.trim()) {
        contentSnippet = item.contentSnippet.trim();
      } else if (fullContent) {
        contentSnippet = fullContent
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      return {
        id,
        source: feedTitle,
        sourceType: 'rss' as const,
        title: item.title || 'Untitled',
        url,
        publishedAt,
        contentSnippet: contentSnippet || (item.title || 'No content available'),
        aiSummary: undefined,
        status: 'inbox' as const,
        fullContent: fullContent || undefined,
      };
    });

    // Normalize URLs for deduplication
    const normalizeUrl = (url: string): string => {
      if (!url) return '';
      try {
        const urlObj = new URL(url);
        urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
        urlObj.search = new URLSearchParams(urlObj.searchParams).toString();
        return urlObj.toString();
      } catch {
        return url.trim().replace(/\/$/, '');
      }
    };

    // Sort by publishedAt descending (newest first)
    allFeedItems.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateB - dateA;
    });

    // Filter to only include items OLDER than the oldest existing item
    const itemsOlderThanExisting = allFeedItems.filter(item => {
      const itemTimestamp = new Date(item.publishedAt).getTime();
      // Only include items that are older (smaller timestamp) than the oldest existing
      return !isNaN(itemTimestamp) && itemTimestamp < oldestExistingTimestamp!;
    });
    console.log('Filtered to items older than existing:', itemsOlderThanExisting.length, 'out of', allFeedItems.length, 'total items');

    // Deduplicate against existing items
    const existingUrls = new Set(
      existingItems
        .map(item => normalizeUrl(item.url))
        .filter(Boolean)
    );
    const existingIds = new Set(existingItems.map(item => item.id).filter(Boolean));
    const existingNormalizedUrls = new Set(
      existingItems
        .map(item => {
          if (item.id && !item.id.startsWith('http')) {
            return null;
          }
          return normalizeUrl(item.id || item.url);
        })
        .filter(Boolean)
    );

    // Filter out duplicates and limit to 5 oldest items
    const newItems: FeedItem[] = [];
    for (const item of itemsOlderThanExisting) {
      if (newItems.length >= 5) break;
      
      const normalizedItemUrl = normalizeUrl(item.url);
      const normalizedItemId = item.id.startsWith('http') ? normalizeUrl(item.id) : item.id;
      
      const isDuplicate = 
        existingIds.has(item.id) ||
        (normalizedItemUrl && existingUrls.has(normalizedItemUrl)) ||
        (item.id.startsWith('http') && normalizedItemId && existingNormalizedUrls.has(normalizedItemId));
      
      if (!isDuplicate) {
        newItems.push(item);
      }
    }

    // Sort by date descending (newest of the older items first)
    newItems.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateB - dateA;
    });

    console.log('Fetched', newItems.length, 'older items from', feedUrl);

    return {
      items: newItems,
      feedTitle: feedTitle
    };
  } catch (error) {
    console.error('RSS fetch older error', feedUrl, error);
    throw error;
  }
}

