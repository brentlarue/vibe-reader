import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { FeedItem } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { storage } from '../utils/storage';
import Toast from './Toast';
import ShareModal from './ShareModal';
import MeatballMenu from './MeatballMenu';
import { getFeedDisplayName } from '../utils/feedMatching';
import { Feed } from '../types';

// Session storage key for navigation context
const NAV_CONTEXT_KEY = 'articleNavContext';

interface FeedItemCardProps {
  item: FeedItem;
  onStatusChange: () => void;
  scrollKey: string;
  allItemIds?: string[];  // List of all item IDs in current view
  itemIndex?: number;     // Index of this item in the list
  feeds?: Feed[];         // Feeds array for displaying correct feed name
}

// Detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

function FeedItemCard({ item, onStatusChange, scrollKey, allItemIds, itemIndex, feeds = [] }: FeedItemCardProps) {
  // ✅ Memoize feed display name (only recalc when feeds or item.feedId changes)
  const feedDisplayName = useMemo(
    () => getFeedDisplayName(item, feeds),
    [item.feedId, item.source, feeds]
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [showToast, setShowToast] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReadingOrderMenu, setShowReadingOrderMenu] = useState(false);
  const readingOrderButtonRef = useRef<HTMLButtonElement>(null);
  const readingOrderMenuRef = useRef<HTMLDivElement>(null);
  const [readingOrderMenuPosition, setReadingOrderMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const handleStatusChange = async (newStatus: FeedItem['status'], e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Toggle: if item already has this status, remove it (set to inbox)
      const finalStatus = item.status === newStatus ? 'inbox' : newStatus;
      await storage.updateItemStatus(item.id, finalStatus);
      onStatusChange();
      // Trigger event for other components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    } catch (error) {
      console.error('Error updating item status:', error);
    }
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (confirm('Are you sure you want to delete this item?')) {
      await storage.removeFeedItem(item.id);
    onStatusChange();
      // Trigger event for other components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    }
  };

  const handleCopyLink = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      await navigator.clipboard.writeText(item.url);
      setShowToast(true);
    } catch (error) {
      console.error('Failed to copy link:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = item.url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setShowToast(true);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleShare = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (isIOS() && navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          url: item.url,
        });
      } catch (error) {
        // User cancelled or error occurred
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error);
        }
      }
    } else {
      // Open share modal for web
      setShowShareModal(true);
    }
  };

  // Reset position when menu closes
  useEffect(() => {
    if (!showReadingOrderMenu) {
      setReadingOrderMenuPosition(null);
    }
  }, [showReadingOrderMenu]);

  // Close reading order menu when clicking outside
  useEffect(() => {
    if (!showReadingOrderMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isClickOnButton = readingOrderButtonRef.current?.contains(target);
      const isClickOnMenu = readingOrderMenuRef.current?.contains(target);
      
      if (!isClickOnButton && !isClickOnMenu) {
        setShowReadingOrderMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReadingOrderMenu]);

  const handleReadingOrderSelect = async (order: 'next' | 'later' | 'someday') => {
    const currentExplicit = item.status === 'saved' ? item.readingOrder || null : null;
    
    // Close menu immediately for better UX
    setShowReadingOrderMenu(false);
    
    try {
      console.log('Updating reading order:', { itemId: item.id, currentStatus: item.status, currentOrder: item.readingOrder, newOrder: order });
      
      // If already saved with this explicit subcategory, clear Later (back to inbox)
      if (item.status === 'saved' && currentExplicit === order) {
        console.log('Clearing Later - moving to inbox');
        await storage.updateItemStatus(item.id, 'inbox');
        await storage.updateItemReadingOrder(item.id, null);
      } else {
        // Ensure item is in Later - update status first, then reading order
        if (item.status !== 'saved') {
          console.log('Updating status to saved first');
          await storage.updateItemStatus(item.id, 'saved');
        }
        console.log('Updating reading order to:', order);
        await storage.updateItemReadingOrder(item.id, order);
      }

      console.log('Reading order update successful');
      
      // Refresh after successful update
      onStatusChange();
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    } catch (error) {
      console.error('Error updating reading order:', error);
      alert(`Failed to update reading order: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
      // Reopen menu on error so user can retry
      setShowReadingOrderMenu(true);
    }
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const calculateReadTime = (content: string): string => {
    if (!content) return '1 min';
    
    // Strip HTML tags and get plain text
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Count words (split by whitespace)
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    
    // Average reading speed: 200 words per minute
    const wordsPerMinute = 200;
    const minutes = Math.max(1, Math.round(wordCount / wordsPerMinute));
    
    return minutes <= 1 ? `${minutes} min` : `${minutes} mins`;
  };

  const handleClick = () => {
    // Save scroll position before navigating
    const findScrollContainer = (): HTMLElement | null => {
      const main = document.querySelector('main');
      return main;
    };

    const scrollContainer = findScrollContainer();
    if (scrollContainer) {
      sessionStorage.setItem(scrollKey, scrollContainer.scrollTop.toString());
    }

    // Store navigation context for "proceed to next" functionality
    if (allItemIds && allItemIds.length > 0) {
      const navContext = {
        itemIds: allItemIds,
        currentIndex: itemIndex ?? 0,
        returnPath: location.pathname,
      };
      sessionStorage.setItem(NAV_CONTEXT_KEY, JSON.stringify(navContext));
    }

    // Encode the ID if it contains special characters (e.g., if it's a URL)
    const encodedId = encodeURIComponent(item.id);
    navigate(`/article/${encodedId}`, { state: { fromList: true } });
  };

  // Check if snippet should be displayed
  const shouldShowSnippet = () => {
    if (!item.contentSnippet || !item.contentSnippet.trim()) {
      return false;
    }

    const snippet = item.contentSnippet.trim();
    const title = item.title.trim();

    // Don't show if snippet is the same as title (case-insensitive)
    if (snippet.toLowerCase() === title.toLowerCase()) {
      return false;
    }

    // Don't show if snippet is only "Read more" or similar variations
    const readMorePatterns = /^(read\s+more|read more|readmore|continue reading|continue|more)$/i;
    if (readMorePatterns.test(snippet)) {
      return false;
    }

    return true;
  };

  return (
    <article 
      className="border-b py-6 sm:py-8 cursor-pointer hover:opacity-80 transition-opacity touch-manipulation"
      style={{ borderColor: 'var(--theme-border)' }}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm" style={{ color: 'var(--theme-text-muted)' }}>
          <span className="font-medium">{feedDisplayName}</span>
          <span>·</span>
          <time>{formatDate(item.publishedAt)}</time>
          <span>·</span>
          <span>{calculateReadTime(item.fullContent || item.contentSnippet || '')}</span>
        </div>
      </div>

      <h2 
        className="text-xl sm:text-2xl font-bold mb-3 leading-tight tracking-tight"
        style={{ color: 'var(--theme-text)' }}
      >
        {item.title}
      </h2>

      {shouldShowSnippet() && (
        <p 
          className="text-base sm:text-lg leading-relaxed mb-4 line-clamp-ellipsis"
          style={{ 
            color: 'var(--theme-text-secondary)'
          }}
        >
        {item.contentSnippet}
      </p>
      )}

      <div className="flex items-center gap-4 sm:gap-6 flex-wrap mt-5" onClick={(e) => e.stopPropagation()}>
        <button
          ref={readingOrderButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            const wasOpen = showReadingOrderMenu;
            if (!wasOpen && readingOrderButtonRef.current) {
              // Calculate position synchronously before opening
              const rect = readingOrderButtonRef.current.getBoundingClientRect();
              setReadingOrderMenuPosition({
                top: rect.bottom + 8,
                left: rect.left,
              });
            }
            setShowReadingOrderMenu(!wasOpen);
          }}
          className="transition-colors touch-manipulation p-2 -ml-2"
          style={{
            color: item.status === 'saved' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
          }}
          onMouseEnter={(e) => {
            if (item.status !== 'saved') {
              e.currentTarget.style.color = 'var(--theme-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (item.status !== 'saved') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }
          }}
          title="Later"
          aria-label="Later"
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        {/* Click outside overlay */}
        {showReadingOrderMenu && createPortal(
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setShowReadingOrderMenu(false)}
          />,
          document.body
        )}

        {/* Reading Order Menu Card */}
        {showReadingOrderMenu && readingOrderMenuPosition && createPortal(
          <div
            ref={readingOrderMenuRef}
            className="fixed shadow-xl py-1 z-[101] min-w-[120px]"
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              border: '1px solid var(--theme-border)',
              top: readingOrderMenuPosition.top,
              left: readingOrderMenuPosition.left,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(['next', 'later', 'someday'] as const).map((order) => {
              const isSelected =
                item.status === 'saved' && item.readingOrder === order;
              const label =
                order === 'next' ? 'Next' : order === 'later' ? 'Later' : 'Someday';
              return (
                <button
                  key={order}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReadingOrderSelect(order);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm transition-colors"
                  style={{
                    color: isSelected ? 'var(--theme-text)' : 'var(--theme-text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                    e.currentTarget.style.color = 'var(--theme-text)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = isSelected
                      ? 'var(--theme-text)'
                      : 'var(--theme-text-secondary)';
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
        <button
          onClick={(e) => handleStatusChange('bookmarked', e)}
          className="transition-colors touch-manipulation p-2 -ml-2"
          style={{
            color: item.status === 'bookmarked' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
          }}
          onMouseEnter={(e) => {
            if (item.status !== 'bookmarked') {
              e.currentTarget.style.color = 'var(--theme-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (item.status !== 'bookmarked') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }
          }}
          title={item.status === 'bookmarked' ? 'Bookmarked' : 'Bookmark'}
          aria-label={item.status === 'bookmarked' ? 'Remove Bookmark' : 'Bookmark'}
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        <button
          onClick={(e) => handleStatusChange('archived', e)}
          className="transition-colors touch-manipulation p-2 -ml-2"
          style={{
            color: item.status === 'archived' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
          }}
          onMouseEnter={(e) => {
            if (item.status !== 'archived') {
              e.currentTarget.style.color = 'var(--theme-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (item.status !== 'archived') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }
          }}
          title={item.status === 'archived' ? 'Archived' : 'Archive'}
          aria-label="Archive"
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>
        <MeatballMenu
          onCopyLink={handleCopyLink}
          onShare={handleShare}
          onDelete={handleDelete}
          buttonClassName="-ml-2"
          iconClassName="w-5 h-5 sm:w-4 sm:h-4"
        />
      </div>
      {showToast && (
        <Toast
          message="Link copied to clipboard"
          onClose={() => setShowToast(false)}
        />
      )}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        url={item.url}
        title={item.title}
      />
    </article>
  );
}

// ✅ Memoize component to prevent unnecessary re-renders
// Only re-render if these props change: item.id, item.status, item.readingOrder, feeds
export default memo(FeedItemCard, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.status === nextProps.item.status &&
    prevProps.item.readingOrder === nextProps.item.readingOrder &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.url === nextProps.item.url &&
    prevProps.scrollKey === nextProps.scrollKey &&
    prevProps.onStatusChange === nextProps.onStatusChange &&
    // Feeds array reference comparison (should be stable if feeds don't change)
    prevProps.feeds === nextProps.feeds
  );
});
