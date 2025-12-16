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

  // Set page title based on environment
  useEffect(() => {
    const hostname = window.location.hostname;
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local') || hostname.includes('dev');
    document.title = isDev ? 'The Signal (DEV)' : 'The Signal';
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Don't check auth if we're on the login page
      if (window.location.pathname === '/login') {
        setIsAuthenticated(false);
        return;
      }

      try {
        const res = await fetch('/api/me', {
          credentials: 'include',
        });
        
        setIsAuthenticated(res.ok);
        if (!res.ok) {
          // Only redirect if we're not already on login page
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
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
        // Pass feed.rssTitle so it can match existing items for this specific feed
        const { items: feedItems, feedTitle } = await fetchRss(feed.url, existingItems, feed.rssTitle);

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

        // Always update rssTitle to ensure it matches the current RSS feed title
        // This ensures items can be correctly matched even if feed was renamed or RSS title changed
        if (!feed.rssTitle || feed.rssTitle !== feedTitle) {
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

        // Reassociate orphaned items: Find items that should belong to this feed but don't match
        // This fixes items that were created before rssTitle was set correctly or feed URL changed
        try {
          const allItemsAfterRefresh = await storage.getFeedItems();
          const orphanedItems = allItemsAfterRefresh.filter(item => {
            // Skip items that already belong to this feed
            if (item.feedId === feed.id) return false;
            if (item.source === feedTitle || item.source === feed.rssTitle) return false;
            
            // Check if item should belong to this feed by URL pattern
            const feedHostname = feed.url.toLowerCase();
            const itemUrl = item.url?.toLowerCase() || '';
            
            // For proxy feeds like brianvia.blog/paul-graham, items come from paulgraham.com
            if (feedHostname.includes('brianvia.blog') && feedHostname.includes('paul-graham')) {
              if (itemUrl.includes('paulgraham.com')) {
                return true;
              }
            }
            
            // For other feeds, check if item URL matches feed patterns
            // This is a fallback - if new items were fetched and match, old items from same domain likely do too
            if (feedItems.length > 0) {
              const newItemUrls = feedItems.map(i => {
                try {
                  return new URL(i.url).hostname.toLowerCase();
                } catch {
                  return '';
                }
              });
              try {
                const itemHostname = new URL(item.url).hostname.toLowerCase();
                if (newItemUrls.includes(itemHostname) && 
                    item.source && 
                    (item.source.includes('Paul Graham') || item.source.includes('paul graham'))) {
                  return true;
                }
              } catch {
                // Continue
              }
            }
            
            return false;
          });

          // Update orphaned items to belong to this feed
          if (orphanedItems.length > 0) {
            console.log(`Reassociating ${orphanedItems.length} orphaned items for feed ${feed.name}`);
            
            for (const item of orphanedItems) {
              try {
                // Update item's source and feed_id
                await storage.reassociateItem(item.id, feed.id, feedTitle);
              } catch (error) {
                console.error(`Error reassociating item ${item.id}:`, error);
              }
            }
            
            // Refresh items after reassociation
            window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
          }
        } catch (reassocError) {
          console.error('Error during item reassociation:', reassocError);
          // Don't fail the refresh if reassociation fails
        }
      } catch (error) {
        console.error(`Error fetching feed ${feed.url}:`, error);
      }
    });

    await Promise.all(fetchPromises);
    
    // Store last refresh time on server
    try {
      const now = new Date();
      const timestamp = now.toISOString();
      console.log('Saving last refresh time:', timestamp);
      await preferences.setLastFeedRefresh(timestamp);
      console.log('Successfully saved last refresh time');
      
      // Dispatch event specifically for refresh time update (after save completes)
      window.dispatchEvent(new CustomEvent('lastRefreshTimeUpdated'));
    } catch (error) {
      console.error('Failed to save last refresh time:', error);
    }
    
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
