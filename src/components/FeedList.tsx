import { FeedItem, Feed } from '../types';
import FeedItemCard from './FeedItemCard';
import PullToRefresh from './PullToRefresh';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { storage } from '../utils/storage';
import { useLocation } from 'react-router-dom';
import { itemBelongsToFeed } from '../utils/feedMatching';
import { fetchOlderRss } from '../utils/rss';
import { apiFetch } from '../utils/apiFetch';

interface FeedListProps {
  status: FeedItem['status'];
  selectedFeedId: string | null;
  feeds: Feed[];
  onRefresh?: () => Promise<void>;
}

type SortOrder = 'newest' | 'oldest' | 'longest' | 'shortest';

// Helper function to calculate word count from article content
const getWordCount = (item: FeedItem): number => {
  const content = item.fullContent || item.contentSnippet || '';
  // Strip HTML tags and get plain text
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  // Count words (split by whitespace and filter out empty strings)
  return text.split(/\s+/).filter(word => word.length > 0).length;
};

export default function FeedList({ status, selectedFeedId, feeds, onRefresh }: FeedListProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [readingOrderFilter, setReadingOrderFilter] = useState<'all' | 'next' | 'later' | 'someday'>('all');
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const location = useLocation();
  const scrollKey = `scrollPosition_${status}_${selectedFeedId || 'all'}`;
  const hasRestoredScroll = useRef(false);

  const loadItems = useCallback(async () => {
    // ✅ Use server-side filtering - only fetch items with matching status
    const filtered = await storage.getFeedItems({
      status,
      feedId: selectedFeedId || undefined,
    });
    
    // If server-side feedId filtering isn't available, filter client-side for selected feed
    let finalItems = filtered;
    if (selectedFeedId && filtered.length > 0) {
      const selectedFeed = feeds.find(f => f.id === selectedFeedId);
      if (selectedFeed) {
        // Double-check with itemBelongsToFeed in case feedId matching isn't perfect
        finalItems = filtered.filter((item) => {
          // If item has feedId, use that for fast matching
          if (item.feedId && item.feedId === selectedFeed.id) return true;
          // Otherwise use itemBelongsToFeed for legacy items
          return itemBelongsToFeed(item, selectedFeed);
        });
      }
    }
    
    // Sort items based on sort order
    // ✅ Pre-compute word counts once for all items before sorting (performance optimization)
    const wordCountMap = new Map<string, number>();
    if (sortOrder === 'longest' || sortOrder === 'shortest') {
      finalItems.forEach(item => {
        const content = item.fullContent || item.contentSnippet || '';
        const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        wordCountMap.set(item.id, text.split(/\s+/).filter(word => word.length > 0).length);
      });
    }

    const sorted = [...finalItems].sort((a, b) => {
      if (sortOrder === 'newest' || sortOrder === 'oldest') {
        // Sort by published date
        const dateA = new Date(a.publishedAt).getTime();
        const dateB = new Date(b.publishedAt).getTime();
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      } else {
        // ✅ Use pre-computed word counts from map (much faster than recalculating)
        const wordCountA = wordCountMap.get(a.id) || 0;
        const wordCountB = wordCountMap.get(b.id) || 0;
        return sortOrder === 'longest' ? wordCountB - wordCountA : wordCountA - wordCountB;
      }
    });
    
    setItems(sorted);
    setHasAttemptedLoad(true);
  }, [status, sortOrder, selectedFeedId, feeds]);

  useEffect(() => {
    // Don't clear items immediately - keep them visible while loading new data
    // Only clear load state so we know we're fetching
    setHasAttemptedLoad(false);
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

  const handleFetchOlder = async () => {
    if (!selectedFeedId) return;
    
    const selectedFeed = feeds.find(f => f.id === selectedFeedId);
    if (!selectedFeed) return;

    setIsLoadingOlder(true);
    try {
      // Handle custom feeds (like NeverEnough) differently
      if (selectedFeed.sourceType === 'custom') {
        // Call the custom feed's load-older endpoint
        // Extract the feed identifier from the URL (e.g., /api/custom-feeds/neverenough/rss.xml -> neverenough)
        const feedUrlMatch = selectedFeed.url.match(/\/api\/custom-feeds\/([^/]+)\//);
        if (!feedUrlMatch) {
          throw new Error('Invalid custom feed URL');
        }
        const feedSlug = feedUrlMatch[1];
        
        const response = await apiFetch(`/api/custom-feeds/${feedSlug}/load-older`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to load older items');
        }
        
        const result = await response.json();
        
        if (result.newItems > 0) {
          // Refresh the items list - items are already stored by the server
          loadItems();
          window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
        } else {
          alert(result.message || 'No older posts found. You may have reached the end of the archive.');
        }
      } else {
        // Regular RSS feed - use the existing logic
        // Get all existing items (all statuses) to check against
        // This ensures we can find the oldest item even if current view is empty
        const allExistingItems = await storage.getFeedItems();
        
        // Fetch 5 older posts
        const { items: olderItems, feedTitle } = await fetchOlderRss(
          selectedFeed.url,
          allExistingItems,
          selectedFeed.rssTitle
        );

        if (olderItems.length > 0) {
          // Upsert the older items
          await storage.upsertFeedItems(selectedFeedId, olderItems.map(item => ({
            ...item,
            source: feedTitle,
          })));
          
          // Refresh the items list
          loadItems();
          window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
        } else {
          alert('No older posts found. You may have reached the end of the feed.');
        }
      }
    } catch (error) {
      console.error('Error fetching older posts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch older posts';
      if (errorMessage.includes('No existing items')) {
        alert('Cannot fetch older posts: No items found for this feed. Please refresh the feed first.');
      } else {
        alert(errorMessage);
      }
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Check if we should show the "Get 5 older posts" button
  // Only show when:
  // 1. Status is 'inbox'
  // 2. A feed is selected
  // 3. The feed has at least one item (in any status) - we need this to determine "oldest"
  const shouldShowFetchOlder = status === 'inbox' && selectedFeedId;
  
  // Check if the selected feed has any items (all statuses) to determine if we can fetch older
  const [canFetchOlder, setCanFetchOlder] = useState(false);
  useEffect(() => {
    const checkCanFetchOlder = async () => {
      if (!selectedFeedId || !shouldShowFetchOlder) {
        setCanFetchOlder(false);
        return;
      }
      
      const selectedFeed = feeds.find(f => f.id === selectedFeedId);
      if (!selectedFeed) {
        setCanFetchOlder(false);
        return;
      }
      
      // Get all items (all statuses) for this feed
      const allItems = await storage.getFeedItems();
      const feedItems = allItems.filter(item => itemBelongsToFeed(item, selectedFeed));
      
      // Can fetch older if we have at least one item for this feed
      setCanFetchOlder(feedItems.length > 0);
    };
    
    checkCanFetchOlder();
  }, [selectedFeedId, feeds, shouldShowFetchOlder]);

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

  // Handle refresh with item reload
  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
      // Reload items after refresh
      await loadItems();
    }
  }, [onRefresh, loadItems]);

  const getEffectiveReadingOrder = (item: FeedItem): 'next' | 'later' | 'someday' | null => {
    if (item.status !== 'saved') return null;
    if (item.readingOrder === 'next' || item.readingOrder === 'later' || item.readingOrder === 'someday') {
      return item.readingOrder;
    }
    // Default existing saved items without an explicit subcategory to "later"
    return 'later';
  };

  const allItemIds = items.map(i => i.id);

  let displayedItems = items;
  if (status === 'saved' && readingOrderFilter !== 'all') {
    displayedItems = items.filter(item => getEffectiveReadingOrder(item) === readingOrderFilter);
  }

  const groupedByReadingOrder =
    status === 'saved' && readingOrderFilter === 'all'
      ? {
          next: items.filter(item => getEffectiveReadingOrder(item) === 'next'),
          later: items.filter(item => getEffectiveReadingOrder(item) === 'later'),
          someday: items.filter(item => getEffectiveReadingOrder(item) === 'someday'),
        }
      : null;

  // Find the first non-empty reading order group (for adding a top border)
  const firstReadingOrderGroup =
    groupedByReadingOrder
      ? (['next', 'later', 'someday'] as const).find(
          (order) => groupedByReadingOrder[order] && groupedByReadingOrder[order]!.length > 0,
        ) || null
      : null;

  // Only show "no items" message if we've attempted to load and items array is empty
  if (hasAttemptedLoad && items.length === 0) {
    const selectedFeed = selectedFeedId ? feeds.find(f => f.id === selectedFeedId) : null;
    const showFetchOlderButton = shouldShowFetchOlder && canFetchOlder;
    
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <div 
          className="flex items-center justify-center w-full"
          style={{ 
            color: 'var(--theme-text-muted)',
            minHeight: 'calc(100dvh - 8rem)',
          }}
        >
          <div className="text-center">
            <p className="text-lg mb-2 font-medium" style={{ color: 'var(--theme-text)' }}>No items found</p>
            <p className="text-sm mb-6" style={{ color: 'var(--theme-text-muted)' }}>
              {selectedFeed 
                ? `No items from "${selectedFeed.name}" with status "${getStatusLabel(status)}"`
                : `Items with status "${getStatusLabel(status)}" will appear here`}
            </p>
            {showFetchOlderButton && (
              <button
                onClick={handleFetchOlder}
                disabled={isLoadingOlder}
                className="px-4 py-2 text-sm border transition-colors focus:outline-none touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--theme-border)',
                  backgroundColor: isLoadingOlder ? 'var(--theme-border)' : 'transparent',
                  color: 'var(--theme-text)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoadingOlder) {
                    e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoadingOlder) {
                    e.currentTarget.style.borderColor = 'var(--theme-border)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {isLoadingOlder ? 'Loading...' : 'Get 5 older posts'}
              </button>
            )}
          </div>
        </div>
      </PullToRefresh>
    );
  }

  // If we haven't attempted to load yet but have items, show them (optimistic rendering)
  // This prevents the flash when navigating between views
  // Only block rendering if we have no items AND haven't attempted load (true initial state)
  if (!hasAttemptedLoad && items.length === 0) {
    return null;
  }

  return (
  <PullToRefresh onRefresh={handleRefresh}>
      <div className="w-full max-w-3xl mx-auto">
      <div
        className="flex flex-col gap-3 mb-6"
        style={{ marginTop: '0', paddingTop: '0' }}
      >
        {/* First row: page actions (delete, sort) aligned right on all breakpoints */}
        <div className="flex flex-row items-center justify-end gap-4">
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
          <label
            htmlFor="sort-order"
            className="text-xs sm:text-sm sr-only"
          >
            Sort order
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
              <option value="longest" style={{ backgroundColor: 'var(--theme-card-bg)', color: 'var(--theme-text)' }}>Longest first</option>
              <option value="shortest" style={{ backgroundColor: 'var(--theme-card-bg)', color: 'var(--theme-text)' }}>Shortest first</option>
            </select>
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        </div>

        {/* Second row: reading order toggle (Later page only), left-aligned on all breakpoints */}
        {status === 'saved' && (
          <div className="-mx-2 px-2 sm:m-0 sm:px-0 overflow-x-auto">
            <div className="flex items-center gap-2 py-1.5">
              {(['all', 'next', 'later', 'someday'] as const).map((value) => {
                const isActive = readingOrderFilter === value;
                const label =
                  value === 'all'
                    ? 'All'
                    : value === 'next'
                    ? 'Next'
                    : value === 'later'
                    ? 'Later'
                    : 'Someday';
                return (
                  <button
                    key={value}
                    onClick={() => setReadingOrderFilter(value)}
                    className="px-4 py-2 text-sm rounded flex-shrink-0 transition-colors"
                    style={{
                      backgroundColor: isActive ? 'var(--theme-button-bg)' : 'var(--theme-hover-bg)',
                      color: isActive ? 'var(--theme-button-text)' : 'var(--theme-text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {status === 'saved' && readingOrderFilter === 'all' && groupedByReadingOrder ? (
        <>
          {(['next', 'later', 'someday'] as const).map((order) => {
            const groupItems = groupedByReadingOrder[order];
            if (!groupItems || groupItems.length === 0) return null;
            const label =
              order === 'next' ? 'Next' : order === 'later' ? 'Later' : 'Someday';
            const isFirstGroup = order === firstReadingOrderGroup;
            return (
              <div key={order}>
                <h2
                  className={`text-base sm:text-lg leading-relaxed pt-6 pb-6 border-b mb-4 font-bold ${
                    isFirstGroup ? 'border-t' : ''
                  }`}
                  style={{
                    color: 'var(--theme-text-secondary)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  {label}
                </h2>
                {groupItems.map((item) => (
                  <FeedItemCard
                    key={item.id}
                    item={item}
                    onStatusChange={handleStatusChange}
                    scrollKey={scrollKey}
                    allItemIds={allItemIds}
                    itemIndex={items.findIndex((i) => i.id === item.id)}
                    feeds={feeds}
                  />
                ))}
              </div>
            );
          })}
        </>
      ) : (
        displayedItems.map((item) => (
          <FeedItemCard
            key={item.id}
            item={item}
            onStatusChange={handleStatusChange}
            scrollKey={scrollKey}
            allItemIds={allItemIds}
            itemIndex={items.findIndex((i) => i.id === item.id)}
            feeds={feeds}
          />
        ))
      )}
      
      {/* Show "Get 5 older posts" button after last item when feed is selected and status is inbox */}
      {shouldShowFetchOlder && items.length > 0 && canFetchOlder && (
        <div className="flex justify-center mt-8 mb-4">
          <button
            onClick={handleFetchOlder}
            disabled={isLoadingOlder}
            className="px-4 py-2 text-sm border transition-colors focus:outline-none touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              borderColor: 'var(--theme-border)',
              backgroundColor: isLoadingOlder ? 'var(--theme-border)' : 'transparent',
              color: 'var(--theme-text)',
            }}
            onMouseEnter={(e) => {
              if (!isLoadingOlder) {
                e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoadingOlder) {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            {isLoadingOlder ? 'Loading...' : 'Get 5 older posts'}
          </button>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
