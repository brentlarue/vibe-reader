import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FeedList from './components/FeedList';
import ArticleReader from './components/ArticleReader';
import { Feed } from './types';
import { storage } from './utils/storage';

function App() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  
  // Sidebar collapse state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
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

  const handleFeedsChange = () => {
    const loadedFeeds = storage.getFeeds();
    setFeeds(loadedFeeds);
  };

  const handleRefreshAllFeeds = async () => {
    const allFeeds = storage.getFeeds();
    const rssFeeds = allFeeds.filter(feed => feed.sourceType === 'rss');
    
    if (rssFeeds.length === 0) {
      return;
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

    // Merge new items with existing items
    if (newItems.length > 0) {
      const allItems = [...existingItems, ...newItems];
      storage.saveFeedItems(allItems);
      
      // Trigger a refresh of FeedList components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    }
  };

  return (
    <BrowserRouter>
      <div 
        className="flex h-screen relative"
        style={{ backgroundColor: 'var(--theme-bg)' }}
      >
        {!isSidebarCollapsed && (
          <Sidebar 
            feeds={feeds} 
            selectedFeedId={selectedFeedId}
            onFeedsChange={handleFeedsChange}
            onRefreshFeeds={handleRefreshAllFeeds}
            onFeedSelect={setSelectedFeedId}
            isCollapsed={isSidebarCollapsed}
            onToggle={toggleSidebar}
          />
        )}
        {isSidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="group/toggle absolute left-8 top-8 p-2 rounded transition-colors z-10"
            style={{
              color: 'var(--theme-text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-secondary)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="1" strokeWidth="2" />
              <line x1="9" y1="3" x2="9" y2="21" strokeWidth="2" />
            </svg>
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-black whitespace-nowrap opacity-0 group-hover/toggle:opacity-100 pointer-events-none transition-opacity duration-0">
              Open sidebar
            </span>
          </button>
        )}
        <main className="flex-1 overflow-y-auto px-12 py-12">
          <Routes>
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="/inbox" element={<FeedList status="inbox" selectedFeedId={selectedFeedId} feeds={feeds} />} />
            <Route path="/saved" element={<FeedList status="saved" selectedFeedId={selectedFeedId} feeds={feeds} />} />
            <Route path="/bookmarks" element={<FeedList status="bookmarked" selectedFeedId={selectedFeedId} feeds={feeds} />} />
            <Route path="/archive" element={<FeedList status="archived" selectedFeedId={selectedFeedId} feeds={feeds} />} />
            <Route path="/article/:id" element={<ArticleReader />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
