import { FeedItem, Feed } from '../types';
import { apiFetch } from './apiFetch';

// localStorage keys for local cache (used as fallback)
const FEED_ITEMS_KEY = 'vibe-reader-feed-items';
const FEEDS_KEY = 'vibe-reader-feeds';

// ============================================================================
// API Helpers
// ============================================================================

/**
 * Make an API request with proper error handling
 */
const apiRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await apiFetch(`/api/${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
};

/**
 * Fallback to localStorage if API fails
 * Handles quota/access errors gracefully
 */
const fallbackToLocalStorage = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    try {
      return JSON.parse(stored);
    } catch (parseError) {
      console.warn(`[Storage] Failed to parse cached ${key}, using default:`, parseError);
      return defaultValue;
    }
  } catch (error) {
    // localStorage might be disabled or quota exceeded
    console.warn(`[Storage] Cannot access localStorage for ${key}, using default:`, error);
    return defaultValue;
  }
};

/**
 * Save to localStorage for local caching
 * Handles quota exceeded errors gracefully
 */
const saveToLocalStorage = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn(`[Storage] Quota exceeded when saving ${key}, clearing old cache and retrying...`);
      try {
        // Try clearing old cache first
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify(value));
        console.log(`[Storage] Successfully saved ${key} after clearing old cache`);
      } catch (retryError) {
        console.error(`[Storage] Still cannot save ${key} after clearing, storage quota exceeded:`, retryError);
        // Don't throw - continue without caching
      }
    } else {
      console.error(`[Storage] Error saving ${key}:`, error);
      // Don't throw - continue without caching
    }
  }
};

// ============================================================================
// Storage API
// ============================================================================

export const storage = {
  // ==========================================================================
  // FEEDS
  // ==========================================================================

  /**
   * Get all feeds from the server
   */
  getFeeds: async (): Promise<Feed[]> => {
    try {
      const feeds = await apiRequest<Feed[]>('feeds');
      // Don't fail if caching fails - return the API data anyway
      try {
        saveToLocalStorage(FEEDS_KEY, feeds);
      } catch (cacheError) {
        console.warn('[Storage] Failed to cache feeds, but continuing with API data:', cacheError);
      }
      console.log('[Storage] Successfully fetched feeds:', feeds.length);
      return feeds;
    } catch (error: unknown) {
      const err = error as { suppressWarning?: boolean; isUnauthorized?: boolean };
      console.error('[Storage] Failed to fetch feeds:', {
        error,
        isUnauthorized: err?.isUnauthorized,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      
      if (!err?.suppressWarning && !err?.isUnauthorized) {
        console.warn('Failed to fetch feeds from API, using local storage:', error);
      }
      
      const cached = fallbackToLocalStorage<Feed[]>(FEEDS_KEY, []);
      console.log('[Storage] Using cached feeds:', cached.length);
      return cached;
    }
  },

  /**
   * Get a single feed by ID
   */
  getFeed: async (feedId: string): Promise<Feed | null> => {
    const feeds = await storage.getFeeds();
    return feeds.find(f => f.id === feedId) || null;
  },

  /**
   * Add a new feed
   */
  addFeed: async (feed: { url: string; displayName?: string; rssTitle?: string; sourceType?: string }): Promise<Feed> => {
    try {
      const newFeed = await apiRequest<Feed>('feeds', {
        method: 'POST',
        body: JSON.stringify({
          url: feed.url,
          displayName: feed.displayName || feed.url,
          rssTitle: feed.rssTitle,
          sourceType: feed.sourceType || 'rss',
        }),
      });
      
      // Update local cache
      const feeds = fallbackToLocalStorage<Feed[]>(FEEDS_KEY, []);
      feeds.push(newFeed);
      saveToLocalStorage(FEEDS_KEY, feeds);
      
      return newFeed;
    } catch (error) {
      console.error('Failed to add feed:', error);
      throw error;
    }
  },

  /**
   * Update a feed's display name
   */
  updateFeedName: async (feedId: string, newName: string): Promise<void> => {
    try {
      await apiRequest(`feeds/${feedId}`, {
        method: 'PUT',
        body: JSON.stringify({ displayName: newName.trim() }),
      });
      
      // Update local cache
      const feeds = fallbackToLocalStorage<Feed[]>(FEEDS_KEY, []);
      const updated = feeds.map(f => 
        f.id === feedId ? { ...f, name: newName.trim() } : f
      );
      saveToLocalStorage(FEEDS_KEY, updated);
    } catch (error) {
      console.error('Failed to update feed name:', error);
      throw error;
    }
  },

  /**
   * Remove a feed and optionally its items
   */
  removeFeed: async (feedId: string): Promise<void> => {
    try {
      await apiRequest(`feeds/${feedId}`, {
        method: 'DELETE',
      });
      
      // Update local cache
      const feeds = fallbackToLocalStorage<Feed[]>(FEEDS_KEY, []);
      const filtered = feeds.filter(f => f.id !== feedId);
      saveToLocalStorage(FEEDS_KEY, filtered);
    } catch (error) {
      console.error('Failed to remove feed:', error);
      throw error;
    }
  },

  /**
   * Legacy: Save all feeds (for backward compatibility)
   * This now syncs with the server properly
   */
  saveFeeds: async (feeds: Feed[]): Promise<void> => {
    saveToLocalStorage(FEEDS_KEY, feeds);
    
    try {
      await apiRequest('data/feeds', {
        method: 'POST',
        body: JSON.stringify(feeds),
      });
    } catch (error) {
      console.error('Failed to save feeds to API:', error);
      throw error;
    }
  },

  // ==========================================================================
  // FEED ITEMS
  // ==========================================================================

  /**
   * Get all feed items from the server
   */
  getFeedItems: async (options?: { status?: string; feedId?: string }): Promise<FeedItem[]> => {
    try {
      const params = new URLSearchParams();
      if (options?.status) params.append('status', options.status);
      if (options?.feedId) params.append('feedId', options.feedId);
      
      const endpoint = params.toString() ? `items?${params}` : 'items';
      const items = await apiRequest<FeedItem[]>(endpoint);
      
      // Skip caching feed items - they're stored in Supabase and can be large
      // localStorage has quota limits (~5-10MB) and 249+ items with full content exceeds it
      // The API is the source of truth, so caching is not necessary
      
      console.log('[Storage] Successfully fetched items:', items.length, options);
      return items;
    } catch (error: unknown) {
      const err = error as { suppressWarning?: boolean; isUnauthorized?: boolean };
      console.error('[Storage] Failed to fetch items:', {
        error,
        isUnauthorized: err?.isUnauthorized,
        message: error instanceof Error ? error.message : 'Unknown error',
        options
      });
      
      if (!err?.suppressWarning && !err?.isUnauthorized) {
        console.warn('Failed to fetch feed items from API, using local storage:', error);
      }
      
      const cached = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      console.log('[Storage] Using cached items:', cached.length);
      return cached;
    }
  },

  /**
   * Get a single feed item by ID
   */
  getFeedItem: async (id: string): Promise<FeedItem | null> => {
    try {
      // URL-encode the id in case it contains special characters (like URLs)
      const encodedId = encodeURIComponent(id);
      const item = await apiRequest<FeedItem>(`items/${encodedId}`);
      return item;
    } catch (error) {
      // Fallback to local cache
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
    return items.find(item => item.id === id) || null;
    }
  },

  /**
   * Upsert feed items for a specific feed
   */
  upsertFeedItems: async (feedId: string, items: Partial<FeedItem>[]): Promise<void> => {
    try {
      await apiRequest(`feeds/${feedId}/items`, {
        method: 'POST',
        body: JSON.stringify(items),
      });
      
      // Don't cache to localStorage - items are stored in Supabase
      // localStorage has quota limits (~5-10MB) and caching 260+ items exceeds it
      // The API is the source of truth, so caching is not necessary
    } catch (error) {
      console.error('Failed to upsert feed items:', error);
      throw error;
    }
  },

  /**
   * Update a feed item's status
   */
  updateItemStatus: async (itemId: string, status: FeedItem['status']): Promise<FeedItem> => {
    try {
      // URL-encode the itemId in case it contains special characters (like URLs)
      const encodedId = encodeURIComponent(itemId);
      const updated = await apiRequest<FeedItem>(`items/${encodedId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      
      // Update local cache
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      const updatedItems = items.map(item => 
        item.id === itemId ? { ...item, status } : item
      );
      saveToLocalStorage(FEED_ITEMS_KEY, updatedItems);
      
      return updated;
    } catch (error) {
      console.error('Failed to update item status:', error);
      throw error;
    }
  },

  /**
   * Update a feed item's reading order subcategory (next | later | someday | null)
   * Does not change the item's primary status.
   */
  updateItemReadingOrder: async (
    itemId: string,
    readingOrder: 'next' | 'later' | 'someday' | null
  ): Promise<FeedItem> => {
    try {
      const encodedId = encodeURIComponent(itemId);
      const updated = await apiRequest<FeedItem>(`items/${encodedId}/reading-order`, {
        method: 'POST',
        body: JSON.stringify({ readingOrder }),
      });

      // Update local cache
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      const updatedItems = items.map(item =>
        item.id === itemId ? { ...item, readingOrder } : item
      );
      saveToLocalStorage(FEED_ITEMS_KEY, updatedItems);

      return updated;
    } catch (error) {
      console.error('Failed to update item reading order:', error);
      throw error;
    }
  },

  /**
   * Update a feed item's AI summary
   */
  updateItemSummary: async (itemId: string, summary: string): Promise<FeedItem> => {
    try {
      // URL-encode the itemId in case it contains special characters (like URLs)
      const encodedId = encodeURIComponent(itemId);
      const updated = await apiRequest<FeedItem>(`items/${encodedId}/summary`, {
        method: 'POST',
        body: JSON.stringify({ summary }),
      });
      
      // Update local cache
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      const updatedItems = items.map(item => 
        item.id === itemId ? { ...item, aiSummary: summary } : item
      );
      saveToLocalStorage(FEED_ITEMS_KEY, updatedItems);
      
      return updated;
    } catch (error) {
      console.error('Failed to update item summary:', error);
      throw error;
    }
  },

  /**
   * Update a feed item's AI feature (insightful-reply, investor-analysis, founder-implications)
   */
  updateItemAIFeature: async (itemId: string, featureType: 'insightful-reply' | 'investor-analysis' | 'founder-implications', content: string): Promise<FeedItem> => {
    try {
      // URL-encode the itemId in case it contains special characters (like URLs)
      const encodedId = encodeURIComponent(itemId);
      const updated = await apiRequest<FeedItem>(`items/${encodedId}/ai-feature`, {
        method: 'POST',
        body: JSON.stringify({ featureType, content }),
      });
      
      // Update local cache
      const fieldMap: Record<string, keyof FeedItem> = {
        'insightful-reply': 'aiInsightfulReply',
        'investor-analysis': 'aiInvestorAnalysis',
        'founder-implications': 'aiFounderImplications',
      };
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      const updatedItems = items.map(item => 
        item.id === itemId ? { ...item, [fieldMap[featureType]]: content } : item
      );
      saveToLocalStorage(FEED_ITEMS_KEY, updatedItems);
      
      return updated;
    } catch (error) {
      console.error('Failed to update AI feature:', error);
      throw error;
    }
  },

  /**
   * Reassociate an item with a different feed (updates feedId and source)
   */
  reassociateItem: async (itemId: string, feedId: string, source: string): Promise<FeedItem> => {
    try {
      const encodedId = encodeURIComponent(itemId);
      const updated = await apiRequest<FeedItem>(`items/${encodedId}/reassociate`, {
        method: 'POST',
        body: JSON.stringify({ feedId, source }),
      });
      
      // Update local cache
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      const updatedItems = items.map(item => 
        item.id === itemId ? { ...item, feedId, source } : item
      );
      saveToLocalStorage(FEED_ITEMS_KEY, updatedItems);
      
      return updated;
    } catch (error) {
      console.error('Failed to reassociate item:', error);
      throw error;
    }
  },

  /**
   * Delete a single feed item
   */
  removeFeedItem: async (itemId: string): Promise<void> => {
    try {
      // URL-encode the itemId in case it contains special characters (like URLs)
      const encodedId = encodeURIComponent(itemId);
      await apiRequest(`items/${encodedId}`, {
        method: 'DELETE',
      });
      
      // Update local cache
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      const filtered = items.filter(item => item.id !== itemId);
      saveToLocalStorage(FEED_ITEMS_KEY, filtered);
    } catch (error) {
      console.error('Failed to remove feed item:', error);
      throw error;
    }
  },

  /**
   * Delete all feed items with a specific status
   */
  deleteItemsByStatus: async (status: string): Promise<number> => {
    try {
      const result = await apiRequest<{ count: number }>(`items?status=${status}`, {
        method: 'DELETE',
      });
      
      // Update local cache
      const items = fallbackToLocalStorage<FeedItem[]>(FEED_ITEMS_KEY, []);
      const filtered = items.filter(item => item.status !== status);
      saveToLocalStorage(FEED_ITEMS_KEY, filtered);
      
      return result.count;
    } catch (error) {
      console.error('Failed to delete items by status:', error);
      throw error;
    }
  },

  /**
   * Clear all feed items (reset)
   */
  clearAllFeedItems: async (): Promise<void> => {
    // Clear each status type
    try {
      await storage.deleteItemsByStatus('inbox');
      await storage.deleteItemsByStatus('saved');
      await storage.deleteItemsByStatus('bookmarked');
      await storage.deleteItemsByStatus('archived');
      saveToLocalStorage(FEED_ITEMS_KEY, []);
    } catch (error) {
      console.error('Failed to clear all feed items:', error);
      throw error;
    }
  },

  /**
   * Legacy: Save all feed items (for backward compatibility)
   */
  saveFeedItems: async (items: FeedItem[]): Promise<void> => {
    saveToLocalStorage(FEED_ITEMS_KEY, items);
    
    try {
      await apiRequest('data/feed-items', {
        method: 'POST',
        body: JSON.stringify(items),
      });
    } catch (error) {
      console.error('Failed to save feed items to API:', error);
      throw error;
    }
  },

  /**
   * Clear local cache (localStorage) without affecting server data
   * Forces the app to refetch fresh data from the server
   */
  clearLocalCache: (): void => {
    if (typeof window === 'undefined') return;
    
    try {
      // Clear vibe-reader data caches, but preserve auth-related items
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('vibe-reader-')) {
          // Only clear data caches, not preferences that might affect UX
          if (key === 'vibe-reader-feed-items' || key === 'vibe-reader-feeds') {
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`[Cache] Failed to remove ${key}:`, error);
        }
      });
      
      console.log(`[Cache] Cleared ${keysToRemove.length} cached items from localStorage`);
    } catch (error) {
      console.error('[Cache] Error clearing cache:', error);
      // Try to clear all vibe-reader keys as fallback
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('vibe-reader-feed-items') || key.startsWith('vibe-reader-feeds')) {
            localStorage.removeItem(key);
          }
        });
      } catch (fallbackError) {
        console.error('[Cache] Fallback clear also failed:', fallbackError);
      }
    }
  },

  /**
   * Test API connectivity - useful for debugging sync issues
   */
  testConnection: async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/feeds', {
        credentials: 'include',
      });
      
      if (response.status === 401) {
        return { success: false, error: 'Not authenticated - please log in again' };
      }
      
      if (!response.ok) {
        return { success: false, error: `Server error: ${response.status}` };
      }
      
      // Verify we can parse the response
      await response.json();
      return { success: true };
    } catch (error) {
      return { success: false, error: `Network error: ${error instanceof Error ? error.message : 'Unknown'}` };
    }
  },
};
