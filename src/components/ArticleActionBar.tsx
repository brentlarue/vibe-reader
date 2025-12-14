import { useState } from 'react';
import { FeedItem } from '../types';
import Toast from './Toast';
import ShareModal from './ShareModal';

interface ArticleActionBarProps {
  item: FeedItem;
  onStatusChange: (status: FeedItem['status']) => void;
  onDelete: () => void;
  onAddNote?: () => void;
  showBottomBorder?: boolean;
}

// Detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export default function ArticleActionBar({ item, onStatusChange, onDelete, onAddNote, showBottomBorder = false }: ArticleActionBarProps) {
  const [showToast, setShowToast] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleCopyLink = async () => {
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

  const handleShare = async () => {
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
  const handleLaterClick = () => {
    // Toggle between saved and inbox
    if (item.status === 'saved') {
      onStatusChange('inbox');
    } else {
      onStatusChange('saved');
    }
  };

  const handleBookmarkClick = () => {
    // Toggle between bookmarked and inbox
    if (item.status === 'bookmarked') {
      onStatusChange('inbox');
    } else {
      onStatusChange('bookmarked');
    }
  };

  const handleArchiveClick = () => {
    // Toggle between archived and inbox
    if (item.status === 'archived') {
      onStatusChange('inbox');
    } else {
    onStatusChange('archived');
    }
  };

  return (
    <div 
      className={`py-4 border-t ${showBottomBorder ? 'border-b' : ''}`}
      style={{ borderColor: 'var(--theme-border)' }}
    >
      <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
        <button
          onClick={handleLaterClick}
          className="transition-colors p-2 sm:p-2 rounded-md touch-manipulation"
          style={{
            color: item.status === 'saved' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            if (item.status !== 'saved') {
              e.currentTarget.style.color = 'var(--theme-text)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            if (item.status !== 'saved') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }
          }}
          title={item.status === 'saved' ? 'Remove from Later' : 'Save for Later'}
          aria-label={item.status === 'saved' ? 'Remove from Later' : 'Save for Later'}
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        <button
          onClick={handleBookmarkClick}
          className="transition-colors p-2 sm:p-2 rounded-md touch-manipulation"
          style={{
            color: item.status === 'bookmarked' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            if (item.status !== 'bookmarked') {
              e.currentTarget.style.color = 'var(--theme-text)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            if (item.status !== 'bookmarked') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }
          }}
          title={item.status === 'bookmarked' ? 'Remove Bookmark' : 'Bookmark'}
          aria-label={item.status === 'bookmarked' ? 'Remove Bookmark' : 'Bookmark'}
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>

        <button
          onClick={handleArchiveClick}
          className="transition-colors p-2 sm:p-2 rounded-md touch-manipulation"
          style={{
            color: item.status === 'archived' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            if (item.status !== 'archived') {
              e.currentTarget.style.color = 'var(--theme-text)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            if (item.status !== 'archived') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }
          }}
          title={item.status === 'archived' ? 'Remove from Archive' : 'Archive'}
          aria-label={item.status === 'archived' ? 'Remove from Archive' : 'Archive'}
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>

        <button
          onClick={handleCopyLink}
          className="transition-colors p-2 sm:p-2 rounded-md touch-manipulation"
          style={{ color: 'var(--theme-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--theme-text)';
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Copy Link"
          aria-label="Copy Link"
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>

        <button
          onClick={handleShare}
          className="transition-colors p-2 sm:p-2 rounded-md touch-manipulation"
          style={{ color: 'var(--theme-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--theme-text)';
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Share"
          aria-label="Share"
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>

        {onAddNote && (
          <button
            onClick={onAddNote}
            className="transition-colors p-2 sm:p-2 rounded-md touch-manipulation"
            style={{ color: 'var(--theme-text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Add note"
            aria-label="Add note"
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}

        <button
          onClick={onDelete}
          className="transition-colors p-2 sm:p-2 rounded-md touch-manipulation"
          style={{ color: 'var(--theme-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#dc2626';
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Delete"
          aria-label="Delete"
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
    </div>
  );
}

