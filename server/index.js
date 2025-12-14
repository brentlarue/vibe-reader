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

// Public routes (before auth middleware)
// Login endpoint
app.post('/api/login', async (req, res) => {
  console.log('[LOGIN] /api/login called');
  
  const { password, rememberMe } = req.body;

  if (!password || typeof password !== 'string') {
    console.log('[LOGIN] Password missing or not a string');
    return res.status(400).json({ error: 'Password is required' });
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

    // Limit content length to avoid token limits (approximately 4000 chars)
    const truncatedContent = text.substring(0, 4000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise, informative summaries. CRITICAL REQUIREMENTS: 1) Every summary MUST be COMPLETE and FINISHED - never truncate, never cut off mid-sentence, never end with ellipses (...). 2) The summary must end naturally with proper punctuation (period, exclamation mark, or question mark). 3) The summary must read as a complete, coherent piece of writing. 4) Do NOT indicate truncation or that the summary is incomplete in any way.',
          },
          {
            role: 'user',
            content: `Write a complete, finished summary of the following article. Capture the main points and key information.

CRITICAL REQUIREMENTS:
1. Your summary MUST be COMPLETE and FINISHED - never truncate, never cut off mid-sentence, never use ellipses (...)
2. Your summary MUST be EXACTLY 360 characters or fewer (this is a CHARACTER limit, including spaces and punctuation). DO NOT exceed 360 characters.
3. The summary must end naturally with proper punctuation (period, exclamation, or question mark)
4. The summary must read as a complete, coherent paragraph

CHARACTER LIMIT: 360 characters maximum (not 280, not 300, not 350 - exactly 360 characters or fewer).

Write your complete, finished summary within 360 characters:\n\n${truncatedContent}`,
          },
        ],
        max_tokens: 900,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', response.status, errorData);
      throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let summary = data.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      throw new Error('No summary returned from API');
    }

    // Debug: Log the raw summary from LLM
    console.log('LLM raw response - Length (characters):', summary.length);
    console.log('LLM raw response text:', summary);

    // Remove any character count mentions or metadata from the summary
    // Remove patterns like "(360 chars)", "[360 characters]", etc.
    summary = summary.replace(/\s*\(?\d+\s*(char|characters?|chars?)\)?/gi, '').trim();
    summary = summary.replace(/\s*\[\d+\s*(char|characters?|chars?)\]/gi, '').trim();
    
    // Remove trailing ellipses if LLM added them despite instructions
    summary = summary.replace(/\.{2,}$/, '').trim();
    // Remove any ellipses in the middle or at the end
    summary = summary.replace(/\s*\.{3,}\s*/g, ' ').trim();

    // Ensure summary is within 360 character limit
    // This should rarely be needed if the LLM follows the prompt correctly
    if (summary.length > 360) {
      console.warn(`WARNING: Summary exceeds 360 character limit (${summary.length} chars). LLM did not follow character limit instruction.`);
      // Try to find a sentence boundary within the limit
      const trimmed = summary.substring(0, 360);
      const lastPeriod = trimmed.lastIndexOf('.');
      const lastExclamation = trimmed.lastIndexOf('!');
      const lastQuestion = trimmed.lastIndexOf('?');
      const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
      
      if (lastSentenceEnd > 300) {
        // Found a sentence end reasonably close to the limit
        summary = summary.substring(0, lastSentenceEnd + 1).trim();
        console.warn(`Summary trimmed to sentence boundary: ${summary.length} characters`);
      } else {
        // No good sentence boundary, trim at word boundary
        const lastSpace = trimmed.lastIndexOf(' ');
        if (lastSpace > 300) {
          summary = summary.substring(0, lastSpace).trim() + '.';
          console.warn(`Summary trimmed to word boundary: ${summary.length} characters`);
        } else {
          // Last resort: hard cut (should never happen with proper prompt)
          summary = summary.substring(0, 357).trim() + '...';
          console.warn(`Summary hard-trimmed (last resort): ${summary.length} characters`);
        }
      }
    }

    // Debug: Log the cleaned summary being sent
    console.log('LLM cleaned summary - Length (characters):', summary.length);
    console.log('LLM cleaned summary text:', summary);
    if (summary.length > 360) {
      console.warn('WARNING: Summary still exceeds 360 character limit after processing!');
    }

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

    // Define prompts for each feature type
    const prompts = {
      'insightful-reply': `Craft a succinct, high-signal insight for a repost reply (usable on LinkedIn or Twitter).

Style:

Paul Graham: observational, idea-driven, understated, humble

Keith Rabois: concise, diagnostic, reveals underlying mechanics

My perspective: YC founder, Olympian, designer, product leader, systems-thinker, interested in performance, incentives, human behavior, automation, systems thinking and contrarian viewpoints—but keep this subtle.

Rules:

Do not summarize the article.

Surface a non-obvious idea or structural insight the article implies.

Tone: quiet confidence, analytical simplicity; no flourish, no jargon.

STRICTLY NO hashtags. NO emojis. Do NOT wrap the response in quotes or quotation marks.

1–2 sentences max.

≤ 280 characters.

Output ONLY the response text, with no quotes, no hashtags, no emojis.

ARTICLE:

${truncatedContent}`,

      'investor-analysis': `Provide an investor-grade analysis of the article's thesis from the perspective of top VC firms in Silicon Valley (like Sequoia, Andreessen Horowitz, Benchmark, First Round Capital, etc.). Write in five sections:

1. If the thesis is correct – What structural forces change? Which markets reshape?

2. Who wins – Companies, sectors, business models that benefit.

3. Who loses – Who gets disrupted or compressed.

4. Capital market implications – Valuation pressure, margin effects, new investment theses.

5. Bets – Identify specific private and public companies that would benefit if this thesis is correct. Include both startups and established public companies across different sectors.

IMPORTANT FORMATTING RULES:
- Do NOT use lists (no bullet points, no numbered lists, no dashes or asterisks)
- Write in paragraph form only
- Do NOT use bold text (no asterisks for emphasis)
- Use plain text only, no markdown formatting beyond section headers
- Section headers should use ### followed by the section name

Keep it grounded in first-principles reasoning. Avoid buzzwords. Write with the analytical depth and strategic thinking of top-tier Silicon Valley VCs.

ARTICLE:

${truncatedContent}`,

      'founder-implications': `Explain the implications for founders deciding where to focus next. Output structured into three sections:

1. Opportunities – New wedge ideas, timing advantages, shifts in customer willingness to pay.

2. Risks – Technological, regulatory, distribution, or competitive hazards.

3. Actionable Playbook – Steps a high-leverage founder should take now: experiments, positioning, GTM adjustments, contrarian angles.

IMPORTANT FORMATTING RULES:
- Use lists with dashes or asterisks, NOT numbered lists
- Lists should be left-aligned (no bullets, just text)
- For each list item, bold the text that appears before a colon (e.g., **New Wedge Ideas:** description text)
- Use **bold** markdown formatting for the text before colons only
- Section headers should use ### followed by the section name

Be direct and practical. Avoid generalities.

ARTICLE:

${truncatedContent}`
    };

    const systemPrompt = 'You are a helpful assistant that provides insightful, practical analysis. Write clear, complete responses that directly address the request.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
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
        max_tokens: 1200,
        temperature: 0.7,
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

    // For insightful-reply: remove quotes and hashtags
    if (featureType === 'insightful-reply') {
      // Remove surrounding quotes
      result = result.replace(/^["']|["']$/g, '');
      // Remove hashtags
      result = result.replace(/#\w+/g, '');
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

