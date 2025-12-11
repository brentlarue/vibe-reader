import { FeedItem } from '../types';

interface ArticleActionBarProps {
  item: FeedItem;
  onStatusChange: (status: FeedItem['status']) => void;
  onDelete: () => void;
  showBottomBorder?: boolean;
}

export default function ArticleActionBar({ item, onStatusChange, onDelete, showBottomBorder = false }: ArticleActionBarProps) {
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
    // Always set to archived (doesn't toggle)
    onStatusChange('archived');
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
            if (item.status !== 'saved') {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }
          }}
          onMouseLeave={(e) => {
            if (item.status !== 'saved') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
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
            if (item.status !== 'bookmarked') {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }
          }}
          onMouseLeave={(e) => {
            if (item.status !== 'bookmarked') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
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
            if (item.status !== 'archived') {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }
          }}
          onMouseLeave={(e) => {
            if (item.status !== 'archived') {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
          title="Archive"
          aria-label="Archive"
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>

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
    </div>
  );
}

