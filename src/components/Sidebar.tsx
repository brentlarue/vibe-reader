import { Link, useLocation } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { Feed, FeedItem } from '../types';
import { storage } from '../utils/storage';
import SettingsMenu from './SettingsMenu';
import AddModal from './AddModal';
import { useTheme } from '../contexts/ThemeContext';
import { itemBelongsToFeed } from '../utils/feedMatching';
import { apiFetch } from '../utils/apiFetch';

interface SidebarProps {
  feeds: Feed[];
  selectedFeedId: string | null;
  onFeedsChange: () => void;
  onRefreshFeeds: () => Promise<void>;
  onFeedSelect: (feedId: string | null) => void;
  onToggle: () => void;
  onCloseMobileDrawer?: () => void;
  isMobileDrawerOpen?: boolean;
}

export default function Sidebar({ feeds, selectedFeedId, onFeedsChange, onRefreshFeeds, onFeedSelect, onToggle, onCloseMobileDrawer, isMobileDrawerOpen }: SidebarProps) {
  const location = useLocation();
  const { theme } = useTheme();
  
  // Detect if we're in dev environment (localhost or dev domain)
  const isDev = useMemo(() => {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local') || hostname.includes('dev');
  }, []);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editFeedName, setEditFeedName] = useState('');
  

  const handleNavClick = () => {
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  const navItems = [
    { path: '/inbox', label: 'Inbox' },
    { path: '/saved', label: 'Later' },
    { path: '/bookmarks', label: 'Bookmarks' },
    { path: '/notes', label: 'Notes' },
    { path: '/archive', label: 'Archive' },
  ];

  const handleAddFeed = async (feedUrl: string) => {
    let newFeed: Feed | null = null;
    try {
      // Normalize the URL (convert Medium/Substack URLs to RSS feeds)
      const { normalizeFeedUrl, fetchRss } = await import('../utils/rss');
      const normalizedUrl = normalizeFeedUrl(feedUrl.trim());

      // Fetch the feed first to get its title and items
      console.log('Fetching feed to validate:', normalizedUrl);
      const existingItems = await storage.getFeedItems();
      // No rssTitle yet for new feeds, pass undefined - will match by feedTitle after fetch
      const { items: newItems, feedTitle: actualFeedTitle } = await fetchRss(normalizedUrl, existingItems, undefined);

      // Create feed with the actual title from RSS
      try {
        newFeed = await storage.addFeed({
          url: normalizedUrl,
          displayName: actualFeedTitle,
          rssTitle: actualFeedTitle,
          sourceType: 'rss',
        });
        onFeedsChange();
      } catch (addError) {
        if (addError instanceof Error && addError.message.includes('already exists')) {
          throw new Error('This feed is already added');
        }
        throw addError;
      }

      // Save the new items
      if (newFeed && newItems.length > 0) {
        console.log(`Adding feed ${newFeed.url}: got ${newItems.length} new items`);
        
        // Use the new upsert API to save items with feedId
        await storage.upsertFeedItems(newFeed.id, newItems.map(item => ({
          ...item,
          source: actualFeedTitle,
        })));
        
        window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
      } else if (newItems.length === 0) {
        console.log(`Adding feed ${normalizedUrl}: no items found`);
        // Check if this is a valid feed with no new items, or an invalid feed
        const hasItemsFromFeed = existingItems.some(item => item.source === actualFeedTitle);
        if (!hasItemsFromFeed && newFeed) {
          await storage.removeFeed(newFeed.id);
          onFeedsChange();
          throw new Error('No items found. This might not be a valid RSS feed URL.');
        }
      }
    } catch (err) {
      // Remove the feed that was just added since it failed
      if (newFeed) {
        try {
          await storage.removeFeed(newFeed.id);
          onFeedsChange();
        } catch (error) {
          console.error('Error removing failed feed:', error);
        }
      }

      if (err instanceof Error && err.message.includes('already exists')) {
        throw new Error('This feed is already added');
      } else if (err instanceof TypeError) {
        throw new Error('Please enter a valid URL');
      } else if (err instanceof Error) {
        throw err;
      } else {
        throw new Error('Failed to add feed. Please check the URL and try again.');
      }
    }
  };

  const handleAddArticle = async (articleUrl: string) => {
    try {
      const response = await apiFetch('/api/ingest/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: articleUrl }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to add article (${response.status})`);
      }

      // Trigger refresh of feed lists
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Failed to add article. Please try again.');
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

  const handleSaveRename = async (feedId: string) => {
    if (editFeedName.trim()) {
      await storage.updateFeedName(feedId, editFeedName.trim());
      onFeedsChange();
      // Trigger refresh of item lists to show updated source name
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
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

  // State to store inbox items for counting
  const [inboxItems, setInboxItems] = useState<FeedItem[]>([]);

  // Load inbox items for feed counts
  useEffect(() => {
    const loadInboxItems = async () => {
      try {
        const allItems = await storage.getFeedItems();
        const inbox = allItems.filter(item => item.status === 'inbox');
        setInboxItems(inbox);
      } catch (error) {
        console.error('Error loading inbox items for counts:', error);
      }
    };
    loadInboxItems();
  }, []);

  // Listen for feed items updates to refresh counts
  useEffect(() => {
    const handleItemsUpdate = async () => {
      try {
        const allItems = await storage.getFeedItems();
        const inbox = allItems.filter(item => item.status === 'inbox');
        setInboxItems(inbox);
      } catch (error) {
        console.error('Error refreshing inbox items:', error);
      }
    };
    window.addEventListener('feedItemsUpdated', handleItemsUpdate);
    return () => window.removeEventListener('feedItemsUpdated', handleItemsUpdate);
  }, []);

  // Calculate inbox counts for each feed (always shown, regardless of current view)
  const feedInboxCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    feeds.forEach((feed) => {
      let count = 0;

      inboxItems.forEach((item: FeedItem) => {
        if (itemBelongsToFeed(item, feed)) {
          count++;
        }
      });

      counts[feed.id] = count;
    });

    return counts;
  }, [feeds, inboxItems, itemBelongsToFeed]);

  // Filter out link-type pseudo-feed and sort alphabetically by name (A-Z)
  const sortedFeeds = useMemo(() => {
    return [...feeds]
      .filter(f => f.sourceType !== 'link')
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [feeds]);

  // Note: isCollapsed is handled in AppContent - sidebar is hidden via CSS on desktop
  // On mobile, drawer state is controlled by isMobileDrawerOpen

  return (
    <div 
      className="border-r flex flex-col relative bg-white lg:bg-transparent flex-shrink-0"
      style={{ 
        backgroundColor: 'var(--theme-card-bg)', 
        borderColor: 'var(--theme-border)',
        color: 'var(--theme-text)',
        width: '16rem', // Previous width
        maxWidth: '85vw',
        height: '100dvh', // Use dynamic viewport height for iOS
        minHeight: '-webkit-fill-available', // Fallback for older iOS
      }}
    >
      <div 
        className="px-6 py-4 sm:p-6 lg:p-8 border-b flex items-center justify-between relative"
        style={{ borderColor: 'var(--theme-border)' }}
      >
        <Link
          to="/inbox"
          onClick={() => {
            // Clear feed selection
            onFeedSelect(null);
            // Close mobile drawer if open
            handleNavClick();
            // Clear any saved scroll positions for inbox (all feed variations)
            sessionStorage.removeItem('scrollPosition_inbox_all');
            sessionStorage.removeItem('scrollPosition_inbox_null');
            // Clear all inbox scroll positions (in case there are feed-specific ones)
            Object.keys(sessionStorage).forEach(key => {
              if (key.startsWith('scrollPosition_inbox_')) {
                sessionStorage.removeItem(key);
              }
            });
            // Immediately scroll to top (before navigation)
            const main = document.querySelector('main');
            if (main) {
              main.scrollTop = 0;
            }
            // Also scroll to top after navigation completes
            setTimeout(() => {
              const mainAfterNav = document.querySelector('main');
              if (mainAfterNav) {
                mainAfterNav.scrollTop = 0;
                mainAfterNav.scrollTo({ top: 0, behavior: 'instant' });
              }
            }, 0);
          }}
          className="text-xl sm:text-2xl font-semibold tracking-tight cursor-pointer flex items-center gap-1 flex-1 min-w-0 whitespace-nowrap"
          style={{ color: 'var(--theme-text)' }}
        >
          <span className="flex-shrink-0">The Signal</span>
          {isDev && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded flex-shrink-0"
              style={{
                backgroundColor: 'var(--theme-button-bg)',
                color: 'var(--theme-button-text)',
                lineHeight: '1.2',
              }}
            >
              Dev
            </span>
          )}
        </Link>
        {/* Mobile sidebar close button - visible when drawer is open */}
        {isMobileDrawerOpen && (
          <button
            onClick={onCloseMobileDrawer}
            className="lg:hidden p-2 rounded transition-colors ml-1 flex-shrink-0 touch-manipulation"
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
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="1" strokeWidth="2" />
              <line x1="9" y1="3" x2="9" y2="21" strokeWidth="2" />
            </svg>
          </button>
        )}
        {/* Desktop sidebar toggle - hidden on mobile */}
        <button
          onClick={onToggle}
          className="hidden lg:block group/toggle relative p-2 rounded transition-colors ml-1 flex-shrink-0"
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

      <nav className="flex-1 p-4 sm:p-6 space-y-1 overflow-y-auto overscroll-contain">
        <div className="mb-6 sm:mb-8">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className="block px-3 py-3 sm:py-2 text-sm font-medium transition-colors rounded touch-manipulation"
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
              onClick={() => setIsAddModalOpen(true)}
              className="p-1 transition-colors touch-manipulation"
              style={{ color: 'var(--theme-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--theme-text)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-muted)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Add"
              aria-label="Add feed or article"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="space-y-1">
            {sortedFeeds.length === 0 ? (
              <p 
                className="px-3 py-2 text-xs"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                No feeds added yet
              </p>
            ) : (
              sortedFeeds.map((feed) => (
                <div
                  key={feed.id}
                  className="group w-full px-3 py-2 text-sm rounded transition-colors"
                  style={{
                    color: 'var(--theme-text-secondary)',
                    backgroundColor: selectedFeedId === feed.id ? 'var(--theme-hover-bg)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = selectedFeedId === feed.id ? 'var(--theme-hover-bg)' : 'transparent';
                  }}
                >
                  {editingFeedId === feed.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editFeedName}
                        onChange={(e) => setEditFeedName(e.target.value)}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--theme-border)';
                          e.currentTarget.style.outline = 'none';
                          handleSaveRename(feed.id);
                        }}
                        onKeyDown={(e) => handleRenameKeyDown(e, feed.id)}
                        className={`flex-1 px-1 py-0.5 text-sm border focus:outline-none transition-colors ${
                          theme === 'light' ? 'placeholder:text-gray-400' :
                          theme === 'dark' ? 'placeholder:text-gray-400' :
                          theme === 'sepia' ? 'placeholder:[color:#8B7355]' :
                          theme === 'hn' ? 'placeholder:[color:#999999]' :
                          'placeholder:text-gray-400'
                        }`}
                        style={{
                          borderColor: 'var(--theme-border)',
                          backgroundColor: 'var(--theme-card-bg)',
                          color: 'var(--theme-text)',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--theme-accent)';
                          e.currentTarget.style.outline = '1px solid var(--theme-accent)';
                          e.currentTarget.style.outlineOffset = '-1px';
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={() => handleSaveRename(feed.id)}
                        className="transition-colors"
                        style={{ color: 'var(--theme-text-muted)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--theme-text)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--theme-text-muted)';
                        }}
                        title="Save"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancelRename}
                        className="transition-colors"
                        style={{ color: 'var(--theme-text-muted)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--theme-text)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--theme-text-muted)';
                        }}
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
                        title={feed.url.replace(/^https?:\/\//, '')}
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
                        {feedInboxCounts[feed.id] !== undefined && feedInboxCounts[feed.id] > 0 && (
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
      
      <div 
        className="mt-auto pb-6"
        style={{ 
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--theme-border)',
        }}
      >
        <div className="px-4 sm:px-6 pt-4">
          <SettingsMenu onRefreshFeeds={onRefreshFeeds} feeds={feeds} />
        </div>
      </div>

      {/* Add Modal */}
      <AddModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddFeed={handleAddFeed}
        onAddArticle={handleAddArticle}
      />
    </div>
  );
}


