import { FeedItem } from '../types';

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
 * Fetches and parses an RSS feed from a URL using rss2json.com API
 * Returns FeedItem[] with the 5 most recent items, sorted by publishedAt descending
 * Also returns the feed title from the RSS feed
 */
export async function fetchRss(feedUrl: string, existingItems: FeedItem[] = []): Promise<{ items: FeedItem[], feedTitle: string }> {
  console.log('Fetching RSS for', feedUrl);
  
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check if rss2json returned an error
    if (data.status === 'error') {
      const errorMessage = data.message || 'Failed to fetch RSS feed';
      // Provide more helpful error messages
      if (errorMessage.includes('HTML') || errorMessage.includes('html') || errorMessage.includes('Invalid')) {
        throw new Error('This URL appears to be an HTML page, not an RSS feed. Please use a direct RSS feed URL (usually ending in .rss, .xml, /feed, or /rss).');
      }
      throw new Error(errorMessage);
    }

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid RSS feed response: no items array');
    }

    // Get feed title or use hostname
    const feedTitle = data.feed?.title || formatUrlAsTitle(feedUrl);

    // Create sets for deduplication
    const existingUrls = new Set(existingItems.map(item => item.url).filter(Boolean));
    const existingIds = new Set(existingItems.map(item => item.id));

    // Map rss2json items to FeedItems
    const feedItems: FeedItem[] = data.items
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

        // Skip if duplicate - check both by ID and by URL
        if (existingIds.has(id) || (url && existingUrls.has(url)) || (guid && existingIds.has(guid))) {
          return null;
        }

        // Parse date
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        const publishedAt = isNaN(pubDate.getTime()) ? new Date().toISOString() : pubDate.toISOString();

        // Extract content - rss2json provides content, description, and contentSnippet
        // Atom feeds may use different field names, so check multiple possibilities
        const rawContent = item.content || item['content:encoded'] || item.description || item.contentSnippet || '';
        const fullContent = rawContent.trim();
        
        // Extract content snippet for preview - prefer contentSnippet if available (plain text)
        // Otherwise strip HTML from content/description
        let contentSnippet = '';
        if (item.contentSnippet && item.contentSnippet.trim()) {
          contentSnippet = item.contentSnippet.substring(0, 200).trim();
        } else if (fullContent) {
          contentSnippet = fullContent
            .replace(/<[^>]*>/g, '') // Strip HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .substring(0, 200)
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
      })
      .filter((item: FeedItem | null) => item !== null) as FeedItem[];

    // Sort by publishedAt descending (newest first)
    feedItems.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateB - dateA;
    });

    // Limit to 5 most recent
    const limitedItems = feedItems.slice(0, 5);

    console.log('Fetched', limitedItems.length, 'items from', feedUrl);

    return {
      items: limitedItems,
      feedTitle: feedTitle
    };
  } catch (error) {
    console.error('RSS fetch error', feedUrl, error);
    // Re-throw the error so the caller can handle it and show appropriate messages
    throw error;
  }
}

