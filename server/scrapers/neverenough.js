/**
 * NeverEnough Newsletter Scraper
 * 
 * Scrapes the newsletter archive from https://www.neverenough.com/newsletter
 * and extracts issue information (title, URL, date, description).
 * 
 * HTML Structure Assumptions (as of Dec 2025):
 * - Newsletter list container: .w-dyn-list .blog-list-wrap
 * - Each item: div.blog-item.w-dyn-item
 * - Date element: .text-block-51 (e.g., "Dec 7, 2025")
 * - Title element: .text-block-53 inside a.div-block-74
 * - Link: a.div-block-74[href] (relative paths like /post/slug)
 * - Description: .paragraph-light
 * - Pagination: a.w-pagination-next[href] with pattern ?dce43a42_page=N
 * 
 * If the page structure changes, these selectors will need updating.
 */

import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.neverenough.com';
const ARCHIVE_URL = `${BASE_URL}/newsletter`;
const SOURCE_NAME = 'NeverEnough';

/**
 * Represents a single newsletter issue
 * @typedef {Object} NewsletterIssue
 * @property {string} title - Issue title
 * @property {string} url - Full URL to the issue
 * @property {string|null} publishedAt - ISO date string or null
 * @property {string} contentSnippet - Brief description
 * @property {string} fullContent - Full HTML content of the article
 */

/**
 * Parse a date string like "Dec 7, 2025" to ISO format
 * @param {string} dateStr - Date string from the page
 * @returns {string|null} ISO date string or null if parsing fails
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();
  
  try {
    // Parse date strings like "Dec 7, 2025" or "Nov 13, 2025"
    const parsed = new Date(trimmed);
    
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch (e) {
    console.warn(`[NeverEnough Scraper] Failed to parse date: "${dateStr}"`);
  }

  return null;
}

/**
 * Normalize a URL - convert relative paths to absolute URLs
 * @param {string} href - URL or path from the page
 * @returns {string} Absolute URL
 */
function normalizeUrl(href) {
  if (!href) return '';
  
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }
  
  // Handle relative paths
  if (href.startsWith('/')) {
    return `${BASE_URL}${href}`;
  }
  
  return `${BASE_URL}/${href}`;
}

/**
 * Extract newsletter issues from a single page's HTML
 * @param {string} html - Raw HTML content
 * @returns {NewsletterIssue[]} Array of extracted issues
 */
function extractIssuesFromHtml(html) {
  const $ = cheerio.load(html);
  const issues = [];

  // Find all newsletter items
  // Selector: div.blog-item.w-dyn-item within the dynamic list
  const items = $('div.blog-item.w-dyn-item');

  items.each((index, element) => {
    const $item = $(element);

    try {
      // Extract date from .text-block-51
      const dateText = $item.find('.text-block-51').first().text().trim();
      const publishedAt = parseDate(dateText);

      // Extract title from .text-block-53 (inside the title link)
      const title = $item.find('.text-block-53').first().text().trim();

      // Extract URL from a.div-block-74
      const linkElement = $item.find('a.div-block-74').first();
      const href = linkElement.attr('href');
      const url = normalizeUrl(href);

      // Extract description from .paragraph-light
      const contentSnippet = $item.find('.paragraph-light').first().text().trim();

      // Validate required fields
      if (!title || !url) {
        console.warn(`[NeverEnough Scraper] Skipping item ${index}: missing title or URL`);
        return; // Skip this item
      }

      issues.push({
        title,
        url,
        publishedAt,
        contentSnippet: contentSnippet || '',
        fullContent: null, // Will be fetched later by fetchArticleContent
      });
    } catch (e) {
      console.error(`[NeverEnough Scraper] Error extracting item ${index}:`, e.message);
    }
  });

  return issues;
}

/**
 * Extract full article content from an article page's HTML
 * @param {string} html - Raw HTML content of the article page
 * @returns {string} HTML content of the article
 */
function extractArticleContent(html) {
  const $ = cheerio.load(html);
  
  // The article content is in a div with class "rich-text-block w-richtext"
  const richTextBlock = $('div.rich-text-block.w-richtext').first();
  
  if (richTextBlock.length === 0) {
    // Try alternative selectors
    const altContent = $('.blog-detail-content, .post-content, .article-content').first();
    if (altContent.length > 0) {
      return altContent.html() || '';
    }
    console.warn('[NeverEnough Scraper] Could not find article content container');
    return '';
  }
  
  // Get the HTML content
  let content = richTextBlock.html() || '';
  
  // Clean up the content - remove script tags and excessive whitespace
  content = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return content;
}

/**
 * Fetch full article content for a single issue
 * @param {string} url - Article URL
 * @returns {Promise<string>} HTML content of the article
 */
export async function fetchArticleContent(url) {
  try {
    console.log(`[NeverEnough Scraper] Fetching article content: ${url}`);
    const html = await fetchHtml(url);
    const content = extractArticleContent(html);
    
    if (!content) {
      console.warn(`[NeverEnough Scraper] No content extracted from ${url}`);
      return '';
    }
    
    console.log(`[NeverEnough Scraper] Extracted ${content.length} chars from ${url}`);
    return content;
  } catch (e) {
    console.error(`[NeverEnough Scraper] Error fetching article content from ${url}:`, e.message);
    return '';
  }
}

/**
 * Extract the next page URL from the pagination
 * @param {string} html - Raw HTML content
 * @returns {string|null} Next page URL or null if no more pages
 */
function extractNextPageUrl(html) {
  const $ = cheerio.load(html);
  
  // Look for the "Next Page" link
  const nextLink = $('a.w-pagination-next').first();
  const href = nextLink.attr('href');
  
  if (href) {
    // href is like "?dce43a42_page=2"
    return `${ARCHIVE_URL}${href}`;
  }
  
  return null;
}

/**
 * Fetch HTML content from a URL with retry logic
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retries on failure
 * @returns {Promise<string>} HTML content
 */
async function fetchHtml(url, retries = 2) {
  const userAgent = 'Mozilla/5.0 (compatible; VibeReader/1.0; +https://github.com/vibe-reader)';
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (e) {
      console.error(`[NeverEnough Scraper] Fetch attempt ${attempt + 1} failed for ${url}:`, e.message);
      
      if (attempt === retries) {
        throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts: ${e.message}`);
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

/**
 * Scrape all newsletter issues from the archive (all pages)
 * @param {Object} [options] - Scraping options
 * @param {number} [options.maxPages=10] - Maximum number of pages to scrape
 * @param {boolean} [options.fetchContent=false] - Whether to fetch full article content
 * @param {number} [options.contentLimit=5] - Max number of articles to fetch full content for
 * @returns {Promise<NewsletterIssue[]>} Array of all issues
 */
export async function scrapeAllIssues({ maxPages = 10, fetchContent = false, contentLimit = 5 } = {}) {
  console.log(`[NeverEnough Scraper] Starting scrape from ${ARCHIVE_URL}`);
  
  const allIssues = [];
  const seenUrls = new Set();
  let currentUrl = ARCHIVE_URL;
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    pageCount++;
    console.log(`[NeverEnough Scraper] Fetching page ${pageCount}: ${currentUrl}`);

    try {
      const html = await fetchHtml(currentUrl);
      const pageIssues = extractIssuesFromHtml(html);

      // Deduplicate by URL
      for (const issue of pageIssues) {
        if (!seenUrls.has(issue.url)) {
          seenUrls.add(issue.url);
          allIssues.push(issue);
        }
      }

      console.log(`[NeverEnough Scraper] Found ${pageIssues.length} issues on page ${pageCount}`);

      // Get next page URL
      currentUrl = extractNextPageUrl(html);
      
      // Small delay between pages to be respectful
      if (currentUrl) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error(`[NeverEnough Scraper] Error on page ${pageCount}:`, e.message);
      // Stop pagination on error but return what we have
      break;
    }
  }

  // Optionally fetch full content for articles
  if (fetchContent && allIssues.length > 0) {
    // Sort by date to get newest first, then limit
    const sortedIssues = [...allIssues].sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
    
    const issuesToFetch = sortedIssues.slice(0, contentLimit);
    console.log(`[NeverEnough Scraper] Fetching full content for ${issuesToFetch.length} articles...`);
    
    for (const issue of issuesToFetch) {
      try {
        issue.fullContent = await fetchArticleContent(issue.url);
        // Small delay between article fetches to be respectful
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`[NeverEnough Scraper] Error fetching content for ${issue.url}:`, e.message);
        issue.fullContent = '';
      }
    }
  }

  console.log(`[NeverEnough Scraper] Completed. Total issues: ${allIssues.length}`);
  return allIssues;
}

/**
 * Get metadata about the feed
 * @returns {Object} Feed metadata
 */
export function getFeedMetadata() {
  return {
    title: 'The Never Enough Newsletter',
    description: 'Andrew Wilkinson shares insights on business, entrepreneurship, and life.',
    link: ARCHIVE_URL,
    author: 'Andrew Wilkinson',
    sourceName: SOURCE_NAME,
    sourceUrl: ARCHIVE_URL,
  };
}

// Export constants for use by other modules
export { BASE_URL, ARCHIVE_URL, SOURCE_NAME };
