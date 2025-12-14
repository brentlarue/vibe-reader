import { useState } from 'react';
import { FeedItem } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { storage } from '../utils/storage';
import Toast from './Toast';
import ShareModal from './ShareModal';

// Session storage key for navigation context
const NAV_CONTEXT_KEY = 'articleNavContext';

interface FeedItemCardProps {
  item: FeedItem;
  onStatusChange: () => void;
  scrollKey: string;
  allItemIds?: string[];  // List of all item IDs in current view
  itemIndex?: number;     // Index of this item in the list
}

// Detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export default function FeedItemCard({ item, onStatusChange, scrollKey, allItemIds, itemIndex }: FeedItemCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showToast, setShowToast] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleStatusChange = async (newStatus: FeedItem['status'], e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await storage.updateItemStatus(item.id, newStatus);
      onStatusChange();
      // Trigger event for other components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    } catch (error) {
      console.error('Error updating item status:', error);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this item?')) {
      await storage.removeFeedItem(item.id);
    onStatusChange();
      // Trigger event for other components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
          <span className="font-medium">{item.source}</span>
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
          onClick={(e) => handleStatusChange('saved', e)}
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
          title={item.status === 'saved' ? 'Later' : 'Later'}
          aria-label={item.status === 'saved' ? 'Remove from Later' : 'Save for Later'}
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
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
        <button
          onClick={handleCopyLink}
          className="transition-colors touch-manipulation p-2 -ml-2"
          style={{ color: 'var(--theme-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--theme-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
          }}
          title="Copy Link"
          aria-label="Copy Link"
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>
        <button
          onClick={handleShare}
          className="transition-colors touch-manipulation p-2 -ml-2"
          style={{ color: 'var(--theme-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--theme-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
          }}
          title="Share"
          aria-label="Share"
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="transition-colors touch-manipulation p-2 -ml-2"
          style={{ color: 'var(--theme-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
          }}
          title="Delete"
          aria-label="Delete"
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
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
