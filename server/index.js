import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables FIRST (before any modules that need them)
import dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '..', '.env') });

// Now import Supabase (which needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
const { isSupabaseConfigured } = await import('./db/supabaseClient.js');
const feedRepo = await import('./db/feedRepository.js');
const { getAppEnv } = await import('./db/env.js');

const app = express();
const PORT = process.env.PORT || 3001;
// Check if we're in production (Render sets NODE_ENV automatically)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;

// Authentication constants - must be set in environment variables
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

// Validate required environment variables
if (!APP_PASSWORD) {
  console.error('ERROR: APP_PASSWORD environment variable is required. Please set it in your .env file.');
  process.exit(1);
}

if (SESSION_SECRET === process.env.SESSION_SECRET && !process.env.SESSION_SECRET) {
  // Only warn if SESSION_SECRET is auto-generated (not set in env)
  console.warn('WARNING: SESSION_SECRET not set in environment. Using auto-generated secret. This will invalidate sessions on server restart.');
}

// Data file path
const DATA_DIR = join(__dirname, '..', 'data');
const FEEDS_FILE = join(DATA_DIR, 'feeds.json');
const FEED_ITEMS_FILE = join(DATA_DIR, 'feed-items.json');

// Preferences file path
const PREFERENCES_FILE = join(DATA_DIR, 'preferences.json');

// Ensure data directory exists
async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  // Initialize empty files if they don't exist
  if (!existsSync(FEEDS_FILE)) {
    await fs.writeFile(FEEDS_FILE, JSON.stringify([]), 'utf-8');
  }
  if (!existsSync(FEED_ITEMS_FILE)) {
    await fs.writeFile(FEED_ITEMS_FILE, JSON.stringify([]), 'utf-8');
  }
  if (!existsSync(PREFERENCES_FILE)) {
    await fs.writeFile(PREFERENCES_FILE, JSON.stringify({}), 'utf-8');
  }
}

ensureDataDir().catch(console.error);

// Session token helpers
// Payload structure: { sub: "user", iat: number }
function signSession(payload, secret) {
  const payloadJson = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadJson);
  const signature = hmac.digest('hex');
  const token = Buffer.from(`${payloadJson}:${signature}`).toString('base64');
  return token;
}

function verifySession(token, secret) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    // Use lastIndexOf to find the separator, since JSON payload contains colons
    const separatorIndex = decoded.lastIndexOf(':');
    if (separatorIndex === -1) {
      throw new Error('Invalid token format');
    }
    
    const payloadJson = decoded.substring(0, separatorIndex);
    const signature = decoded.substring(separatorIndex + 1);
    
    if (!payloadJson || !signature) {
      throw new Error('Invalid token format');
    }
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadJson);
    const expectedSignature = hmac.digest('hex');
    
    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }
    
    return JSON.parse(payloadJson);
  } catch (error) {
    console.log('[AUTH] verifySession error:', error.message);
    throw new Error('Invalid or tampered token');
  }
}

// Environment logging middleware - adds env header and logs
function envMiddleware(req, res, next) {
  const env = getAppEnv();
  res.setHeader('x-app-env', env);
  console.log(`[ENV=${env}] ${req.method} ${req.path}`);
  next();
}

// Authentication middleware - requires valid session cookie
function requireAuth(req, res, next) {
  console.log('[AUTH] requireAuth called for:', req.method, req.path);
  console.log('[AUTH] Cookies received:', req.cookies);
  const token = req.cookies?.session;
  if (!token) {
    console.log('[AUTH] No session token found, returning 401');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = verifySession(token, SESSION_SECRET);
    console.log('[AUTH] Session verified successfully:', payload);
    req.user = payload;
    return next();
  } catch (err) {
    console.log('[AUTH] Session verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Middleware
// Apply env middleware to all routes
app.use(envMiddleware);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests) or localhost
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
      } else if (isProduction) {
      // In production, allow requests from your domain
      const allowedOrigins = [
        'https://brentlarue.me',
        'https://www.brentlarue.me',
        'https://thesignal.brentlarue.me'
      ];
      
      // Check if origin matches any allowed origin
      const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed));
      if (isAllowed) {
        callback(null, true);
      } else {
        // Log for debugging but allow for now (you can restrict later)
        console.log('CORS: Unrecognized origin:', origin);
        callback(null, true); // Allow for now - restrict later if needed
      }
    } else {
      // In development, allow all origins
      callback(null, true);
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Helper function to verify reCAPTCHA token
async function verifyRecaptcha(token) {
  if (!RECAPTCHA_SECRET_KEY) {
    // If no secret key is set, skip validation (for development/testing)
    console.log('[LOGIN] RECAPTCHA_SECRET_KEY not set, skipping captcha validation');
    return true;
  }

  if (!token || typeof token !== 'string') {
    return false;
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${encodeURIComponent(RECAPTCHA_SECRET_KEY)}&response=${encodeURIComponent(token)}`,
    });

    const data = await response.json();
    console.log('[LOGIN] reCAPTCHA verification result:', data.success);
    return data.success === true;
  } catch (error) {
    console.error('[LOGIN] Error verifying reCAPTCHA:', error);
    return false;
  }
}

// Public routes (before auth middleware)
// Login endpoint
app.post('/api/login', async (req, res) => {
  console.log('[LOGIN] /api/login called');
  
  const { password, rememberMe, captchaToken } = req.body;

  if (!password || typeof password !== 'string') {
    console.log('[LOGIN] Password missing or not a string');
    return res.status(400).json({ error: 'Password is required' });
  }

  // Verify captcha if secret key is configured
  if (RECAPTCHA_SECRET_KEY) {
    const captchaValid = await verifyRecaptcha(captchaToken);
    if (!captchaValid) {
      console.log('[LOGIN] Invalid or missing captcha token');
      return res.status(400).json({ error: 'Please complete the captcha verification' });
    }
  }

  // Use secure comparison to prevent timing attacks
  // First check length to avoid timingSafeEqual error on length mismatch
  if (password.length !== APP_PASSWORD.length) {
    console.log('[LOGIN] Invalid password attempt');
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  const passwordMatch = crypto.timingSafeEqual(
    Buffer.from(password),
    Buffer.from(APP_PASSWORD)
  );

  if (!passwordMatch) {
    console.log('[LOGIN] Invalid password attempt');
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Create session payload
  const payload = {
    sub: 'user',
    iat: Date.now()
  };
  console.log('[LOGIN] Login successful, creating session');

  // Sign session
  const token = signSession(payload, SESSION_SECRET);

  // Set cookie
  const maxAge = rememberMe ? 90 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 90 days or 1 day
  const cookieOptions = {
    maxAge,
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  };
  
  // Only set secure in production (HTTPS)
  if (isProduction) {
    cookieOptions.secure = true;
  }
  
  res.cookie('session', token, cookieOptions);
  console.log('[LOGIN] Session cookie set successfully');
  return res.json({ ok: true });
});

// Logout endpoint (public, clears cookie)
app.post('/api/logout', (req, res) => {
  res.cookie('session', '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/'
  });
  return res.json({ ok: true });
});

// Protected /api/me endpoint for checking auth status
app.get('/api/me', requireAuth, (req, res) => {
  console.log('[ME] /api/me passed auth, returning ok: true');
  return res.json({ ok: true });
});

// RSS Proxy endpoint (protected) - fetches and parses RSS feeds server-side
app.post('/api/rss-proxy', requireAuth, async (req, res) => {
  try {
    const { feedUrl } = req.body;
    
    if (!feedUrl || typeof feedUrl !== 'string') {
      return res.status(400).json({ error: 'feedUrl is required' });
    }

    console.log('[RSS-PROXY] Fetching:', feedUrl);

    // Dynamically import rss-parser (ES module)
    const Parser = (await import('rss-parser')).default;
    const parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TheSignalReader/1.0)',
        'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
      },
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['content', 'content'],
        ],
      },
    });

    const feed = await parser.parseURL(feedUrl);

    console.log('[RSS-PROXY] Parsed feed:', feed.title, '- Items:', feed.items?.length || 0);

    // Helper function to parse dates from various RSS/Atom formats
    const parseDate = (item) => {
      // Try multiple date fields in order of preference
      const dateFields = [
        item.pubDate,
        item.isoDate,
        item.published,
        item.updated,
        item.date,
      ];
      
      for (const dateStr of dateFields) {
        if (!dateStr) continue;
        
        // Try parsing the date
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
      
      // If no valid date found, return null (don't default to "now")
      // The frontend will handle this appropriately
      console.warn('[RSS-PROXY] No valid date found for item:', item.title || item.link);
      return null;
    };

    // Format the response similar to rss2json.com for compatibility
    const response = {
      status: 'ok',
      feed: {
        title: feed.title || '',
        description: feed.description || '',
        link: feed.link || feedUrl,
        image: feed.image?.url || '',
      },
      items: (feed.items || []).map(item => ({
        title: item.title || 'Untitled',
        link: item.link || '',
        guid: item.guid || item.id || item.link || '',
        pubDate: parseDate(item),
        description: item.contentSnippet || item.summary || '',
        content: item.contentEncoded || item.content || item['content:encoded'] || item.description || '',
        contentSnippet: item.contentSnippet || (item.content ? item.content.replace(/<[^>]*>/g, '').substring(0, 500) : ''),
        author: item.creator || item.author || '',
        categories: item.categories || [],
      })),
    };

    return res.json(response);
  } catch (error) {
    console.error('[RSS-PROXY] Error:', error.message);
    
    // Provide helpful error messages
    let errorMessage = 'Failed to fetch RSS feed';
    if (error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo')) {
      errorMessage = 'Could not reach the feed URL. Please check the URL is correct.';
    } else if (error.message?.includes('ETIMEDOUT') || error.message?.includes('timeout')) {
      errorMessage = 'The feed took too long to respond. Please try again.';
    } else if (error.message?.includes('Non-whitespace before first tag') || error.message?.includes('Invalid character')) {
      errorMessage = 'This URL does not appear to be a valid RSS or Atom feed.';
    } else if (error.message?.includes('certificate') || error.message?.includes('SSL')) {
      errorMessage = 'SSL certificate issue with the feed URL.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return res.status(500).json({ 
      status: 'error',
      error: errorMessage,
      message: errorMessage
    });
  }
});

// Helper function to count words in text
function countWords(text) {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Comprehensive article content cleaner that removes junk content after the true editorial end.
 * Uses deterministic, rule-based heuristics only (no LLM).
 * 
 * Strategy:
 * 1. Parse HTML structure to identify content blocks
 * 2. Apply text-pattern stop conditions
 * 3. Use link-density heuristics
 * 4. Apply length-based cutoff
 * 5. Detect platform-specific patterns
 * 
 * Quality bar: If a human would say "this is clearly not part of the article," it's removed.
 * When ambiguous, prefer keeping content rather than cutting early.
 * 
 * TEST CASES:
 * 
 * 1. Stop at "Related" section:
 *    Input: "<p>Article content here.</p><h2>Related</h2><p>More articles...</p>"
 *    Expected: "<p>Article content here.</p>"
 * 
 * 2. Stop at subscription CTA:
 *    Input: "<p>Article ends here.</p><p>Subscribe to our newsletter</p>"
 *    Expected: "<p>Article ends here.</p>"
 * 
 * 3. Stop at high link density:
 *    Input: "<p>Article content.</p><div><a>Link 1</a> <a>Link 2</a> <a>Link 3</a></div>"
 *    Expected: "<p>Article content.</p>" (if after MIN_ARTICLE_LENGTH)
 * 
 * 4. Preserve legitimate conclusion:
 *    Input: "<p>Main content.</p><p>In conclusion, this is important.</p><p>Subscribe</p>"
 *    Expected: "<p>Main content.</p><p>In conclusion, this is important.</p>"
 * 
 * 5. Platform-specific (Substack):
 *    Input: "<p>Article.</p><p>Become a paid subscriber to read more.</p>"
 *    Expected: "<p>Article.</p>"
 */
function prepareArticleContent(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Step 1: Remove scripts, styles, and other non-content elements
  let html = text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, ''); // Remove comments

  // Step 2: Split HTML into blocks (paragraphs, divs, sections, etc.)
  // We'll process blocks sequentially and stop when we hit junk patterns
  const blockPattern = /<(?:p|div|section|article|main|h[1-6]|li|blockquote|aside|footer|header)[^>]*>[\s\S]*?<\/(?:p|div|section|article|main|h[1-6]|li|blockquote|aside|footer|header)>/gi;
  const blocks = [];
  let match;
  
  // Extract all content blocks
  while ((match = blockPattern.exec(html)) !== null) {
    blocks.push(match[0]);
  }
  
  // Track if we found structured blocks
  const hasStructuredBlocks = blocks.length > 0;
  
  // If no structured blocks found, treat entire content as one block for processing
  if (!hasStructuredBlocks) {
    blocks.push(html);
  }

  // Step 3: Process blocks sequentially, stopping at junk patterns
  const cleanedBlocks = [];
  let foundStopMarker = false;
  let totalLength = 0;
  const MIN_ARTICLE_LENGTH = 800; // Minimum characters before we start being aggressive about cutting
  const MAX_ARTICLE_LENGTH = 50000; // Reasonable upper bound

  for (let i = 0; i < blocks.length && !foundStopMarker; i++) {
    const block = blocks[i];
    const blockText = stripHtmlTags(block).trim();
    
    if (!blockText || blockText.length < 10) {
      // Skip very short blocks (likely formatting/spacing)
      continue;
    }

    // Check for stop markers (text patterns that indicate end of article)
    if (isStopMarker(blockText, block)) {
      foundStopMarker = true;
      break;
    }

    // Check link density - if block is >50% links, it's likely junk (unless early in article)
    if (totalLength > MIN_ARTICLE_LENGTH && isHighLinkDensity(block)) {
      foundStopMarker = true;
      break;
    }

    // Check for platform-specific patterns
    if (hasPlatformJunkPattern(blockText, block)) {
      foundStopMarker = true;
      break;
    }

    // Length-based cutoff: if we have substantial content and remaining blocks are short/CTA-heavy
    if (totalLength > MIN_ARTICLE_LENGTH && i > blocks.length * 0.7) {
      // We're in the latter portion of content
      if (isLikelyJunkBlock(blockText, block)) {
        foundStopMarker = true;
        break;
      }
    }

    // Add block to cleaned content
    cleanedBlocks.push(block);
    totalLength += blockText.length;

    // Safety: don't process extremely long articles
    if (totalLength > MAX_ARTICLE_LENGTH) {
      break;
    }
  }

  // Step 4: Reconstruct cleaned HTML
  let cleanedHtml;
  
  // If we didn't find structured blocks, use fallback approach with stop markers
  if (!hasStructuredBlocks) {
    cleanedHtml = applyStopMarkersToPlainText(html);
  } else {
    cleanedHtml = cleanedBlocks.join('\n');
  }

  // Step 5: Final cleanup - remove remaining junk patterns
  cleanedHtml = removeJunkPatterns(cleanedHtml);

  // Step 6: Strip HTML tags for final text output (preserve structure info was used during processing)
  let cleaned = stripHtmlTags(cleanedHtml)
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Strip HTML tags from text, preserving text content
 */
function stripHtmlTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a block matches stop marker patterns (indicating end of article)
 */
function isStopMarker(text, htmlBlock) {
  const normalizedText = text.toLowerCase().trim();
  
  // Stop marker patterns (case-insensitive)
  const stopPatterns = [
    /^(related|more from|more like this|recommended|read more|you might also like|similar articles|trending now)$/i,
    /^(subscribe|sign up|become a member|join the newsletter|get the newsletter|newsletter signup)$/i,
    /^(comments|discussion|join the conversation|leave a comment)$/i,
    /^(share this|share on|tweet this|follow us|follow me)$/i,
    /^(about the author|author bio|meet the author|author information)$/i,
    /^(published by|published on|posted by|posted on)$/i,
    /^(member-only|continue reading|this post is for subscribers|upgrade to paid|become a paid subscriber)$/i,
    /^(listen instead|listen to this|audio version)$/i,
    /^(cookie|privacy|terms of service|terms and conditions)$/i,
    /^(donate|support us|contribute|sponsor)$/i,
  ];

  // Check if text matches any stop pattern
  for (const pattern of stopPatterns) {
    if (pattern.test(normalizedText)) {
      return true;
    }
  }

  // Check if block contains stop marker phrases (not just exact match)
  const stopPhrases = [
    'related stories',
    'related articles',
    'more from',
    'more like this',
    'recommended for you',
    'you might also like',
    'subscribe to',
    'sign up for',
    'become a member',
    'join the newsletter',
    'about the author',
    'author bio',
    'share this article',
    'share on twitter',
    'share on linkedin',
    'follow us on',
    'comments section',
    'leave a comment',
    'join the discussion',
    'member-only',
    'continue reading',
    'this post is for subscribers',
    'upgrade to paid',
    'listen instead',
    'cookie policy',
    'privacy policy',
    'support our work',
    'donate to',
  ];

  for (const phrase of stopPhrases) {
    if (normalizedText.includes(phrase.toLowerCase())) {
      // Only stop if this phrase appears prominently (not buried in legitimate content)
      // Check if it's in a heading or at the start of a paragraph
      if (htmlBlock.match(new RegExp(`<(h[1-6]|p|div|section)[^>]*>[^<]*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))) {
        return true;
      }
      // Or if it's a short block that's mostly this phrase
      if (text.length < 200 && normalizedText.indexOf(phrase.toLowerCase()) < 50) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a block has high link density (likely navigation/junk)
 */
function isHighLinkDensity(htmlBlock) {
  // Count link characters vs total characters
  const linkMatches = htmlBlock.match(/<a[^>]*>[\s\S]*?<\/a>/gi);
  if (!linkMatches) {
    return false;
  }

  let linkTextLength = 0;
  linkMatches.forEach(link => {
    linkTextLength += stripHtmlTags(link).length;
  });

  const totalTextLength = stripHtmlTags(htmlBlock).length;
  
  if (totalTextLength === 0) {
    return false;
  }

  const linkDensity = linkTextLength / totalTextLength;
  
  // If >50% of text is links, it's likely junk
  if (linkDensity > 0.5) {
    return true;
  }

  // If block is primarily a list of links (multiple links, short text)
  if (linkMatches.length >= 3 && totalTextLength < 500) {
    return true;
  }

  return false;
}

/**
 * Check for platform-specific junk patterns
 */
function hasPlatformJunkPattern(text, htmlBlock) {
  const normalizedText = text.toLowerCase();
  const normalizedHtml = htmlBlock.toLowerCase();

  // Medium patterns
  if (normalizedHtml.includes('medium.com') || normalizedHtml.includes('getpocket.com')) {
    if (normalizedText.includes('member-only') || normalizedText.includes('upgrade to')) {
      return true;
    }
  }

  // Substack patterns
  if (normalizedHtml.includes('substack.com') || normalizedText.includes('substack')) {
    if (normalizedText.includes('subscribe') || normalizedText.includes('become a paid subscriber')) {
      return true;
    }
  }

  // Ghost patterns
  if (normalizedHtml.includes('ghost.org') || normalizedText.includes('ghost')) {
    if (normalizedText.includes('members only') || normalizedText.includes('upgrade')) {
      return true;
    }
  }

  // WordPress patterns
  if (normalizedHtml.includes('wordpress.com') || normalizedHtml.includes('wp-content')) {
    // WordPress often has "related posts" plugins
    if (normalizedText.match(/related\s+(posts|articles|content)/i)) {
      return true;
    }
  }

  // Generic "continue reading" patterns
  if (normalizedText.match(/continue\s+reading|read\s+more|show\s+more/i)) {
    // Only if it's a short block (likely a CTA)
    if (text.length < 100) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a block is likely junk based on characteristics
 */
function isLikelyJunkBlock(text, htmlBlock) {
  const normalizedText = text.toLowerCase();

  // Very short blocks in the latter portion are often junk
  if (text.length < 50) {
    // Unless it's clearly a paragraph ending
    if (!text.match(/[.!?]\s*$/)) {
      return true;
    }
  }

  // Blocks that are mostly CTAs
  const ctaPatterns = [
    /click here/i,
    /learn more/i,
    /get started/i,
    /try now/i,
    /download/i,
    /install/i,
  ];

  for (const pattern of ctaPatterns) {
    if (pattern.test(text) && text.length < 200) {
      return true;
    }
  }

  return false;
}

/**
 * Apply stop markers to plain text (fallback when no structured HTML)
 */
function applyStopMarkersToPlainText(text) {
  // Split by common separators (paragraph breaks, line breaks)
  const paragraphs = text.split(/\n\s*\n|<\/p>\s*<p>|<\/div>\s*<div>/i);
  
  let cleaned = '';
  for (const para of paragraphs) {
    const paraText = stripHtmlTags(para).trim();
    
    if (isStopMarker(paraText, para)) {
      break;
    }
    
    cleaned += para + '\n\n';
  }
  
  return cleaned;
}

/**
 * Remove remaining junk patterns from cleaned HTML
 */
function removeJunkPatterns(html) {
  // Remove common boilerplate patterns that might have slipped through
  let cleaned = html;

  // Remove subscription CTAs
  cleaned = cleaned.replace(/<[^>]*>[\s\S]*?subscribe\s+to\s+[^\s]+\s+newsletter[\s\S]*?<\/[^>]*>/gi, '');
  cleaned = cleaned.replace(/<[^>]*>[\s\S]*?sign\s+up\s+for\s+[^\s]+\s+newsletter[\s\S]*?<\/[^>]*>/gi, '');
  
  // Remove social sharing prompts
  cleaned = cleaned.replace(/<[^>]*>[\s\S]*?share\s+(this|on|via)[\s\S]*?<\/[^>]*>/gi, '');
  cleaned = cleaned.replace(/<[^>]*>[\s\S]*?follow\s+us\s+on[\s\S]*?<\/[^>]*>/gi, '');
  
  // Remove cookie/privacy notices
  cleaned = cleaned.replace(/<[^>]*>[\s\S]*?cookie\s+(policy|notice|consent)[\s\S]*?<\/[^>]*>/gi, '');
  cleaned = cleaned.replace(/<[^>]*>[\s\S]*?privacy\s+(policy|notice)[\s\S]*?<\/[^>]*>/gi, '');

  return cleaned;
}

// Summarize endpoint (protected)
app.post('/api/summarize', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Prepare and chunk content for better coverage
    const cleanedContent = prepareArticleContent(text);
    
    // Use more content - aim for ~8000-10000 characters to get beyond intro paragraphs
    // If content is longer, we'll send a larger chunk but still within token limits
    const contentLength = cleanedContent.length;
    const targetLength = Math.min(contentLength, 10000);
    const articleContent = cleanedContent.substring(0, targetLength);
    
    // If we truncated, add a note to help the model understand context
    const contentNote = contentLength > targetLength 
      ? `\n\n[Note: Article continues beyond this point, but the above represents the core content.]`
      : '';

    const systemMessage = `You are an expert article summarizer for a high-signal RSS reader.

Write clear, information-dense summaries for busy, thoughtful readers.

Rules:
- Summarize the entire article, not just the introduction.
- Do NOT repeat the title or use phrases like "this article discusses."
- Do NOT use ellipses, meta commentary, or filler.
- Write in direct, factual prose.
- The summary must be a complete paragraph that ends with proper punctuation.
- If the content appears truncated or paywalled, still summarize what is present without mentioning the limitation.`;

    const userMessage = `Write a single-paragraph summary of the article below.

Constraints:
- Length: 80–100 words (hard requirement).
- One paragraph only.
- No bullet points.
- No title repetition.
- No meta language.
- Must read as a complete, polished paragraph.

Article content:
${articleContent}${contentNote}`;

    // Function to call OpenAI API
    const callOpenAI = async (messages) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o', // GPT-4 class model (latest and best available)
          messages,
          max_tokens: 700, // Increased for 120-140 word summaries
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenAI API error:', response.status, errorData);
        throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim();
    };

    // Initial summary generation
    let summary = await callOpenAI([
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ]);

    if (!summary) {
      throw new Error('No summary returned from API');
    }

    // Clean up the summary
    summary = summary
      .replace(/\s*\(?\d+\s*(word|words?)\)?/gi, '') // Remove word count mentions
      .replace(/\s*\[\d+\s*(word|words?)\]/gi, '') // Remove word count in brackets
      .replace(/\.{2,}$/, '') // Remove trailing ellipses
      .replace(/\s*\.{3,}\s*/g, ' ') // Remove ellipses in middle
      .trim();

    // Validate word count and quality
    const wordCount = countWords(summary);
    const endsProperly = /[.!?]$/.test(summary.trim());
    const isSingleParagraph = !summary.includes('\n\n') && (summary.split('\n').length <= 2);

    // If validation fails, request a revision
    if (wordCount < 80 || wordCount > 100 || !endsProperly || !isSingleParagraph) {
      console.log(`Summary validation failed: ${wordCount} words, ends properly: ${endsProperly}, single paragraph: ${isSingleParagraph}`);
      console.log('Requesting revision from model...');

      const revisionMessage = `The summary you provided does not meet the requirements. Please revise it.

Issues found:
${wordCount < 80 ? `- Too short: ${wordCount} words (need 80-100 words)\n` : ''}${wordCount > 100 ? `- Too long: ${wordCount} words (need 80-100 words)\n` : ''}${!endsProperly ? '- Does not end with proper punctuation\n' : ''}${!isSingleParagraph ? '- Not a single paragraph\n' : ''}

Current summary:
${summary}

Please provide a revised summary that:
- Is exactly 80-100 words
- Is a single paragraph
- Ends with proper punctuation
- Is complete and polished`;

      summary = await callOpenAI([
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: summary },
        { role: 'user', content: revisionMessage },
      ]);

      if (!summary) {
        throw new Error('No revised summary returned from API');
      }

      // Clean revised summary
      summary = summary
        .replace(/\s*\(?\d+\s*(word|words?)\)?/gi, '')
        .replace(/\s*\[\d+\s*(word|words?)\]/gi, '')
        .replace(/\.{2,}$/, '')
        .replace(/\s*\.{3,}\s*/g, ' ')
        .trim();

      const finalWordCount = countWords(summary);
      console.log(`Revised summary: ${finalWordCount} words`);
    }

    // Final validation log
    const finalWordCount = countWords(summary);
    console.log(`Final summary: ${finalWordCount} words, ${summary.length} characters`);
    console.log(`Summary text: ${summary}`);

    return res.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    return res.status(500).json({ error: 'Failed to generate summary', message: error.message });
  }
});

// AI Feature endpoint (protected)
app.post('/api/ai-feature', requireAuth, async (req, res) => {
  try {
    const { text, featureType } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (!featureType || !['insightful-reply', 'investor-analysis', 'founder-implications'].includes(featureType)) {
      return res.status(400).json({ error: 'featureType must be one of: insightful-reply, investor-analysis, founder-implications' });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Limit content length to avoid token limits
    const truncatedContent = text.substring(0, 4000);

    // Define system prompts for each feature type
    const systemPrompts = {
      'insightful-reply': `You write with the intellectual style of Paul Graham and Keith Rabois, but in a more casual, human tone.

From Paul Graham, you take:
- idea-first thinking
- quiet humility
- curiosity about how systems actually work
- comfort with subtle, non-obvious truths

From Keith Rabois, you take:
- clarity about incentives and mechanics
- comfort naming tradeoffs and failure modes
- precision without verbosity

You do NOT imitate their writing style.
You internalize their way of reasoning.

You sound like a thoughtful founder reflecting honestly, not delivering a thesis.
You value correctness over cleverness.
You avoid hype, slogans, and performative confidence.`,
      'investor-analysis': `You are a top-tier Silicon Valley venture investor.

You think in terms of incentives, power laws, cost curves, distribution, margins, and competitive dynamics.

You do not repeat the article.
You do not moralize.
You do not hype trends.

You ask: if this is true, what actually changes in how value is created, captured, and competed for?

Your analysis resembles an internal investment memo or partner discussion, not a public-facing blog post.`,
      'founder-implications': `You are advising a founder using the combined thinking frameworks of Paul Graham, Garry Tan, Sam Altman, and Keith Rabois.

From Paul Graham:
- Focus on what actually matters, not what sounds impressive
- Look for counterintuitive leverage, especially early
- Pay attention to forces that compound quietly

From Garry Tan:
- Emphasize execution velocity, iteration, and distribution realities
- Be concrete about founder behavior and focus
- Think about where founders waste time versus create momentum

From Sam Altman:
- Think in terms of scale, timing, and inevitabilities
- Identify what becomes possible if the thesis is correct
- Be honest about power laws and long-term bets

From Keith Rabois:
- Be explicit about incentives, failure modes, and tradeoffs
- Call out uncomfortable truths founders avoid
- Prioritize clarity over consensus

You do not imitate their writing styles.
You internalize their way of thinking.

You are direct, practical, and intellectually honest.
You assume the founder is capable and experienced.`,
    };

    // Define prompts for each feature type
    const prompts = {
      'insightful-reply': `Write a repost reply suitable for Twitter or LinkedIn.

Constraints:
- 1–2 sentences
- Maximum 280 characters
- No hashtags, no emojis, no quotation marks
- Do not summarize the article
- Do not restate the article's premise
- Do not use framing like "this article shows" or "this piece argues"

What to do instead:
- Surface one non-obvious implication the article creates
- Focus on incentives, second-order effects, or structural dynamics
- Let the insight feel discovered, not announced
- It's okay to sound slightly conversational or tentative

Tone guidance:
- Calm, reflective, grounded
- Light humility
- Avoid punchlines or viral framing

Audience:
Founders, investors, PMs, designers, and engineers.
Mostly SF Bay Area, Switzerland, and Slovenia.

Output ONLY the final text.

ARTICLE:
${truncatedContent}`,

      'investor-analysis': `Provide an investor-grade analysis of the article's thesis from the perspective of leading Silicon Valley VC firms (e.g., Sequoia, Andreessen Horowitz, Benchmark, First Round, SV Angel).

Assume the reader is an experienced investor who understands technology, markets, and startup dynamics.

Write in the following five sections, using paragraphs only:

### If the thesis is correct – what structurally changes
Describe how the underlying economics, incentives, or constraints shift. Focus on second-order effects and what becomes newly possible or newly fragile.

### Who wins
Identify the types of companies, sectors, and business models that would disproportionately benefit. Explain why their advantages compound under this thesis.

### Who loses
Describe which companies, intermediaries, or business models are structurally weakened, compressed, or made obsolete—and why.

### Capital market implications
Explain how this thesis would affect valuations, margins, capital intensity, pricing power, and investor behavior. Describe new or altered investment theses that emerge.

### Bets
Name specific private and public companies that would plausibly benefit if the thesis is correct. Include a mix of startups and established firms across different sectors, and briefly justify why each fits.

Important constraints:
- Write in paragraph form only (no bullet points, no numbered lists).
- Do not use bold text, italics, or markdown beyond the section headers.
- Avoid buzzwords and generic trend language.
- Ground claims in first-principles reasoning.
- Do not summarize the article; analyze its implications.

ARTICLE:
${truncatedContent}`,

      'founder-implications': `Act as if Paul Graham, Garry Tan, Sam Altman, and Keith Rabois are jointly advising me personally as a founder.

Context about me (use this implicitly, do not restate it):
- Multi-time founder and YC alum
- Strong product, design, and systems-thinking background
- Experience in healthcare, fitness, and consumer-facing products
- Olympic athlete background; performance, incentives, and feedback loops matter to me
- Operating across the US and Europe (SF Bay Area, Switzerland, Slovenia)
- Optimizing for leverage, clarity, and long-term optionality, not vanity growth

Explain what I should take away from the article as a founder.

Structure the response into the following sections:

### Opportunities
- New wedge ideas or second-order opportunities the article implies
- Timing advantages or asymmetries a focused founder could exploit
- Shifts in customer behavior or willingness to pay that matter early

### Risks
- Where founders are likely to misread the article or over-apply it
- Technical, regulatory, or distribution risks that don't show up at first glance
- Strategic dead ends or false positives this thesis could lead to

### Actionable Playbook
- Specific actions or behaviors I should adopt or stop
- What to test, build, or position in the next 3–6 months
- How to frame this insight when talking to users, investors, or teammates
- Contrarian choices worth making if the thesis is directionally right

Formatting rules (follow strictly):
- Use lists with dashes (no numbered lists)
- For each list item, bold the text before the colon only
- Use bold markdown only for that leading phrase
- Write with precision and restraint
- Avoid generic startup advice

Do not summarize the article.
Analyze its implications for my decisions.

ARTICLE:
${truncatedContent}`
    };

    // Configure model and parameters per feature type
    const modelConfig = {
      'insightful-reply': {
        model: 'gpt-4o', // GPT-4 class model
        temperature: 0.4,
        max_tokens: 1000,
      },
      'investor-analysis': {
        model: 'gpt-4o', // GPT-4 class model
        temperature: 0.25,
        max_tokens: 1600,
      },
      'founder-implications': {
        model: 'gpt-4o', // GPT-4 class model
        temperature: 0.3,
        max_tokens: 1500,
      },
    };

    const config = modelConfig[featureType];
    const systemPrompt = systemPrompts[featureType];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompts[featureType],
          },
        ],
        max_tokens: config.max_tokens,
        temperature: config.temperature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', response.status, errorData);
      throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let result = data.choices?.[0]?.message?.content?.trim();

    if (!result) {
      throw new Error('No result returned from API');
    }

    // For insightful-reply: only trim whitespace (no other post-processing)
    if (featureType === 'insightful-reply') {
      result = result.trim();
    }

    return res.json({ result });
  } catch (error) {
    console.error('Error generating AI feature:', error);
    return res.status(500).json({ error: 'Failed to generate AI feature', message: error.message });
  }
});

// Data API endpoints for cross-device sync
// Uses Supabase if configured, otherwise falls back to JSON files

// Helper functions to read/write JSON files (fallback when Supabase not configured)
async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

async function writeJsonFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}

// ============================================================================
// FEEDS API
// ============================================================================

// GET /api/feeds - Get all feeds
app.get('/api/feeds', requireAuth, async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const feeds = await feedRepo.getFeeds();
      return res.json(feeds);
    }
    // Fallback to file
    await ensureDataDir();
    const feeds = await readJsonFile(FEEDS_FILE);
    res.json(feeds);
  } catch (error) {
    console.error('Error reading feeds:', error);
    res.status(500).json({ error: 'Failed to read feeds' });
  }
});

// POST /api/feeds - Create a new feed
app.post('/api/feeds', requireAuth, async (req, res) => {
  try {
    const { url, displayName, rssTitle, sourceType = 'rss' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (isSupabaseConfigured()) {
      // Check if feed already exists
      const existing = await feedRepo.getFeedByUrl(url);
      if (existing) {
        return res.status(409).json({ error: 'Feed with this URL already exists', feed: existing });
      }
      
      const feed = await feedRepo.createFeed({
        url,
        displayName: displayName || url,
        rssTitle,
        sourceType,
      });
      return res.json(feed);
    }
    
    // Fallback to file
    await ensureDataDir();
    const feeds = await readJsonFile(FEEDS_FILE);
    if (feeds.some(f => f.url === url)) {
      return res.status(409).json({ error: 'Feed with this URL already exists' });
    }
    const newFeed = {
      id: crypto.randomUUID(),
      name: displayName || url,
      url,
      sourceType,
      rssTitle,
    };
    feeds.push(newFeed);
    await writeJsonFile(FEEDS_FILE, feeds);
    res.json(newFeed);
  } catch (error) {
    console.error('Error creating feed:', error);
    res.status(500).json({ error: 'Failed to create feed' });
  }
});

// PUT /api/feeds/:feedId - Update a feed
app.put('/api/feeds/:feedId', requireAuth, async (req, res) => {
  try {
    const { feedId } = req.params;
    const { displayName, rssTitle } = req.body;

    if (isSupabaseConfigured()) {
      let feed;
      if (displayName !== undefined) {
        // This also updates all items' source field in Supabase
        feed = await feedRepo.updateFeedName(feedId, displayName);
      }
      if (rssTitle !== undefined) {
        feed = await feedRepo.updateFeedRssTitle(feedId, rssTitle);
      }
      return res.json(feed || { success: true });
    }
    
    // Fallback to file
    await ensureDataDir();
    const feeds = await readJsonFile(FEEDS_FILE);
    const index = feeds.findIndex(f => f.id === feedId);
    if (index === -1) {
      return res.status(404).json({ error: 'Feed not found' });
    }
    
    if (displayName !== undefined) {
      feeds[index].name = displayName;
      
      // Also update all items that belong to this feed
      // Match by feedId (most reliable, works across multiple renames)
      const items = await readJsonFile(FEED_ITEMS_FILE);
      const updatedItems = items.map(item => {
        if (item.feedId === feedId) {
          return { ...item, source: displayName };
        }
        return item;
      });
      await writeJsonFile(FEED_ITEMS_FILE, updatedItems);
    }
    if (rssTitle !== undefined) {
      feeds[index].rssTitle = rssTitle;
    }
    await writeJsonFile(FEEDS_FILE, feeds);
    res.json(feeds[index]);
  } catch (error) {
    console.error('Error updating feed:', error);
    res.status(500).json({ error: 'Failed to update feed' });
  }
});

// DELETE /api/feeds/:feedId - Delete a feed
app.delete('/api/feeds/:feedId', requireAuth, async (req, res) => {
  try {
    const { feedId } = req.params;

    if (isSupabaseConfigured()) {
      await feedRepo.deleteFeed(feedId);
      return res.json({ success: true });
    }
    
    // Fallback to file
    await ensureDataDir();
    const feeds = await readJsonFile(FEEDS_FILE);
    const filtered = feeds.filter(f => f.id !== feedId);
    await writeJsonFile(FEEDS_FILE, filtered);
    
    // Also remove related items
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const filteredItems = items.filter(i => i.feedId !== feedId);
    await writeJsonFile(FEED_ITEMS_FILE, filteredItems);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting feed:', error);
    res.status(500).json({ error: 'Failed to delete feed' });
  }
});

// ============================================================================
// FEED ITEMS API
// ============================================================================

// GET /api/items - Get all feed items (optionally filtered)
app.get('/api/items', requireAuth, async (req, res) => {
  try {
    const { status, feedId, limit } = req.query;

    if (isSupabaseConfigured()) {
      const items = await feedRepo.getFeedItems({
        status,
        feedId,
        limit: limit ? parseInt(limit) : undefined,
      });
      return res.json(items);
    }
    
    // Fallback to file
    await ensureDataDir();
    let items = await readJsonFile(FEED_ITEMS_FILE);
    if (status) {
      items = items.filter(i => i.status === status);
    }
    if (feedId) {
      items = items.filter(i => i.feedId === feedId);
    }
    if (limit) {
      items = items.slice(0, parseInt(limit));
    }
    res.json(items);
  } catch (error) {
    console.error('Error reading feed items:', error);
    res.status(500).json({ error: 'Failed to read feed items' });
  }
});

// GET /api/items/:itemId - Get a single feed item
app.get('/api/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;

    if (isSupabaseConfigured()) {
      const item = await feedRepo.getFeedItem(itemId);
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      return res.json(item);
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const item = items.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error reading feed item:', error);
    res.status(500).json({ error: 'Failed to read feed item' });
  }
});

// POST /api/feeds/:feedId/items - Upsert items for a feed
app.post('/api/feeds/:feedId/items', requireAuth, async (req, res) => {
  try {
    const { feedId } = req.params;
    const items = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    if (isSupabaseConfigured()) {
      const upserted = await feedRepo.upsertFeedItems(feedId, items);
      return res.json(upserted);
    }
    
    // Fallback to file
    await ensureDataDir();
    const allItems = await readJsonFile(FEED_ITEMS_FILE);
    
    // Upsert logic
    for (const item of items) {
      const existingIndex = allItems.findIndex(i => 
        i.feedId === feedId && i.url === item.url
      );
      if (existingIndex >= 0) {
        // Update existing
        allItems[existingIndex] = { ...allItems[existingIndex], ...item, feedId };
      } else {
        // Insert new
        allItems.push({
          id: crypto.randomUUID(),
          feedId,
          ...item,
        });
      }
    }
    
    await writeJsonFile(FEED_ITEMS_FILE, allItems);
    res.json({ success: true, count: items.length });
  } catch (error) {
    console.error('Error upserting feed items:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to upsert feed items',
      details: errorMessage 
    });
  }
});

// POST /api/items/:itemId/status - Update item status
app.post('/api/items/:itemId/status', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;

    const validStatuses = ['inbox', 'saved', 'bookmarked', 'archived'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    if (isSupabaseConfigured()) {
      const item = await feedRepo.updateFeedItemStatus(itemId, status);
      return res.json(item);
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    items[index].status = status;
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json(items[index]);
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: 'Failed to update item status' });
  }
});

// POST /api/items/:itemId/reading-order - Update item reading order subcategory
app.post('/api/items/:itemId/reading-order', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { readingOrder } = req.body;

    const validOrders = ['next', 'later', 'someday', null];
    if (!validOrders.includes(readingOrder)) {
      return res.status(400).json({ error: 'Invalid reading order. Must be one of: next, later, someday, or null.' });
    }

    if (isSupabaseConfigured()) {
      const item = await feedRepo.updateFeedItemReadingOrder(itemId, readingOrder);
      return res.json(item);
    }

    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    items[index].readingOrder = readingOrder;
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json(items[index]);
  } catch (error) {
    console.error('Error updating item reading order:', error);
    res.status(500).json({ error: 'Failed to update item reading order' });
  }
});

// POST /api/items/:itemId/summary - Update item AI summary
app.post('/api/items/:itemId/summary', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { summary } = req.body;

    if (typeof summary !== 'string') {
      return res.status(400).json({ error: 'Summary must be a string' });
    }

    if (isSupabaseConfigured()) {
      const item = await feedRepo.updateFeedItemSummary(itemId, summary);
      return res.json(item);
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    items[index].aiSummary = summary;
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json(items[index]);
  } catch (error) {
    console.error('Error updating item summary:', error);
    res.status(500).json({ error: 'Failed to update item summary' });
  }
});

// POST /api/items/:itemId/ai-feature - Update item AI feature (insightful-reply, investor-analysis, founder-implications)
app.post('/api/items/:itemId/ai-feature', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { featureType, content } = req.body;

    const validFeatureTypes = ['insightful-reply', 'investor-analysis', 'founder-implications'];
    if (!validFeatureTypes.includes(featureType)) {
      return res.status(400).json({ error: `Invalid feature type. Must be one of: ${validFeatureTypes.join(', ')}` });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }

    if (isSupabaseConfigured()) {
      const item = await feedRepo.updateFeedItemAIFeature(itemId, featureType, content);
      return res.json(item);
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Map feature type to field name
    const fieldMap = {
      'insightful-reply': 'aiInsightfulReply',
      'investor-analysis': 'aiInvestorAnalysis',
      'founder-implications': 'aiFounderImplications',
    };
    items[index][fieldMap[featureType]] = content;
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json(items[index]);
  } catch (error) {
    console.error('Error updating AI feature:', error);
    res.status(500).json({ error: 'Failed to update AI feature' });
  }
});

// POST /api/items/:itemId/paywall - Update item paywall status
app.post('/api/items/:itemId/paywall', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { paywallStatus } = req.body;

    const validStatuses = ['unknown', 'free', 'paid'];
    if (!validStatuses.includes(paywallStatus)) {
      return res.status(400).json({ error: `Invalid paywall status. Must be one of: ${validStatuses.join(', ')}` });
    }

    if (isSupabaseConfigured()) {
      const item = await feedRepo.updateFeedItemPaywallStatus(itemId, paywallStatus);
      return res.json(item);
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    items[index].paywallStatus = paywallStatus;
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json(items[index]);
  } catch (error) {
    console.error('Error updating item paywall status:', error);
    res.status(500).json({ error: 'Failed to update item paywall status' });
  }
});

// POST /api/items/:itemId/reassociate - Reassociate an item with a feed
app.post('/api/items/:itemId/reassociate', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { feedId, source } = req.body;

    if (!feedId || !source) {
      return res.status(400).json({ error: 'feedId and source are required' });
    }

    if (isSupabaseConfigured()) {
      const item = await feedRepo.reassociateFeedItem(itemId, feedId, source);
      return res.json(item);
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    items[index].feedId = feedId;
    items[index].source = source;
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json(items[index]);
  } catch (error) {
    console.error('Error reassociating item:', error);
    res.status(500).json({ error: 'Failed to reassociate item' });
  }
});

// DELETE /api/items/:itemId - Delete a single item
app.delete('/api/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;

    if (isSupabaseConfigured()) {
      await feedRepo.deleteFeedItem(itemId);
      return res.json({ success: true });
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const filtered = items.filter(i => i.id !== itemId);
    await writeJsonFile(FEED_ITEMS_FILE, filtered);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting feed item:', error);
    res.status(500).json({ error: 'Failed to delete feed item' });
  }
});

// DELETE /api/items - Delete items by status (for bulk delete, e.g., clear archive)
app.delete('/api/items', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;

    if (!status) {
      return res.status(400).json({ error: 'Status query parameter is required' });
    }

    if (isSupabaseConfigured()) {
      const count = await feedRepo.deleteFeedItemsByStatus(status);
      return res.json({ success: true, count });
    }
    
    // Fallback to file
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    const filtered = items.filter(i => i.status !== status);
    const deletedCount = items.length - filtered.length;
    await writeJsonFile(FEED_ITEMS_FILE, filtered);
    res.json({ success: true, count: deletedCount });
  } catch (error) {
    console.error('Error deleting feed items:', error);
    res.status(500).json({ error: 'Failed to delete feed items' });
  }
});

// ============================================================================
// PREFERENCES API
// ============================================================================

// GET /api/preferences - Get all preferences
app.get('/api/preferences', requireAuth, async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const prefs = await feedRepo.getPreferences();
      console.log('[API] Retrieved preferences:', Object.keys(prefs));
      return res.json(prefs);
    }
    
    // Fallback to file
    await ensureDataDir();
    if (!existsSync(PREFERENCES_FILE)) {
      await fs.writeFile(PREFERENCES_FILE, JSON.stringify({}), 'utf-8');
    }
    const preferences = await readJsonFile(PREFERENCES_FILE);
    res.json(preferences);
  } catch (error) {
    console.error('Error reading preferences:', error);
    res.status(500).json({ error: 'Failed to read preferences' });
  }
});

// POST /api/preferences - Update preferences
app.post('/api/preferences', requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    console.log('[API] Updating preferences:', Object.keys(updates));

    if (isSupabaseConfigured()) {
      await feedRepo.updatePreferences(updates);
      console.log('[API] Preferences updated successfully');
      return res.json({ success: true });
    }
    
    // Fallback to file
    await ensureDataDir();
    const currentPrefs = existsSync(PREFERENCES_FILE) ? await readJsonFile(PREFERENCES_FILE) : {};
    const updatedPrefs = { ...currentPrefs, ...updates };
    await writeJsonFile(PREFERENCES_FILE, updatedPrefs);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving preferences:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to save preferences',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================================================
// LEGACY DATA ENDPOINTS (for backward compatibility during migration)
// These mirror the old /api/data/* routes but use the new backend
// ============================================================================

// GET /api/data/feeds - Legacy endpoint
app.get('/api/data/feeds', requireAuth, async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const feeds = await feedRepo.getFeeds();
      return res.json(feeds);
    }
    await ensureDataDir();
    const feeds = await readJsonFile(FEEDS_FILE);
    res.json(feeds);
  } catch (error) {
    console.error('Error reading feeds:', error);
    res.status(500).json({ error: 'Failed to read feeds' });
  }
});

// POST /api/data/feeds - Legacy endpoint (bulk save)
app.post('/api/data/feeds', requireAuth, async (req, res) => {
  try {
    // This is the bulk save operation from the old API
    // For Supabase, we need to handle this differently
    const feeds = Array.isArray(req.body) ? req.body : [];
    
    if (isSupabaseConfigured()) {
      // For each feed, upsert it
      for (const feed of feeds) {
        const existing = await feedRepo.getFeedByUrl(feed.url);
        if (!existing) {
          await feedRepo.createFeed({
            url: feed.url,
            displayName: feed.name,
            rssTitle: feed.rssTitle,
            sourceType: feed.sourceType || 'rss',
          });
        } else if (feed.name !== existing.name) {
          await feedRepo.updateFeedName(existing.id, feed.name);
        }
      }
      return res.json({ success: true });
    }
    
    await ensureDataDir();
    await writeJsonFile(FEEDS_FILE, feeds);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving feeds:', error);
    res.status(500).json({ error: 'Failed to save feeds' });
  }
});

// GET /api/data/feed-items - Legacy endpoint
app.get('/api/data/feed-items', requireAuth, async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const items = await feedRepo.getFeedItems();
      return res.json(items);
    }
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    res.json(items);
  } catch (error) {
    console.error('Error reading feed items:', error);
    res.status(500).json({ error: 'Failed to read feed items' });
  }
});

// POST /api/data/feed-items - Legacy endpoint (bulk save)
app.post('/api/data/feed-items', requireAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    
    if (isSupabaseConfigured()) {
      // Group items by feedId for bulk upsert
      const itemsByFeed = {};
      for (const item of items) {
        // Try to find the feed by matching source/rssTitle
        const feeds = await feedRepo.getFeeds();
        let feed = feeds.find(f => f.rssTitle === item.source || f.name === item.source);
        
        if (feed) {
          if (!itemsByFeed[feed.id]) {
            itemsByFeed[feed.id] = [];
          }
          itemsByFeed[feed.id].push(item);
        }
      }
      
      // Upsert items for each feed
      for (const [feedId, feedItems] of Object.entries(itemsByFeed)) {
        await feedRepo.upsertFeedItems(feedId, feedItems);
      }
      
      return res.json({ success: true });
    }
    
    await ensureDataDir();
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving feed items:', error);
    res.status(500).json({ error: 'Failed to save feed items' });
  }
});

// GET /api/data/preferences - Legacy endpoint
app.get('/api/data/preferences', requireAuth, async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const prefs = await feedRepo.getPreferences();
      return res.json(prefs);
    }
    await ensureDataDir();
    if (!existsSync(PREFERENCES_FILE)) {
      await fs.writeFile(PREFERENCES_FILE, JSON.stringify({}), 'utf-8');
    }
    const preferences = await readJsonFile(PREFERENCES_FILE);
    res.json(preferences);
  } catch (error) {
    console.error('Error reading preferences:', error);
    res.status(500).json({ error: 'Failed to read preferences' });
  }
});

// POST /api/data/preferences - Legacy endpoint
app.post('/api/data/preferences', requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    
    if (isSupabaseConfigured()) {
      await feedRepo.updatePreferences(updates);
      return res.json({ success: true });
    }
    
    await ensureDataDir();
    const currentPrefs = existsSync(PREFERENCES_FILE) ? await readJsonFile(PREFERENCES_FILE) : {};
    const updatedPrefs = { ...currentPrefs, ...updates };
    await writeJsonFile(PREFERENCES_FILE, updatedPrefs);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ============================================================================
// ANNOTATIONS API
// ============================================================================

// POST /api/annotations - Create a new annotation (highlight or note)
app.post('/api/annotations', requireAuth, async (req, res) => {
  try {
    const { feedItemId, feedId, type, content } = req.body;

    if (!feedItemId || !feedId || !type || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (type !== 'highlight' && type !== 'note') {
      return res.status(400).json({ error: 'Invalid annotation type' });
    }

    if (isSupabaseConfigured()) {
      const annotation = await feedRepo.createAnnotation(feedItemId, feedId, type, content);
      return res.json(annotation);
    }

    res.status(500).json({ error: 'Database not configured' });
  } catch (error) {
    console.error('Error creating annotation:', error);
    res.status(500).json({ error: 'Failed to create annotation' });
  }
});

// GET /api/annotations - Get all annotations
app.get('/api/annotations', requireAuth, async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const annotations = await feedRepo.getAnnotations();
      return res.json(annotations);
    }

    res.status(500).json({ error: 'Database not configured' });
  } catch (error) {
    console.error('Error fetching annotations:', error);
    res.status(500).json({ error: 'Failed to fetch annotations' });
  }
});

// GET /api/annotations/article/:id - Get annotations for a specific article
app.get('/api/annotations/article/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (isSupabaseConfigured()) {
      const annotations = await feedRepo.getAnnotationsForArticle(id);
      return res.json(annotations);
    }

    res.status(500).json({ error: 'Database not configured' });
  } catch (error) {
    console.error('Error fetching article annotations:', error);
    res.status(500).json({ error: 'Failed to fetch article annotations' });
  }
});

// DELETE /api/annotations/:id - Delete an annotation
app.delete('/api/annotations/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[API] Deleting annotation:', id);

    if (isSupabaseConfigured()) {
      await feedRepo.deleteAnnotation(id);
      console.log('[API] Annotation deleted successfully:', id);
      return res.json({ success: true });
    }

    res.status(500).json({ error: 'Database not configured' });
  } catch (error) {
    console.error('[API] Error deleting annotation:', error);
    console.error('[API] Error details:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to delete annotation', details: error.message });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      type: isSupabaseConfigured() ? 'supabase' : 'file',
      configured: isSupabaseConfigured(),
    },
  };

  // Test Supabase connection if configured
  if (isSupabaseConfigured()) {
    try {
      const feeds = await feedRepo.getFeeds();
      health.database.connected = true;
      health.database.feedCount = feeds.length;
    } catch (error) {
      health.database.connected = false;
      health.database.error = error.message;
    }
  }

  res.json(health);
});

// Serve static files from the Vite dist directory in production
if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');
  
  // Check if dist directory exists
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    
    // Serve index.html for all non-API routes (SPA routing)
    app.get('*', (req, res, next) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(join(distPath, 'index.html'));
    });
  } else {
    console.warn('Warning: dist directory not found. Static files will not be served.');
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (isProduction) {
    console.log('Production mode: Serving static files from dist/');
  }
});

