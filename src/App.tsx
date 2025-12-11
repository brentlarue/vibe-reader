import { BrowserRouter } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AppContent from './components/AppContent';
import { Feed } from './types';
import { storage } from './utils/storage';

function App() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  
  // Sidebar collapse state with localStorage persistence (desktop)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Mobile drawer state (separate from desktop collapse)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
  };

  const toggleMobileDrawer = () => {
    setIsMobileDrawerOpen(!isMobileDrawerOpen);
  };

  const closeMobileDrawer = () => {
    setIsMobileDrawerOpen(false);
  };


  useEffect(() => {
    // Load feeds
    const loadedFeeds = storage.getFeeds();
    setFeeds(loadedFeeds);
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

  const handleFeedsChange = () => {
    const loadedFeeds = storage.getFeeds();
    setFeeds(loadedFeeds);
  };

  const handleRefreshAllFeeds = async (clearFirst: boolean = false) => {
    const allFeeds = storage.getFeeds();
    const rssFeeds = allFeeds.filter(feed => feed.sourceType === 'rss');
    
    if (rssFeeds.length === 0) {
      return;
    }

    // Clear all items if requested
    if (clearFirst) {
      storage.clearAllFeedItems();
      console.log('✓ Cleared all feed items');
    }

    const existingItems = storage.getFeedItems();
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
          const allFeeds = storage.getFeeds();
          const feedIndex = allFeeds.findIndex(f => f.id === feed.id);
          if (feedIndex !== -1) {
            allFeeds[feedIndex].rssTitle = feedTitle;
            storage.saveFeeds(allFeeds);
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
      storage.saveFeedItems(allItems);
      
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
