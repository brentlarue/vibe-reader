import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  onReadingOrderChange?: (order: 'next' | 'later' | 'someday') => void;
}

// Detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export default function ArticleActionBar({ item, onStatusChange, onDelete, onAddNote, showBottomBorder = false, onReadingOrderChange }: ArticleActionBarProps) {
  const [showToast, setShowToast] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReadingOrderMenu, setShowReadingOrderMenu] = useState(false);
  const readingOrderButtonRef = useRef<HTMLButtonElement>(null);
  const readingOrderMenuRef = useRef<HTMLDivElement>(null);
  const [readingOrderMenuPosition, setReadingOrderMenuPosition] = useState({ top: 0, left: 0 });

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
    // Open reading order menu instead of directly toggling status
    setShowReadingOrderMenu((open) => !open);
  };

  // Calculate reading order menu position when opening
  useEffect(() => {
    if (showReadingOrderMenu && readingOrderButtonRef.current) {
      const updatePosition = () => {
        if (!readingOrderButtonRef.current) return;
        
        const buttonRect = readingOrderButtonRef.current.getBoundingClientRect();
        const gap = 8;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Estimate menu height (3 items × ~40px each + padding)
        const estimatedMenuHeight = 130;
        const estimatedMenuWidth = 140;
        
        // Check if menu would overflow bottom of viewport
        const wouldOverflowBottom = buttonRect.bottom + gap + estimatedMenuHeight > viewportHeight;
        
        // Position above if it would overflow, otherwise below
        let top = wouldOverflowBottom
          ? buttonRect.top - estimatedMenuHeight - gap
          : buttonRect.bottom + gap;
        
        // Ensure menu doesn't go above viewport
        top = Math.max(gap, top);
        
        // Handle horizontal overflow - align right edge if menu would overflow
        let left = buttonRect.left;
        if (left + estimatedMenuWidth > viewportWidth) {
          left = viewportWidth - estimatedMenuWidth - gap;
        }
        left = Math.max(gap, left);
        
        setReadingOrderMenuPosition({
          top,
          left,
        });
      };
      
      // Initial position calculation
      updatePosition();
      
      // Recalculate after menu is rendered to get actual height
      const timeoutId = setTimeout(() => {
        if (readingOrderMenuRef.current && readingOrderButtonRef.current) {
          const buttonRect = readingOrderButtonRef.current.getBoundingClientRect();
          const menuHeight = readingOrderMenuRef.current.offsetHeight;
          const menuWidth = readingOrderMenuRef.current.offsetWidth;
          const gap = 8;
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          const wouldOverflowBottom = buttonRect.bottom + gap + menuHeight > viewportHeight;
          
          let top = wouldOverflowBottom
            ? buttonRect.top - menuHeight - gap
            : buttonRect.bottom + gap;
          
          top = Math.max(gap, top);
          
          // Handle horizontal overflow - align right edge if menu would overflow
          let left = buttonRect.left;
          if (left + menuWidth > viewportWidth) {
            left = viewportWidth - menuWidth - gap;
          }
          left = Math.max(gap, left);
          
          setReadingOrderMenuPosition({
            top,
            left,
          });
        }
      }, 0);
      
      return () => clearTimeout(timeoutId);
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

  const handleReadingOrderSelect = (order: 'next' | 'later' | 'someday') => {
    // Close menu immediately for better UX
    setShowReadingOrderMenu(false);
    
    if (onReadingOrderChange) {
      onReadingOrderChange(order);
    }
  };

  return (
    <div 
      className={`py-4 border-t ${showBottomBorder ? 'border-b' : ''}`}
      style={{ borderColor: 'var(--theme-border)' }}
    >
      <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
        <button
          ref={readingOrderButtonRef}
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
          title="Save for Later"
          aria-label="Save for Later"
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
        {showReadingOrderMenu && createPortal(
          <div
            ref={readingOrderMenuRef}
            className="fixed shadow-xl py-1 z-[101] min-w-[140px]"
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

