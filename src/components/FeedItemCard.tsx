import { FeedItem } from '../types';
import { useNavigate } from 'react-router-dom';
import { storage } from '../utils/storage';

interface FeedItemCardProps {
  item: FeedItem;
  onStatusChange: () => void;
  scrollKey: string;
}

export default function FeedItemCard({ item, onStatusChange, scrollKey }: FeedItemCardProps) {
  const navigate = useNavigate();

  const handleStatusChange = (newStatus: FeedItem['status'], e: React.MouseEvent) => {
    e.stopPropagation();
    const items = storage.getFeedItems();
    const updated = items.map((i) =>
      i.id === item.id ? { ...i, status: newStatus } : i
    );
    storage.saveFeedItems(updated);
    onStatusChange();
    // Trigger event for other components
    window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this item?')) {
      storage.removeFeedItem(item.id);
      onStatusChange();
      // Trigger event for other components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
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
      className="border-b py-8 cursor-pointer hover:opacity-80 transition-opacity"
      style={{ borderColor: 'var(--theme-border)' }}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
          <span className="font-medium">{item.source}</span>
          <span>·</span>
          <time>{formatDate(item.publishedAt)}</time>
        </div>
      </div>

      <h2 
        className="text-2xl font-bold mb-3 leading-tight tracking-tight"
        style={{ color: 'var(--theme-text)' }}
      >
        {item.title}
      </h2>

      {shouldShowSnippet() && (
        <p 
          className="text-lg leading-relaxed mb-4 line-clamp-ellipsis"
          style={{ 
            color: 'var(--theme-text-secondary)'
          }}
        >
          {item.contentSnippet}
        </p>
      )}

      <div className="flex items-center gap-6 flex-wrap mt-5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => handleStatusChange('saved', e)}
          className="transition-colors"
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
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          onClick={(e) => handleStatusChange('bookmarked', e)}
          className="transition-colors"
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
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        <button
          onClick={(e) => handleStatusChange('archived', e)}
          className="transition-colors"
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
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="transition-colors"
          style={{ color: 'var(--theme-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
          }}
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </article>
  );
}
