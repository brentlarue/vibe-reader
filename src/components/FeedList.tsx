import { FeedItem, Feed } from '../types';
import FeedItemCard from './FeedItemCard';
import { useState, useEffect, useCallback, useRef } from 'react';
import { storage } from '../utils/storage';
import { useLocation } from 'react-router-dom';

interface FeedListProps {
  status: FeedItem['status'];
  selectedFeedId: string | null;
  feeds: Feed[];
}

type SortOrder = 'newest' | 'oldest';

export default function FeedList({ status, selectedFeedId, feeds }: FeedListProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const location = useLocation();
  const scrollKey = `scrollPosition_${status}_${selectedFeedId || 'all'}`;
  const hasRestoredScroll = useRef(false);

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

  const loadItems = useCallback(async () => {
    const allItems = await storage.getFeedItems();
    let filtered = allItems.filter((item) => item.status === status);
    
    // Filter by selected feed if one is selected
    if (selectedFeedId) {
      const selectedFeed = feeds.find(f => f.id === selectedFeedId);
      if (selectedFeed) {
        const feedHostname = normalizeHostname(selectedFeed.url);
        
        filtered = filtered.filter((item) => {
          // Try multiple matching strategies:
          // 1. Match by source field (item.source) to rssTitle - most reliable
          //    rssTitle is the original RSS feed title that matches item.source and never changes
          //    This works even after the user renames the feed
          if (selectedFeed.rssTitle && item.source === selectedFeed.rssTitle) {
            return true;
          }
          
          // 1b. Fallback: If rssTitle is not set (for old feeds), try matching by name
          //    This handles backwards compatibility with feeds added before rssTitle was introduced
          if (!selectedFeed.rssTitle && item.source === selectedFeed.name) {
            return true;
          }
          
          // 2. For Medium feeds, items might be cross-posted to different domains
          //    Check if the feed URL path matches the item URL path
          if (feedHostname === 'medium.com') {
            try {
              const feedUrl = new URL(selectedFeed.url);
              const feedPath = feedUrl.pathname.toLowerCase();
              // Extract author from feed path (e.g., /feed/@101)
              if (feedPath.includes('/feed/')) {
                const authorPart = feedPath.split('/feed/')[1];
                if (authorPart) {
                  // Check if item URL contains this author identifier
                  const itemUrl = new URL(item.url);
                  if (itemUrl.pathname.toLowerCase().includes(authorPart)) {
                    return true;
                  }
                }
              }
            } catch {
              // If URL parsing fails, continue to next check
            }
          }
          
          // 3. Fallback to hostname matching for other feeds
          const itemHostname = normalizeHostname(item.url);
          return feedHostname && itemHostname && feedHostname === itemHostname;
        });
      }
    }
    
    // Sort items by published date
    filtered.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    
    setItems(filtered);
  }, [status, sortOrder, selectedFeedId, feeds]);

  useEffect(() => {
    loadItems();
    // Reset scroll restoration flag when view changes
    hasRestoredScroll.current = false;

    // Listen for feed items updates
    const handleItemsUpdate = () => {
      loadItems();
    };
    window.addEventListener('feedItemsUpdated', handleItemsUpdate);

    return () => {
      window.removeEventListener('feedItemsUpdated', handleItemsUpdate);
    };
  }, [loadItems, status, selectedFeedId]);

  // Save scroll position before navigating away
  useEffect(() => {
    const findScrollContainer = (): HTMLElement | null => {
      // Find the main element which is the scroll container
      const main = document.querySelector('main');
      return main;
    };

    const handleScroll = () => {
      const scrollContainer = findScrollContainer();
      if (scrollContainer) {
        const scrollPosition = scrollContainer.scrollTop;
        sessionStorage.setItem(scrollKey, scrollPosition.toString());
      }
    };

    const scrollContainer = findScrollContainer();
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
      };
    }
  }, [scrollKey]);

  // Restore scroll position when returning to this view
  useEffect(() => {
    // Only restore once when items are loaded and we're on a list page (not article page)
    if (location.pathname.startsWith('/article')) {
      hasRestoredScroll.current = false;
      return;
    }

    const savedScroll = sessionStorage.getItem(scrollKey);
    if (savedScroll && items.length > 0 && !hasRestoredScroll.current) {
      const findScrollContainer = (): HTMLElement | null => {
        const main = document.querySelector('main');
        return main;
      };

      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          const scrollContainer = findScrollContainer();
          if (scrollContainer) {
            scrollContainer.scrollTop = parseInt(savedScroll, 10);
            hasRestoredScroll.current = true;
          }
        }, 50);
      });
    }
  }, [location.pathname, scrollKey, items.length]);

  const handleStatusChange = () => {
    loadItems();
  };

  const handleDeleteAll = async () => {
    if (status === 'archived') {
      if (confirm('Are you sure you want to delete all archived items? This action cannot be undone.')) {
        try {
          await storage.deleteItemsByStatus('archived');
          loadItems();
          window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
        } catch (error) {
          console.error('Error deleting archived items:', error);
        }
      }
    }
  };

  const getStatusLabel = (status: FeedItem['status']) => {
    switch (status) {
      case 'inbox':
        return 'Inbox';
      case 'saved':
        return 'Later';
      case 'bookmarked':
        return 'Bookmarks';
      case 'archived':
        return 'Archive';
      default:
        return status;
    }
  };

  if (items.length === 0) {
    const selectedFeed = selectedFeedId ? feeds.find(f => f.id === selectedFeedId) : null;
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--theme-text-muted)' }}>
        <div className="text-center">
          <p className="text-lg mb-2 font-medium" style={{ color: 'var(--theme-text)' }}>No items found</p>
          <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
            {selectedFeed 
              ? `No items from "${selectedFeed.name}" with status "${getStatusLabel(status)}"`
              : `Items with status "${getStatusLabel(status)}" will appear here`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex flex-row items-center justify-end gap-4 mb-6" style={{ marginTop: '0', paddingTop: '0' }}>
        {status === 'archived' && items.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="text-xs sm:text-sm border px-3 py-1.5 transition-colors focus:outline-none touch-manipulation"
            style={{
              borderColor: 'var(--theme-border)',
              backgroundColor: 'transparent',
              color: 'var(--theme-text)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
              e.currentTarget.style.color = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-border)';
              e.currentTarget.style.color = 'var(--theme-text)';
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-accent)';
              e.currentTarget.style.outline = '1px solid var(--theme-accent)';
              e.currentTarget.style.outlineOffset = '-1px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-border)';
              e.currentTarget.style.outline = 'none';
            }}
          >
            Delete all
          </button>
        )}
        <div className="flex items-center gap-2" style={{ marginTop: '0' }}>
          <label htmlFor="sort-order" className="text-xs sm:text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
            Sort:
          </label>
          <div className="relative">
            <select
              id="sort-order"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="text-xs sm:text-sm border pl-2 pr-6 py-2 sm:py-1.5 transition-colors appearance-none focus:outline-none touch-manipulation"
              style={{
                borderColor: 'var(--theme-border)',
                backgroundColor: 'transparent',
                color: 'var(--theme-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-accent)';
                e.currentTarget.style.outline = '1px solid var(--theme-accent)';
                e.currentTarget.style.outlineOffset = '-1px';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.outline = 'none';
              }}
            >
              <option value="newest" style={{ backgroundColor: 'var(--theme-card-bg)', color: 'var(--theme-text)' }}>Newest first</option>
              <option value="oldest" style={{ backgroundColor: 'var(--theme-card-bg)', color: 'var(--theme-text)' }}>Oldest first</option>
            </select>
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      {items.map((item) => (
        <FeedItemCard
          key={item.id}
          item={item}
          onStatusChange={handleStatusChange}
          scrollKey={scrollKey}
        />
      ))}
    </div>
  );
}
