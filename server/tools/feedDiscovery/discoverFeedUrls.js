/**
 * Feed Discovery Tool
 * 
 * Discovers RSS/Atom feed URLs from a website URL.
 * Tries multiple strategies:
 * 1. Parse <link rel="alternate"> tags in HTML
 * 2. Try common feed paths
 */

import * as cheerio from 'cheerio';

const COMMON_FEED_PATHS = [
  '/feed',
  '/rss',
  '/atom.xml',
  '/feed.xml',
  '/index.xml',
  '/rss.xml',
  '/feeds/all.rss',
  '/blog/feed',
  '/blog/rss',
];

/**
 * Discover RSS/Atom feed URLs from a website
 * @param {Object} params
 * @param {string} params.url - Website URL
 * @returns {Promise<{rssUrls: string[], siteUrl: string}>}
 */
export async function discoverFeedUrls({ url }) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required and must be a string');
  }

  // Validate URL format
  let siteUrl;
  try {
    const urlObj = new URL(url);
    siteUrl = `${urlObj.protocol}//${urlObj.host}`;
  } catch (error) {
    throw new Error(`Invalid URL format: ${url}`);
  }

  const foundUrls = new Set();

  // Strategy 1: Fetch HTML and parse <link rel="alternate"> tags
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader Bot)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Find all <link rel="alternate"> tags
      $('link[rel="alternate"]').each((_, element) => {
        const href = $(element).attr('href');
        const type = $(element).attr('type');
        
        if (href && (type === 'application/rss+xml' || type === 'application/atom+xml' || type === 'text/xml')) {
          try {
            // Resolve relative URLs
            const feedUrl = new URL(href, url).toString();
            foundUrls.add(feedUrl);
          } catch {
            // Skip invalid URLs
          }
        }
      });
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`[FeedDiscovery] Timeout fetching ${url}`);
    } else {
      console.warn(`[FeedDiscovery] Error fetching ${url}:`, error.message);
    }
    // Continue to try common paths even if HTML fetch fails
  }

  // Strategy 2: Try common feed paths
  for (const path of COMMON_FEED_PATHS) {
    try {
      const feedUrl = new URL(path, siteUrl).toString();
      
      // Quick HEAD request to check if feed exists
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout per path
      
      try {
        const response = await fetch(feedUrl, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader Bot)',
          },
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
            foundUrls.add(feedUrl);
          }
        }
      } catch {
        clearTimeout(timeoutId);
        // Continue to next path
      }
    } catch {
      // Skip invalid URLs
    }
  }

  const rssUrls = Array.from(foundUrls);
  
  console.log(`[FeedDiscovery] Found ${rssUrls.length} feed URLs for ${siteUrl}`);
  
  return {
    rssUrls,
    siteUrl,
  };
}
