import { BrowserRouter } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AppContent from './components/AppContent';
import { Feed } from './types';
import { storage } from './utils/storage';
import { preferences } from './utils/preferences';

function App() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  
  // Sidebar collapse state - synced across devices
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Mobile drawer state (separate from desktop collapse, local to device)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Load sidebar state from server on mount
  useEffect(() => {
    const loadSidebarState = async () => {
      try {
        const saved = await preferences.getSidebarCollapsed();
        setIsSidebarCollapsed(saved);
      } catch (error) {
        // Fallback to localStorage if API fails
        const saved = localStorage.getItem('sidebarCollapsed');
        setIsSidebarCollapsed(saved ? JSON.parse(saved) : false);
      }
    };
    loadSidebarState();
  }, []);

  const toggleSidebar = async () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    // Save to localStorage as backup
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
    // Sync to server
    try {
      await preferences.setSidebarCollapsed(newState);
    } catch (error) {
      console.error('Failed to sync sidebar state to server:', error);
    }
  };

  const toggleMobileDrawer = () => {
    setIsMobileDrawerOpen(!isMobileDrawerOpen);
  };

  const closeMobileDrawer = () => {
    setIsMobileDrawerOpen(false);
  };


  useEffect(() => {
    // Load feeds
    const loadFeeds = async () => {
      const loadedFeeds = await storage.getFeeds();
      setFeeds(loadedFeeds);
    };
    loadFeeds();
  }, []);

  useEffect(() => {
    // Clear selected feed if it no longer exists
    if (selectedFeedId && !feeds.find(f => f.id === selectedFeedId)) {
      setSelectedFeedId(null);
    }
  }, [feeds, selectedFeedId]);

  useEffect(() => {
    // Expose clear and refresh function to window for console access
    (window as any).clearAndRefreshFeeds = () => {
      handleRefreshAllFeeds(true);
    };

    // Listen for clear and refresh event
    const handleClearAndRefresh = () => {
      handleRefreshAllFeeds(true);
    };
    window.addEventListener('clearAndRefresh', handleClearAndRefresh);

    // Check for one-time clear and refresh flag
    const shouldClearAndRefresh = localStorage.getItem('shouldClearAndRefresh');
    if (shouldClearAndRefresh === 'true') {
      localStorage.removeItem('shouldClearAndRefresh');
      handleRefreshAllFeeds(true);
    }

    return () => {
      delete (window as any).clearAndRefreshFeeds;
      window.removeEventListener('clearAndRefresh', handleClearAndRefresh);
    };
  }, []);

  const handleFeedsChange = async () => {
    const loadedFeeds = await storage.getFeeds();
    setFeeds(loadedFeeds);
  };

  const handleRefreshAllFeeds = async (clearFirst: boolean = false) => {
    const allFeeds = await storage.getFeeds();
    const rssFeeds = allFeeds.filter(feed => feed.sourceType === 'rss');
    
    if (rssFeeds.length === 0) {
      return;
    }

    // Clear all items if requested
    if (clearFirst) {
      await storage.clearAllFeedItems();
      console.log('✓ Cleared all feed items');
    }

    const existingItems = await storage.getFeedItems();
    const newItems: typeof existingItems = [];

    // Fetch all RSS feeds in parallel
    const { fetchRss } = await import('./utils/rss');
    
    const fetchPromises = rssFeeds.map(async (feed) => {
      try {
        console.log('Refreshing feed:', feed.url);
        
        // fetchRss now returns { items, feedTitle } with deduplication, sorting, and limiting
        const { items: feedItems, feedTitle } = await fetchRss(feed.url, existingItems);

        if (feedItems.length > 0) {
          console.log(`Refresh feed ${feed.url}: got ${feedItems.length} new items after deduplication`);
          newItems.push(...feedItems);
        } else {
          console.log(`Refresh feed ${feed.url}: no new items`);
        }

        // Update rssTitle if it's missing (for backwards compatibility with old feeds)
        // Don't update feed name during refresh - preserve the existing name
        if (!feed.rssTitle) {
          const allFeeds = await storage.getFeeds();
          const feedIndex = allFeeds.findIndex(f => f.id === feed.id);
          if (feedIndex !== -1) {
            allFeeds[feedIndex].rssTitle = feedTitle;
            await storage.saveFeeds(allFeeds);
            // Update state to reflect the change
            handleFeedsChange();
          }
        }
      } catch (error) {
        console.error(`Error fetching feed ${feed.url}:`, error);
      }
    });

    await Promise.all(fetchPromises);

    // Save items (either replace if cleared, or merge with existing)
    if (newItems.length > 0) {
      const allItems = clearFirst ? newItems : [...existingItems, ...newItems];
      await storage.saveFeedItems(allItems);
      
      // Trigger a refresh of FeedList components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    }
  };

  return (
    <BrowserRouter>
      <AppContent
        feeds={feeds}
        selectedFeedId={selectedFeedId}
        setSelectedFeedId={setSelectedFeedId}
        handleFeedsChange={handleFeedsChange}
        handleRefreshAllFeeds={handleRefreshAllFeeds}
        isSidebarCollapsed={isSidebarCollapsed}
        toggleSidebar={toggleSidebar}
        isMobileDrawerOpen={isMobileDrawerOpen}
        setIsMobileDrawerOpen={setIsMobileDrawerOpen}
      />
    </BrowserRouter>
  );
}

export default App;
