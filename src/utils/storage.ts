import { FeedItem, Feed } from '../types';

const FEED_ITEMS_KEY = 'vibe-reader-feed-items';
const FEEDS_KEY = 'vibe-reader-feeds';

export const storage = {
  getFeedItems: (): FeedItem[] => {
    const stored = localStorage.getItem(FEED_ITEMS_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  saveFeedItems: (items: FeedItem[]): void => {
    localStorage.setItem(FEED_ITEMS_KEY, JSON.stringify(items));
  },

  getFeedItem: (id: string): FeedItem | null => {
    const items = storage.getFeedItems();
    return items.find(item => item.id === id) || null;
  },

  getFeeds: (): Feed[] => {
    const stored = localStorage.getItem(FEEDS_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  saveFeeds: (feeds: Feed[]): void => {
    localStorage.setItem(FEEDS_KEY, JSON.stringify(feeds));
  },

  addFeed: (feed: Feed): void => {
    const feeds = storage.getFeeds();
    // Check if feed with same URL already exists
    if (feeds.some(f => f.url === feed.url)) {
      throw new Error('Feed with this URL already exists');
    }
    feeds.push(feed);
    storage.saveFeeds(feeds);
  },

  removeFeed: (feedId: string): void => {
    const feeds = storage.getFeeds();
    const feedToRemove = feeds.find(f => f.id === feedId);
    
    if (!feedToRemove) {
      return; // Feed not found
    }

    // Remove the feed
    const filteredFeeds = feeds.filter(f => f.id !== feedId);
    storage.saveFeeds(filteredFeeds);

    // Remove items from this feed that are in "inbox" or "archived" status
    // Keep items with "saved" or "bookmarked" status
    const allItems = storage.getFeedItems();
    
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

    storage.saveFeedItems(filteredItems);
  },

  getFeed: (feedId: string): Feed | null => {
    const feeds = storage.getFeeds();
    return feeds.find(f => f.id === feedId) || null;
  },

  updateFeedName: (feedId: string, newName: string): void => {
    const feeds = storage.getFeeds();
    const updated = feeds.map(f => 
      f.id === feedId ? { ...f, name: newName.trim() } : f
    );
    storage.saveFeeds(updated);
  },

  removeFeedItem: (itemId: string): void => {
    const items = storage.getFeedItems();
    const filtered = items.filter(item => item.id !== itemId);
    storage.saveFeedItems(filtered);
  },
};
