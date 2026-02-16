/**
 * Shared content fetcher for extracting readable article content from URLs.
 * Used by ingest (single article) and fetch-content (RSS items with excerpts only).
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';

// Private/internal IP patterns for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^127\./,                           // Loopback
  /^10\./,                            // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,   // Class B private
  /^192\.168\./,                      // Class C private
  /^169\.254\./,                      // Link-local
  /^0\./,                             // Current network
  /^fc00:/i,                          // IPv6 unique local
  /^fe80:/i,                          // IPv6 link-local
  /^::1$/i,                           // IPv6 loopback
  /^localhost$/i,
];

export function isPrivateHost(hostname) {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
}

function sanitizeHtml(html) {
  const $ = cheerio.load(html);
  $('script, style, iframe, object, embed, form, input, button, noscript').remove();
  $('*').each((_, el) => {
    const element = $(el);
    const attribs = element.attr();
    if (attribs) {
      Object.keys(attribs).forEach(attr => {
        if (attr.startsWith('on') || attr === 'srcdoc') {
          element.removeAttr(attr);
        }
      });
    }
  });
  $('a[href^="javascript:"]').removeAttr('href');
  return $.html();
}

/**
 * Extract readable content from HTML using Readability (preferred) or Cheerio (fallback)
 * @param {string} html - Raw HTML
 * @param {string} url - Article URL (for Readability)
 * @returns {{ title: string, content: string, excerpt: string }}
 */
export function extractContent(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.content && article.textContent && article.textContent.length > 100) {
      return {
        title: article.title || '',
        content: sanitizeHtml(article.content),
        excerpt: article.excerpt || article.textContent.slice(0, 300).trim() + '...',
      };
    }
  } catch (e) {
    console.warn('[ContentFetcher] Readability extraction failed:', e.message);
  }

  try {
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, .sidebar, .comments, .advertisement, .ad, noscript').remove();

    let contentHtml = '';
    let contentText = '';
    const mainSelectors = ['article', 'main', '.post-content', '.article-content', '.entry-content', '.content', '#content'];

    for (const selector of mainSelectors) {
      const el = $(selector);
      if (el.length && el.text().trim().length > 100) {
        contentHtml = el.html() || '';
        contentText = el.text().trim();
        break;
      }
    }

    if (!contentHtml || contentText.length < 100) {
      contentHtml = $('body').html() || '';
      contentText = $('body').text().trim();
    }

    const title = $('meta[property="og:title"]').attr('content')
      || $('title').text()
      || $('h1').first().text()
      || '';

    return {
      title: title.trim(),
      content: sanitizeHtml(contentHtml),
      excerpt: contentText.slice(0, 300).trim() + (contentText.length > 300 ? '...' : ''),
    };
  } catch (e) {
    console.warn('[ContentFetcher] Cheerio extraction failed:', e.message);
    return { title: '', content: '', excerpt: '' };
  }
}

/**
 * Fetch full article content from a URL
 * @param {string} url - Article URL
 * @returns {Promise<{ content: string, excerpt: string }>}
 */
export async function fetchArticleContentFromUrl(url) {
  const parsed = new URL(url);
  if (isPrivateHost(parsed.hostname)) {
    throw new Error('URL points to private network');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Invalid URL protocol');
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VibeReader/1.0)' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  const extracted = extractContent(html, url);

  if (!extracted.content || extracted.content.length < 50) {
    throw new Error('Could not extract readable content');
  }

  return {
    content: extracted.content,
    excerpt: extracted.excerpt,
  };
}
