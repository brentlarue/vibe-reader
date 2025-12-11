import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AppContent from './components/AppContent';
import LoginPage from './components/LoginPage';
import { Feed } from './types';
import { storage } from './utils/storage';
import { preferences } from './utils/preferences';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = checking
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  
  // Sidebar collapse state - synced across devices
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Mobile drawer state (separate from desktop collapse, local to device)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log('[APP] checkAuth called, pathname:', window.location.pathname);
      
      // Don't check auth if we're on the login page
      if (window.location.pathname === '/login') {
        console.log('[APP] On login page, setting isAuthenticated to false');
        setIsAuthenticated(false);
        return;
      }

      try {
        console.log('[APP] Calling /api/me...');
        const res = await fetch('/api/me', {
          credentials: 'include',
        });
        console.log('[APP] /api/me response status:', res.status);
        setIsAuthenticated(res.ok);
        if (!res.ok) {
          console.log('[APP] /api/me returned non-ok, redirecting to /login');
          // Only redirect if we're not already on login page
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        } else {
          console.log('[APP] /api/me successful, user is authenticated');
        }
      } catch (error) {
        console.error('[APP] Auth check error:', error);
        setIsAuthenticated(false);
        // Don't redirect if we're already on login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    };
    checkAuth();
  }, []);

  // Load sidebar state from server on mount (only if authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    
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
  }, [isAuthenticated]);

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


  useEffect(() => {
    // Load feeds only if authenticated
    if (isAuthenticated) {
      const loadFeeds = async () => {
        const loadedFeeds = await storage.getFeeds();
        setFeeds(loadedFeeds);
      };
      loadFeeds();
    }
  }, [isAuthenticated]);

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

    // Fetch all RSS feeds in parallel
    const { fetchRss } = await import('./utils/rss');
    
    const fetchPromises = rssFeeds.map(async (feed) => {
      try {
        console.log('Refreshing feed:', feed.url);
        
        // fetchRss now returns { items, feedTitle } with deduplication, sorting, and limiting
        const { items: feedItems, feedTitle } = await fetchRss(feed.url, existingItems);

        if (feedItems.length > 0) {
          console.log(`Refresh feed ${feed.url}: got ${feedItems.length} new items after deduplication`);
          
          // Upsert items for this feed
          await storage.upsertFeedItems(feed.id, feedItems.map(item => ({
            ...item,
            source: feedTitle,
          })));
        } else {
          console.log(`Refresh feed ${feed.url}: no new items`);
        }

        // Update rssTitle if it's missing (for backwards compatibility with old feeds)
        if (!feed.rssTitle) {
          try {
            const { apiFetch } = await import('./utils/apiFetch');
            await apiFetch(`/api/feeds/${feed.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rssTitle: feedTitle }),
            });
            handleFeedsChange();
          } catch (updateError) {
            console.error('Error updating feed rssTitle:', updateError);
          }
        }
      } catch (error) {
        console.error(`Error fetching feed ${feed.url}:`, error);
      }
    });

    await Promise.all(fetchPromises);
    
    // Trigger a refresh of FeedList components
    window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
  };

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ 
          backgroundColor: 'var(--theme-bg)',
          color: 'var(--theme-text)'
        }}
      >
        <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            isAuthenticated ? (
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
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
