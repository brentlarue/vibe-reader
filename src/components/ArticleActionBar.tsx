import { useState } from 'react';
import { FeedItem } from '../types';
import Toast from './Toast';
import ShareModal from './ShareModal';
import MeatballMenu from './MeatballMenu';

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

        <MeatballMenu
          onCopyLink={handleCopyLink}
          onShare={handleShare}
          onAddNote={onAddNote}
          onDelete={onDelete}
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
    </div>
  );
}

