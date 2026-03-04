import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AppContent from './components/AppContent';
import LoginPage from './components/LoginPage';
import AuthCallback from './components/AuthCallback';
import ResetPassword from './components/ResetPassword';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Feed } from './types';
import { storage } from './utils/storage';
import { preferences } from './utils/preferences';

function AppRoutes() {
  const { session, loading } = useAuth();
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

  const isAuthenticated = !!session;

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
      console.log('Cleared all feed items');
    }

    const existingItems = await storage.getFeedItems();

    // Fetch all RSS feeds in parallel
    const { fetchRss } = await import('./utils/rss');

    const fetchPromises = rssFeeds.map(async (feed) => {
      try {
        console.log('Refreshing feed:', feed.url);

        const { items: feedItems, feedTitle } = await fetchRss(feed.url, existingItems, feed.rssTitle);

        if (feedItems.length > 0) {
          console.log(`Refresh feed ${feed.url}: got ${feedItems.length} new items after deduplication`);

          const itemsToSave = feedItems.map(item => ({
            ...item,
            source: feedTitle,
          }));
          await storage.upsertFeedItems(feed.id, itemsToSave);

          storage.fetchContentForItems(itemsToSave).catch((err) => {
            console.warn('Background content fetch failed:', err);
          });
        } else {
          console.log(`Refresh feed ${feed.url}: no new items`);
        }

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

        try {
          const allItemsAfterRefresh = await storage.getFeedItems();
          const orphanedItems = allItemsAfterRefresh.filter(item => {
            if (item.feedId === feed.id) return false;
            if (item.source === feedTitle || item.source === feed.rssTitle) return false;

            const feedHostname = feed.url.toLowerCase();
            const itemUrl = item.url?.toLowerCase() || '';

            if (feedHostname.includes('brianvia.blog') && feedHostname.includes('paul-graham')) {
              if (itemUrl.includes('paulgraham.com')) {
                return true;
              }
            }

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

          if (orphanedItems.length > 0) {
            console.log(`Reassociating ${orphanedItems.length} orphaned items for feed ${feed.name}`);

            for (const item of orphanedItems) {
              try {
                await storage.reassociateItem(item.id, feed.id, feedTitle);
              } catch (error) {
                console.error(`Error reassociating item ${item.id}:`, error);
              }
            }

            window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
          }
        } catch (reassocError) {
          console.error('Error during item reassociation:', reassocError);
        }
      } catch (error) {
        console.error(`Error fetching feed ${feed.url}:`, error);
      }
    });

    await Promise.all(fetchPromises);

    try {
      const now = new Date();
      const timestamp = now.toISOString();
      await preferences.setLastFeedRefresh(timestamp);
      window.dispatchEvent(new CustomEvent('lastRefreshTimeUpdated'));
    } catch (error) {
      console.error('Failed to save last refresh time:', error);
    }

    window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
  };

  // Show loading state while checking auth
  if (loading) {
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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
