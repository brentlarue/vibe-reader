import { Feed, FeedItem } from '../types';

/**
 * Normalize hostname for comparison (remove www, lowercase)
 */
export function normalizeHostname(url: string): string | null {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Check if an item belongs to a feed using multiple matching strategies
 * This handles various edge cases including proxy feeds and renamed feeds
 */
export function itemBelongsToFeed(item: FeedItem, feed: Feed): boolean {
  // 1. Check by feedId if available (most reliable)
  if (item.feedId && feed.id && item.feedId === feed.id) {
    return true;
  }

  // 2. Match by source field (item.source) to rssTitle - most reliable
  if (feed.rssTitle && item.source === feed.rssTitle) {
    return true;
  }

  // 3. Fallback: If rssTitle is not set, try matching by name
  if (!feed.rssTitle && item.source === feed.name) {
    return true;
  }

  // 4. For proxy feeds (like brianvia.blog proxying paulgraham.com), check item URLs
  const feedHostname = normalizeHostname(feed.url);
  const itemHostname = normalizeHostname(item.url);
  
  // Special handling for known proxy patterns
  if (feedHostname === 'brianvia.blog' && itemHostname) {
    // For Paul Graham feed, items are from paulgraham.com
    if (feed.url.includes('paul-graham') && itemHostname === 'paulgraham.com') {
      return true;
    }
    // Add more proxy patterns here if needed
  }

  // 5. For Medium feeds, check URL path matching
  if (feedHostname === 'medium.com') {
    try {
      const feedUrl = new URL(feed.url);
      const feedPath = feedUrl.pathname.toLowerCase();
      if (feedPath.includes('/feed/')) {
        const authorPart = feedPath.split('/feed/')[1];
        if (authorPart) {
          try {
            const itemUrl = new URL(item.url);
            if (itemUrl.pathname.toLowerCase().includes(authorPart)) {
              return true;
            }
          } catch {
            // Continue
          }
        }
      }
    } catch {
      // Continue to next check
    }
  }

  // 6. Fallback to hostname matching for other feeds
  if (feedHostname && itemHostname && feedHostname === itemHostname) {
    return true;
  }

  // 7. Check if feed name matches item source (case-insensitive partial match)
  // This handles cases where names might vary slightly
  if (feed.name && item.source) {
    const feedNameLower = feed.name.toLowerCase();
    const itemSourceLower = item.source.toLowerCase();
    if (feedNameLower.includes('paul graham') && itemSourceLower.includes('paul graham')) {
      return true;
    }
    if (feedNameLower === itemSourceLower) {
      return true;
    }
  }

  return false;
}

