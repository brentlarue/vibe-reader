/**
 * Ingest Router
 * 
 * Handles ingestion of single articles/links that aren't part of an RSS feed.
 * Creates feed items in the user's Inbox without creating a feed subscription.
 */

import express from 'express';
import * as cheerio from 'cheerio';
import { isSupabaseConfigured } from '../db/supabaseClient.js';
import * as feedRepo from '../db/feedRepository.js';
import { extractContent, isPrivateHost } from '../utils/contentFetcher.js';

const router = express.Router();

// Tracking parameters to strip from URLs
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid',
  'ref', 'source', 'mc_cid', 'mc_eid',
  '_ga', '_gl', 'hsCtaTracking', 'mkt_tok',
];

/**
 * Strip tracking parameters from URL
 */
function stripTrackingParams(urlString) {
  try {
    const url = new URL(urlString);
    TRACKING_PARAMS.forEach(param => {
      url.searchParams.delete(param);
    });
    // Also strip any param starting with utm_
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

/**
 * Extract simplified domain from URL for source display
 * Strips common subdomains (www, blog, review, news, etc.) to get the main domain
 */
function extractSource(urlString) {
  try {
    const url = new URL(urlString);
    let hostname = url.hostname.toLowerCase();
    
    // Common subdomains to strip
    const subdomainsToStrip = [
      'www', 'blog', 'blogs', 'review', 'news', 'articles', 'posts',
      'media', 'content', 'read', 'stories', 'magazine', 'journal',
      'm', 'mobile', 'amp', 'en', 'us', 'uk', 'web', 'app', 'api'
    ];
    
    // Split hostname into parts
    const parts = hostname.split('.');
    
    // If we have more than 2 parts (subdomain.domain.tld), check if first part should be stripped
    if (parts.length > 2) {
      const firstPart = parts[0];
      if (subdomainsToStrip.includes(firstPart)) {
        // Remove the subdomain
        parts.shift();
        hostname = parts.join('.');
      }
    }
    
    return hostname;
  } catch {
    return 'Unknown';
  }
}

/**
 * POST /api/ingest/link
 * 
 * Ingest a single article URL into the user's Inbox.
 * Does not create a feed subscription - just adds the article.
 */
router.post('/link', async (req, res) => {
  const { url } = req.body;
  
  console.log('[Ingest] Link ingestion requested:', url);

  // Validate URL is provided
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ 
      error: 'URL is required',
      message: 'Please provide a valid URL to ingest',
    });
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        error: 'Invalid URL protocol',
        message: 'Only http and https URLs are supported',
      });
    }
  } catch {
    return res.status(400).json({
      error: 'Invalid URL',
      message: 'Please provide a valid URL',
    });
  }

  // SSRF protection - reject private/internal IPs
  if (isPrivateHost(parsedUrl.hostname)) {
    return res.status(400).json({
      error: 'Invalid URL',
      message: 'URLs pointing to internal or private networks are not allowed',
    });
  }

  // Check database configuration
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ 
      error: 'Database not configured',
      message: 'Article ingestion requires database to be configured',
    });
  }

  try {
    // Fetch the URL with redirect following
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    let response;
    try {
      response = await fetch(url.trim(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TheSignal/1.0; +https://thesignal.app)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return res.status(400).json({
        error: 'Failed to fetch URL',
        message: `The URL returned status ${response.status}`,
      });
    }

    // Get final URL after redirects and strip tracking params
    const finalUrl = stripTrackingParams(response.url || url.trim());
    
    // SSRF check on final URL (after redirects)
    const finalParsedUrl = new URL(finalUrl);
    if (isPrivateHost(finalParsedUrl.hostname)) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'URL redirected to an internal or private network',
      });
    }

    // Get HTML content
    const html = await response.text();
    
    // Extract readable content
    const extracted = extractContent(html, finalUrl);
    
    if (!extracted.content || extracted.content.length < 50) {
      return res.status(400).json({
        error: 'Could not extract content',
        message: 'Unable to extract readable content from this URL. The page might be JavaScript-rendered or have content protection.',
      });
    }

    // Get or create the Links pseudo-feed
    const linksFeed = await feedRepo.getOrCreateLinksFeed();
    
    // Check if this URL already exists
    const existingItems = await feedRepo.getFeedItems({ feedId: linksFeed.id });
    const alreadyExists = existingItems.some(item => item.url === finalUrl);
    
    if (alreadyExists) {
      return res.status(409).json({
        error: 'Article already exists',
        message: 'This article has already been added to your inbox',
      });
    }

    // Create the feed item - use simplified domain as source
    const source = extractSource(finalUrl);
    const feedItem = {
      title: extracted.title || `Article from ${source}`,
      url: finalUrl,
      publishedAt: new Date().toISOString(),
      contentSnippet: extracted.excerpt,
      fullContent: extracted.content,
      source: source,
      sourceType: 'link',
      status: 'inbox',
    };

    // Save to database
    const [savedItem] = await feedRepo.upsertFeedItems(linksFeed.id, [feedItem]);
    
    console.log(`[Ingest] Successfully ingested article: ${feedItem.title}`);

    return res.status(201).json({
      success: true,
      message: 'Article added to Inbox',
      item: savedItem,
    });
  } catch (error) {
    console.error('[Ingest] Error ingesting link:', error);
    
    if (error.name === 'AbortError') {
      return res.status(408).json({
        error: 'Request timeout',
        message: 'The URL took too long to respond',
      });
    }
    
    return res.status(500).json({
      error: 'Ingestion failed',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

export default router;
