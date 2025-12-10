import { Link, useLocation } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { Feed, FeedItem } from '../types';
import { storage } from '../utils/storage';
import ThemeToggle from './ThemeToggle';

interface SidebarProps {
  feeds: Feed[];
  selectedFeedId: string | null;
  onFeedsChange: () => void;
  onRefreshFeeds: () => Promise<void>;
  onFeedSelect: (feedId: string | null) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ feeds, selectedFeedId, onFeedsChange, onRefreshFeeds, onFeedSelect, isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const [feedUrl, setFeedUrl] = useState('');
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editFeedName, setEditFeedName] = useState('');

  const navItems = [
    { path: '/inbox', label: 'Inbox' },
    { path: '/saved', label: 'Later' },
    { path: '/bookmarks', label: 'Bookmarks' },
    { path: '/archive', label: 'Archive' },
  ];

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!feedUrl.trim()) {
      setError('Please enter a feed URL');
      return;
    }

    setIsAddingFeed(true);
    let newFeed: Feed | null = null;
    try {
      // Validate URL
      new URL(feedUrl.trim());

      // Normalize the URL (convert Medium/Substack URLs to RSS feeds)
      const { normalizeFeedUrl, fetchRss } = await import('../utils/rss');
      const normalizedUrl = normalizeFeedUrl(feedUrl.trim());

      // Create feed with a temporary name (will be updated after fetching)
      newFeed = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: 'Loading...',
        url: normalizedUrl,
        sourceType: 'rss',
        rssTitle: undefined, // Will be set after fetching
      };

      storage.addFeed(newFeed);
      onFeedsChange();

      // Fetch the feed to get its name and items
      console.log('Adding new feed:', newFeed.url);

      // fetchRss now returns { items, feedTitle } with deduplication, sorting, and limiting to 5
      const existingItems = storage.getFeedItems();
      const { items: newItems, feedTitle: actualFeedTitle } = await fetchRss(normalizedUrl, existingItems);

      // Update feed name and rssTitle with actual RSS feed title
      if (newFeed) {
        const updatedFeeds = storage.getFeeds();
        const feedIndex = updatedFeeds.findIndex(f => f.id === newFeed!.id);
        if (feedIndex !== -1) {
          updatedFeeds[feedIndex].name = actualFeedTitle;
          updatedFeeds[feedIndex].rssTitle = actualFeedTitle; // Store original RSS title for matching
          storage.saveFeeds(updatedFeeds);
          onFeedsChange();
        }

        if (newItems.length > 0) {
          console.log(`Adding feed ${newFeed.url}: got ${newItems.length} new items after deduplication`);
          const allItems = [...existingItems, ...newItems];
          storage.saveFeedItems(allItems);
          window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
        } else {
          console.log(`Adding feed ${newFeed.url}: no new items`);
          // If no items were returned, it could mean the feed failed to load
          // Check if this was a new feed (no items exist with this source)
          const hasItemsFromFeed = existingItems.some(item => item.source === actualFeedTitle);
          if (!hasItemsFromFeed) {
            setError('No items found. This might not be a valid RSS feed URL. Please check the URL and try again.');
            // Remove the feed since it failed to load
            storage.removeFeed(newFeed.id);
            onFeedsChange();
            return;
          }
        }
      }

      setFeedUrl('');
    } catch (err) {
      // Remove the feed that was just added since it failed
      if (newFeed) {
        const updatedFeeds = storage.getFeeds();
        const feedIndex = updatedFeeds.findIndex(f => f.id === newFeed!.id);
        if (feedIndex !== -1) {
          storage.removeFeed(newFeed.id);
          onFeedsChange();
        }
      }

      if (err instanceof Error && err.message.includes('already exists')) {
        setError('This feed is already added');
      } else if (err instanceof TypeError) {
        setError('Please enter a valid URL');
      } else if (err instanceof Error) {
        // Use the error message from fetchRss which provides helpful context
        setError(err.message);
      } else {
        setError('Failed to add feed. Please check the URL and try again.');
      }
      console.error('Error adding feed:', err);
    } finally {
      setIsAddingFeed(false);
    }
  };

  const handleRemoveFeed = (feedId: string) => {
    if (confirm('Are you sure you want to remove this feed? Items in Inbox and Archive will be deleted. Saved and Bookmarked items will be kept.')) {
      storage.removeFeed(feedId);
      // Clear selection if the removed feed was selected
      if (selectedFeedId === feedId) {
        onFeedSelect(null);
      }
      onFeedsChange();
      // Trigger event to update feed lists
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    }
  };

  const handleStartRename = (feed: Feed) => {
    setEditingFeedId(feed.id);
    setEditFeedName(feed.name);
  };

  const handleCancelRename = () => {
    setEditingFeedId(null);
    setEditFeedName('');
  };

  const handleSaveRename = (feedId: string) => {
    if (editFeedName.trim()) {
      storage.updateFeedName(feedId, editFeedName);
      onFeedsChange();
    }
    handleCancelRename();
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, feedId: string) => {
    if (e.key === 'Enter') {
      handleSaveRename(feedId);
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshFeeds();
    } catch (err) {
      console.error('Error refreshing feeds:', err);
      setError('Failed to refresh feeds. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

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

  // State to trigger recalculation when items update
  const [itemsUpdateTrigger, setItemsUpdateTrigger] = useState(0);

  // Listen for feed items updates to refresh counts
  useEffect(() => {
    const handleItemsUpdate = () => {
      setItemsUpdateTrigger(prev => prev + 1);
    };
    window.addEventListener('feedItemsUpdated', handleItemsUpdate);
    return () => window.removeEventListener('feedItemsUpdated', handleItemsUpdate);
  }, []);

  // Calculate inbox counts for each feed (always shown, regardless of current view)
  const feedInboxCounts = useMemo(() => {
    const inboxItems = storage.getFeedItems().filter((item: FeedItem) => item.status === 'inbox');
    const counts: Record<string, number> = {};

    feeds.forEach((feed) => {
      const feedHostname = normalizeHostname(feed.url);
      let count = 0;

      inboxItems.forEach((item: FeedItem) => {
        // Match by source field (item.source) to rssTitle - most reliable
        if (feed.rssTitle && item.source === feed.rssTitle) {
          count++;
          return;
        }

        // Fallback: If rssTitle is not set, try matching by name
        if (!feed.rssTitle && item.source === feed.name) {
          count++;
          return;
        }

        // For Medium feeds, check URL path matching
        if (feedHostname === 'medium.com') {
          try {
            const feedUrl = new URL(feed.url);
            const feedPath = feedUrl.pathname.toLowerCase();
            if (feedPath.includes('/feed/')) {
              const authorPart = feedPath.split('/feed/')[1];
              if (authorPart) {
                const itemUrl = new URL(item.url);
                if (itemUrl.pathname.toLowerCase().includes(authorPart)) {
                  count++;
                  return;
                }
              }
            }
          } catch {
            // Continue to next check
          }
        }

        // Fallback to hostname matching for other feeds
        const itemHostname = normalizeHostname(item.url);
        if (feedHostname && itemHostname && feedHostname === itemHostname) {
          count++;
        }
      });

      counts[feed.id] = count;
    });

    return counts;
  }, [feeds, itemsUpdateTrigger]);

  if (isCollapsed) {
    return null;
  }

  return (
    <div 
      className="w-64 border-r h-screen flex flex-col"
      style={{ 
        backgroundColor: 'var(--theme-card-bg)', 
        borderColor: 'var(--theme-border)',
        color: 'var(--theme-text)'
      }}
    >
      <div 
        className="p-8 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--theme-border)' }}
      >
        <h1 
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--theme-text)' }}
        >
          The Signal
        </h1>
        <button
          onClick={onToggle}
          className="group/toggle relative p-2 rounded transition-colors"
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
            Hide sidebar
          </span>
        </button>
      </div>

      <nav className="flex-1 p-6 space-y-1 overflow-y-auto">
        <div className="mb-8">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="block px-3 py-2 text-sm font-medium transition-colors rounded"
              style={{
                backgroundColor: location.pathname === item.path ? 'var(--theme-hover-bg)' : 'transparent',
                color: location.pathname === item.path ? 'var(--theme-text)' : 'var(--theme-text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (location.pathname !== item.path) {
                  e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  e.currentTarget.style.color = 'var(--theme-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (location.pathname !== item.path) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--theme-text-secondary)';
                }
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div 
          className="border-t pt-6"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              Feeds
            </h2>
            <button
              onClick={handleRefreshAll}
              disabled={isRefreshing || feeds.length === 0}
              className="text-xs disabled:cursor-not-allowed transition-colors"
              style={{
                color: isRefreshing || feeds.length === 0 ? 'var(--theme-text-muted)' : 'var(--theme-text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isRefreshing && feeds.length > 0) {
                  e.currentTarget.style.color = 'var(--theme-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRefreshing && feeds.length > 0) {
                  e.currentTarget.style.color = 'var(--theme-text-secondary)';
                }
              }}
              title="Refresh all feeds"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <form onSubmit={handleAddFeed} className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={feedUrl}
                onChange={(e) => {
                  setFeedUrl(e.target.value);
                  setError(null);
                }}
                placeholder="RSS feed URL"
                className="flex-1 px-2 py-1.5 text-xs border focus:outline-none focus:ring-1 transition-colors"
                style={{
                  borderColor: 'var(--theme-border)',
                  backgroundColor: 'var(--theme-card-bg)',
                  color: 'var(--theme-text)',
                }}
                disabled={isAddingFeed}
              />
              <button
                type="submit"
                disabled={isAddingFeed}
                className="px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed transition-colors"
                style={{
                  backgroundColor: 'var(--theme-accent)',
                }}
                onMouseEnter={(e) => {
                  if (!isAddingFeed) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAddingFeed) {
                    e.currentTarget.style.opacity = '1';
                  }
                }}
              >
                {isAddingFeed ? '...' : 'Add'}
              </button>
            </div>
            {error && (
              <p className="mt-1 text-xs text-red-600">{error}</p>
            )}
          </form>

          <div className="space-y-1">
            {feeds.length === 0 ? (
              <p 
                className="px-3 py-2 text-xs"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                No feeds added yet
              </p>
            ) : (
              feeds.map((feed) => (
                <div
                  key={feed.id}
                  className="group w-full px-3 py-2 text-sm rounded transition-colors"
                  style={{
                    color: 'var(--theme-text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {editingFeedId === feed.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editFeedName}
                        onChange={(e) => setEditFeedName(e.target.value)}
                        onBlur={() => handleSaveRename(feed.id)}
                        onKeyDown={(e) => handleRenameKeyDown(e, feed.id)}
                        className="flex-1 px-1 py-0.5 text-sm border focus:outline-none focus:ring-1 transition-colors"
                        style={{
                          borderColor: 'var(--theme-border)',
                          backgroundColor: 'var(--theme-card-bg)',
                          color: 'var(--theme-text)',
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={() => handleSaveRename(feed.id)}
                        className="text-gray-500 hover:text-black transition-colors"
                        title="Save"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancelRename}
                        className="text-gray-500 hover:text-black transition-colors"
                        title="Cancel"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 w-full min-w-0 relative">
                      <span 
                        className={`flex-1 truncate min-w-0 ${
                          selectedFeedId === feed.id ? 'font-medium' : ''
                        }`}
                        style={{
                          color: selectedFeedId === feed.id ? 'var(--theme-text)' : 'var(--theme-text-secondary)',
                          cursor: 'pointer',
                        }}
                        title={feed.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Toggle selection - if already selected, deselect
                          onFeedSelect(selectedFeedId === feed.id ? null : feed.id);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(feed);
                        }}
                      >
                        {feed.name}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 absolute right-0">
                        {feedInboxCounts[feed.id] !== undefined && (
                          <span 
                            className="text-xs group-hover:hidden whitespace-nowrap"
                            style={{ color: 'var(--theme-text-muted)', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Toggle selection - if already selected, deselect
                              onFeedSelect(selectedFeedId === feed.id ? null : feed.id);
                            }}
                          >
                            ({feedInboxCounts[feed.id]})
                          </span>
                        )}
                        <div className="hidden group-hover:flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRename(feed);
                            }}
                            className="transition-colors p-1"
                            style={{ color: 'var(--theme-text-muted)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--theme-text-secondary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--theme-text-muted)';
                            }}
                            title="Rename feed"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFeed(feed.id);
                            }}
                            className="transition-colors p-1 text-lg leading-none"
                            style={{ color: 'var(--theme-text-muted)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#dc2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--theme-text-muted)';
                            }}
                            title="Remove feed"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </nav>
      
      <div className="p-6">
        <ThemeToggle />
      </div>
    </div>
  );
}
