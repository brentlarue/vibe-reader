/**
 * Brave Search API Provider
 * 
 * Implements web search using Brave Search API.
 * Free tier: 2,000 requests/month, 1 request/second
 * Paid: $3 per 1,000 requests
 * 
 * API Docs: https://api.search.brave.com/app/documentation/web-search/get-started
 */

const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Simple in-memory cache for search results
 * Key: query + limit, Value: { results, timestamp }
 * TTL: 10 minutes
 */
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Clear expired cache entries
 */
function cleanCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

/**
 * Search the web using Brave Search API
 * @param {Object} params
 * @param {string} params.query - Search query
 * @param {number} [params.limit=10] - Maximum number of results (1-20)
 * @param {number} [params.recencyDays] - Prefer results from last N days (optional)
 * @returns {Promise<Array<{title: string, url: string, snippet: string, source?: string, publishedAt?: string}>>}
 */
export async function webSearch({ query, limit = 10, recencyDays }) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Query is required and must be a non-empty string');
  }

  // Validate limit
  const validLimit = Math.min(Math.max(1, Math.floor(limit || 10)), 20);
  
  // Check cache
  const cacheKey = `${query}:${validLimit}:${recencyDays || 'none'}`;
  cleanCache();
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[WebSearch] Cache hit for query: ${query.substring(0, 50)}`);
    return cached.results;
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY environment variable is required');
  }

  // Build query with recency if specified
  let searchQuery = query.trim();
  if (recencyDays && recencyDays > 0) {
    // Brave doesn't have a direct recencyDays param, but we can add date filters
    // For now, we'll just use the query as-is (can be enhanced later)
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - recencyDays);
    // Note: Brave API may support freshness filters in future
  }

  try {
    const url = new URL(BRAVE_API_BASE);
    url.searchParams.set('q', searchQuery);
    url.searchParams.set('count', validLimit.toString());
    url.searchParams.set('safesearch', 'moderate');
    url.searchParams.set('freshness', 'py'); // Prefer recent results

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 401) {
        throw new Error('Invalid BRAVE_SEARCH_API_KEY');
      }
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const error = new Error('Rate limit exceeded. Please try again later.');
        error.type = 'rate_limit';
        error.retryAfter = retryAfter ? parseInt(retryAfter) : 60;
        throw error;
      }
      
      throw new Error(`Brave API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Map Brave response to our SearchResult format
    const results = (data.web?.results || []).map(result => ({
      title: result.title || '',
      url: result.url || '',
      snippet: result.description || '',
      source: result.meta_url?.hostname || undefined,
      publishedAt: result.age ? undefined : undefined, // Brave doesn't always provide publish date
    })).filter(result => {
      // Validate URLs - drop malformed results
      try {
        new URL(result.url);
        return true;
      } catch {
        return false;
      }
    });

    // Cache results
    cache.set(cacheKey, {
      results,
      timestamp: Date.now(),
    });

    console.log(`[WebSearch] Found ${results.length} results for query: ${query.substring(0, 50)}`);
    
    return results;
  } catch (error) {
    // Re-throw our custom error objects
    if (error.type) {
      throw error;
    }
    
    // Handle network errors
    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      const networkError = new Error('Network error while searching. Please try again.');
      networkError.type = 'network';
      networkError.details = error.message;
      throw networkError;
    }
    
    // Re-throw other errors (preserve type if already set)
    if (error.type) {
      throw error;
    }
    
    const unknownError = new Error(error.message || 'Unknown error occurred');
    unknownError.type = 'unknown';
    unknownError.details = error;
    throw unknownError;
  }
}
