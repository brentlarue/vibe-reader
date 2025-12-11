import { FeedItem, Feed } from '../types';

const FEED_ITEMS_KEY = 'vibe-reader-feed-items';
const FEEDS_KEY = 'vibe-reader-feeds';

// API request helper
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await fetch(`/api/data/${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized. Please check your API key in .env file.');
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
};

// Fallback to localStorage if API fails
const fallbackToLocalStorage = (key: string, defaultValue: any) => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
};

const saveToLocalStorage = (key: string, value: any) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

export const storage = {
  getFeedItems: async (): Promise<FeedItem[]> => {
    try {
      const items = await apiRequest('feed-items');
      saveToLocalStorage(FEED_ITEMS_KEY, items);
      return items;
    } catch (error) {
      console.warn('Failed to fetch feed items from API, using local storage:', error);
      return fallbackToLocalStorage(FEED_ITEMS_KEY, []);
    }
  },

  saveFeedItems: async (items: FeedItem[]): Promise<void> => {
    // Save to localStorage first for immediate UI update
    saveToLocalStorage(FEED_ITEMS_KEY, items);
    
    try {
      await apiRequest('feed-items', {
        method: 'POST',
        body: JSON.stringify(items),
      });
    } catch (error) {
      console.error('Failed to save feed items to API:', error);
      throw error;
    }
  },

  getFeedItem: async (id: string): Promise<FeedItem | null> => {
    const items = await storage.getFeedItems();
    return items.find(item => item.id === id) || null;
  },

  getFeeds: async (): Promise<Feed[]> => {
    try {
      const feeds = await apiRequest('feeds');
      saveToLocalStorage(FEEDS_KEY, feeds);
      return feeds;
    } catch (error) {
      console.warn('Failed to fetch feeds from API, using local storage:', error);
      return fallbackToLocalStorage(FEEDS_KEY, []);
    }
  },

  saveFeeds: async (feeds: Feed[]): Promise<void> => {
    // Save to localStorage first for immediate UI update
    saveToLocalStorage(FEEDS_KEY, feeds);
    
    try {
      await apiRequest('feeds', {
        method: 'POST',
        body: JSON.stringify(feeds),
      });
    } catch (error) {
      console.error('Failed to save feeds to API:', error);
      throw error;
    }
  },

  addFeed: async (feed: Feed): Promise<void> => {
    const feeds = await storage.getFeeds();
    // Check if feed with same URL already exists
    if (feeds.some(f => f.url === feed.url)) {
      throw new Error('Feed with this URL already exists');
    }
    feeds.push(feed);
    await storage.saveFeeds(feeds);
  },

  removeFeed: async (feedId: string): Promise<void> => {
    const feeds = await storage.getFeeds();
    const feedToRemove = feeds.find(f => f.id === feedId);
    
    if (!feedToRemove) {
      return; // Feed not found
    }

    // Remove the feed
    const filteredFeeds = feeds.filter(f => f.id !== feedId);
    await storage.saveFeeds(filteredFeeds);

    // Remove items from this feed that are in "inbox" or "archived" status
    // Keep items with "saved" or "bookmarked" status
    const allItems = await storage.getFeedItems();
    
    // Helper to normalize hostname for comparison
    const normalizeHostname = (url: string): string | null => {
      try {
        const urlObj = new URL(url);
        let hostname = urlObj.hostname.toLowerCase();
        if (hostname.startsWith('www.')) {
          hostname = hostname.substring(4);
        }
        return hostname;
      } catch {
        return null;
      }
    };

    const feedHostname = normalizeHostname(feedToRemove.url);
    
    const filteredItems = allItems.filter((item) => {
      // Check if item belongs to this feed by comparing hostnames
      const itemHostname = normalizeHostname(item.url);
      const belongsToFeed = feedHostname && itemHostname && feedHostname === itemHostname;

      if (!belongsToFeed) {
        return true; // Keep items from other feeds
      }

      // If item belongs to this feed, only keep if it's saved or bookmarked
      return item.status === 'saved' || item.status === 'bookmarked';
    });

    await storage.saveFeedItems(filteredItems);
  },

  getFeed: async (feedId: string): Promise<Feed | null> => {
    const feeds = await storage.getFeeds();
    return feeds.find(f => f.id === feedId) || null;
  },

  updateFeedName: async (feedId: string, newName: string): Promise<void> => {
    const feeds = await storage.getFeeds();
    const updated = feeds.map(f => 
      f.id === feedId ? { ...f, name: newName.trim() } : f
    );
    await storage.saveFeeds(updated);
  },

  removeFeedItem: async (itemId: string): Promise<void> => {
    const items = await storage.getFeedItems();
    const filtered = items.filter(item => item.id !== itemId);
    await storage.saveFeedItems(filtered);
  },

  clearAllFeedItems: async (): Promise<void> => {
    await storage.saveFeedItems([]);
  },
};
