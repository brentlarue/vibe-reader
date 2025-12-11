import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env in project root
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
// Check if we're in production (Railway/Render set NODE_ENV automatically)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER;

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
app.use(express.json());
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
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
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

// Helper functions to read/write JSON files
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

// Data API endpoints (protected)
// Feeds endpoints
app.get('/api/data/feeds', requireAuth, async (req, res) => {
  try {
    await ensureDataDir();
    const feeds = await readJsonFile(FEEDS_FILE);
    res.json(feeds);
  } catch (error) {
    console.error('Error reading feeds:', error);
    res.status(500).json({ error: 'Failed to read feeds' });
  }
});

app.post('/api/data/feeds', requireAuth, async (req, res) => {
  try {
    await ensureDataDir();
    const feeds = Array.isArray(req.body) ? req.body : [];
    await writeJsonFile(FEEDS_FILE, feeds);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving feeds:', error);
    res.status(500).json({ error: 'Failed to save feeds' });
  }
});

// Feed items endpoints
app.get('/api/data/feed-items', requireAuth, async (req, res) => {
  try {
    await ensureDataDir();
    const items = await readJsonFile(FEED_ITEMS_FILE);
    res.json(items);
  } catch (error) {
    console.error('Error reading feed items:', error);
    res.status(500).json({ error: 'Failed to read feed items' });
  }
});

app.post('/api/data/feed-items', requireAuth, async (req, res) => {
  try {
    await ensureDataDir();
    const items = Array.isArray(req.body) ? req.body : [];
    await writeJsonFile(FEED_ITEMS_FILE, items);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving feed items:', error);
    res.status(500).json({ error: 'Failed to save feed items' });
  }
});

// Preferences endpoint (for theme, sidebar state, etc.)
app.get('/api/data/preferences', requireAuth, async (req, res) => {
  try {
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

app.post('/api/data/preferences', requireAuth, async (req, res) => {
  try {
    await ensureDataDir();
    const currentPrefs = existsSync(PREFERENCES_FILE) ? await readJsonFile(PREFERENCES_FILE) : {};
    const updatedPrefs = { ...currentPrefs, ...req.body };
    await writeJsonFile(PREFERENCES_FILE, updatedPrefs);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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

