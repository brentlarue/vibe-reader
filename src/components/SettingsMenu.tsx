import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Theme, Feed } from '../types';
import { storage } from '../utils/storage';
import { itemBelongsToFeed } from '../utils/feedMatching';
import { preferences } from '../utils/preferences';

const themes: { value: Theme; label: string; icon: 'sun' | 'moon' | 'book' | 'yc' }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'sepia', label: 'Sepia', icon: 'book' },
  { value: 'hn', label: 'Hacker News', icon: 'yc' },
];

interface SettingsMenuProps {
  onRefreshFeeds: () => Promise<void>;
  feeds: Feed[];
}

export default function SettingsMenu({ onRefreshFeeds, feeds }: SettingsMenuProps) {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ bottom: 0, left: 0, width: 0 });
  const [lastRefreshTime, setLastRefreshTime] = useState<string | null>(null);

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        bottom: window.innerHeight - rect.top + 8, // 8px gap above button
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Format date as dd.mm.yy, hh:mm (24-hour format)
  const formatRefreshTime = useCallback((isoString: string): string => {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
  }, []);

  // Load and update last refresh time
  const loadLastRefreshTime = useCallback(async () => {
    try {
      // First check localStorage for immediate update (preferences.set() updates it first)
      const cachedPrefs = localStorage.getItem('vibe-reader-preferences');
      if (cachedPrefs) {
        try {
          const parsed = JSON.parse(cachedPrefs);
          if (parsed.lastFeedRefresh) {
            setLastRefreshTime(parsed.lastFeedRefresh);
            // Still fetch from server to ensure we have the latest, but show cached immediately
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // Then fetch from server to get the authoritative value
      const stored = await preferences.getLastFeedRefresh();
      if (stored) {
        setLastRefreshTime(stored);
      } else if (!cachedPrefs) {
        // Only clear if we have no cached value either
        setLastRefreshTime(null);
      }
    } catch (error) {
      console.error('Failed to load last refresh time:', error);
      // Keep existing value if fetch fails
    }
  }, []);

  useEffect(() => {
    loadLastRefreshTime();

    // Listen for refresh events to update the time
    const handleFeedItemsUpdated = () => {
      // Add a small delay to ensure server save has completed
      setTimeout(() => {
        loadLastRefreshTime();
      }, 200);
    };
    
    // Also listen for explicit refresh time update event
    const handleLastRefreshTimeUpdated = () => {
      // Immediate reload when refresh time is explicitly updated
      loadLastRefreshTime();
    };
    
    window.addEventListener('feedItemsUpdated', handleFeedItemsUpdated);
    window.addEventListener('lastRefreshTimeUpdated', handleLastRefreshTimeUpdated);

    return () => {
      window.removeEventListener('feedItemsUpdated', handleFeedItemsUpdated);
      window.removeEventListener('lastRefreshTimeUpdated', handleLastRefreshTimeUpdated);
    };
  }, [loadLastRefreshTime]);

  // Reload when menu opens
  useEffect(() => {
    if (isOpen) {
      loadLastRefreshTime();
    }
  }, [isOpen, loadLastRefreshTime]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      // Still redirect to login even if logout request fails
      window.location.href = '/login';
    }
  };

  const handleRefreshFeeds = async () => {
    // Filter to only real feeds (not link pseudo-feed)
    const realFeeds = feeds.filter(f => f.sourceType !== 'link');
    if (realFeeds.length === 0) return;
    
    setIsRefreshing(true);
    try {
      await onRefreshFeeds();
    } catch (err) {
      console.error('Error refreshing feeds:', err);
    } finally {
      setIsRefreshing(false);
    }
  };


  const handleCullTheHerd = async () => {
    if (!confirm('This will delete all inbox items except the 5 most recent from each feed. Items in Later, Bookmarks, and Archive will not be affected. Continue?')) {
      return;
    }

    try {
      // Get all feeds
      const feeds = await storage.getFeeds();
      const allItems = await storage.getFeedItems();
      
      let totalDeleted = 0;

      // For each feed, cull inbox items to keep only top 5
      for (const feed of feeds) {
        // Get inbox items for this feed using robust matching
        const feedInboxItems = allItems.filter(item => {
          if (item.status !== 'inbox') return false;
          return itemBelongsToFeed(item, feed);
        });

        if (feedInboxItems.length <= 5) {
          continue; // Already 5 or fewer, skip
        }

        // Sort by publishedAt descending (newest first)
        const sorted = [...feedInboxItems].sort((a, b) => {
          const dateA = new Date(a.publishedAt).getTime();
          const dateB = new Date(b.publishedAt).getTime();
          return dateB - dateA;
        });

        // Keep top 5, delete the rest
        const toDelete = sorted.slice(5);
        
        for (const item of toDelete) {
          try {
            await storage.removeFeedItem(item.id);
            totalDeleted++;
          } catch (error) {
            console.error(`Error deleting item ${item.id}:`, error);
          }
        }
      }

      // Trigger refresh of feed lists
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
      
      alert(`Culled ${totalDeleted} inbox item${totalDeleted !== 1 ? 's' : ''}. Kept the 5 most recent from each feed.`);
      setIsOpen(false);
    } catch (error) {
      console.error('Error culling the herd:', error);
      alert('Error culling items. Please try again.');
    }
  };

  return (
    <div className="relative">
      {/* Settings Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-3 py-2 text-sm transition-colors"
        style={{
          color: 'var(--theme-text-secondary)',
          backgroundColor: isOpen ? 'var(--theme-hover-bg)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            e.currentTarget.style.color = 'var(--theme-text)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--theme-text-secondary)';
          }
        }}
      >
        <span>Settings</span>
      </button>

      {/* Click outside overlay - rendered via portal to escape sidebar stacking context */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[100]"
          onClick={() => setIsOpen(false)}
        />,
        document.body
      )}

      {/* Settings Menu Card - also rendered via portal to be above overlay */}
      {isOpen && createPortal(
        <div
          className="fixed shadow-xl p-4 space-y-4 z-[101]"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            bottom: menuPosition.bottom,
            left: menuPosition.left,
            width: menuPosition.width,
          }}
        >
          {/* Theme Section */}
          <div>
            <div 
              className="flex items-center gap-1 p-1"
              style={{ backgroundColor: 'var(--theme-hover-bg)' }}
            >
              {themes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex-1 flex items-center justify-center px-2 py-2.5 transition-colors ${
                    theme === t.value
                      ? 'shadow-sm'
                      : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: theme === t.value ? 'var(--theme-card-bg)' : 'transparent',
                    color: 'var(--theme-text-secondary)',
                  }}
                  title={t.label}
                  aria-label={t.label}
                >
                  {t.icon === 'sun' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                  {t.icon === 'moon' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                  {t.icon === 'book' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  )}
                  {t.icon === 'yc' && (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="2" width="20" height="20" strokeWidth="2" />
                      <path d="M7 6L12 13V18M17 6L12 13" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Last refreshed */}
          <div 
            className="px-2 py-2.5 text-sm"
            style={{
              borderTop: '1px solid var(--theme-border)',
              paddingTop: '12px',
            }}
          >
            <div style={{ 
              color: 'var(--theme-text-secondary)',
              marginBottom: '4px',
            }}>
              Last refreshed:
            </div>
            <div 
              className="text-xs"
              style={{ 
                color: 'var(--theme-text-muted)',
                marginTop: '2px',
              }}
            >
              {lastRefreshTime ? formatRefreshTime(lastRefreshTime) : 'Never'}
            </div>
          </div>

          {/* Refresh feeds */}
          <button
            onClick={handleRefreshFeeds}
            disabled={isRefreshing || feeds.filter(f => f.sourceType !== 'link').length === 0}
            className="w-full text-left px-2 py-2.5 text-sm transition-colors disabled:cursor-not-allowed"
            style={{
              color: isRefreshing || feeds.filter(f => f.sourceType !== 'link').length === 0 
                ? 'var(--theme-text-muted)' 
                : 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              if (!isRefreshing && feeds.filter(f => f.sourceType !== 'link').length > 0) {
                e.currentTarget.style.color = 'var(--theme-text)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isRefreshing && feeds.filter(f => f.sourceType !== 'link').length > 0) {
                e.currentTarget.style.color = 'var(--theme-text-secondary)';
              }
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh feeds'}</span>
          </button>

          {/* Cull the herd */}
          <button
            onClick={handleCullTheHerd}
            className="w-full text-left px-2 py-2.5 text-sm transition-colors"
            style={{
              color: 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>Cull the herd</span>
          </button>

          {/* Clear cache */}
          <button
            onClick={() => {
              storage.clearLocalCache();
              setIsOpen(false);
              // Force reload to fetch fresh data from server
              window.location.reload();
            }}
            className="w-full text-left px-2 py-2.5 text-sm transition-colors"
            style={{
              color: 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>Clear cache</span>
          </button>

          {/* Log out */}
          <button
            onClick={handleLogout}
            className="w-full text-left px-2 py-2.5 text-sm transition-colors"
            style={{
              color: 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>Log out</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

