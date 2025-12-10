import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FeedItem } from '../types';
import { storage } from '../utils/storage';
import { summarizeItem } from '../services/aiSummarizer';
import ArticleActionBar from './ArticleActionBar';

export default function ArticleReader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<FeedItem | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const summaryGenerationInProgress = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;

    // Decode the ID in case it was URL-encoded in the route
    const decodedId = decodeURIComponent(id);
    
    // Try to find by exact ID match first
    let found = storage.getFeedItem(decodedId);
    
    // If not found, try with encoded version
    if (!found && decodedId !== id) {
      found = storage.getFeedItem(id);
    }
    
    // If still not found, try to find by URL (IDs might be URLs)
    if (!found) {
      console.warn('Article not found for id:', decodedId);
      const allItems = storage.getFeedItems();
      
      // Try exact match on URL
      found = allItems.find(item => item.url === decodedId || item.url === id) || null;
      
      // Try partial match if URL is an ID
      if (!found) {
        found = allItems.find(item => item.id === decodedId || item.id === id) || null;
      }
      
      // Try matching URL contains
      if (!found) {
        found = allItems.find(item => 
          (item.url && (item.url.includes(decodedId) || item.url.includes(id))) ||
          (item.id && (item.id.includes(decodedId) || item.id.includes(id)))
        ) || null;
      }
      
      if (!found) {
        console.error('Article not found after all attempts. Available items:', allItems.length);
        console.error('Looking for ID:', decodedId);
        console.error('Sample stored IDs:', allItems.slice(0, 3).map(i => i.id));
        setItem(null);
        return;
      }
      
      console.log('Found article by fallback search:', found.id, found.title);
    } else {
      console.log('Found article:', found.id, found.title);
    }
    
    // Always get the latest item from storage to ensure we have the most up-to-date version
    const latestItem = storage.getFeedItem(found.id) || found;
    setItem(latestItem);
  }, [id]);

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: 'var(--theme-text-muted)' }}>Article not found</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handleStatusChange = (newStatus: FeedItem['status']) => {
    const items = storage.getFeedItems();
    const updated = items.map((i) =>
      i.id === item.id ? { ...i, status: newStatus } : i
    );
    storage.saveFeedItems(updated);
    setItem({ ...item, status: newStatus });
    // Trigger event for other components to update
    window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this item?')) {
      storage.removeFeedItem(item.id);
      // Navigate back after deletion
      navigate(-1);
      // Trigger event for other components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    }
  };

  // Helper function to check if summary needs to be generated
  const needsSummary = (item: FeedItem): boolean => {
    // Check if summary is missing, undefined, empty, or is the error message
    return !item.aiSummary || 
           item.aiSummary.trim() === '' || 
           item.aiSummary === 'Summary not available.';
  };

  const handleGenerateSummary = () => {
    if (!item || isGeneratingSummary || summaryGenerationInProgress.current === item.id) {
      return;
    }

    summaryGenerationInProgress.current = item.id;
    setIsGeneratingSummary(true);
    
    summarizeItem(item)
      .then((summary) => {
        // Debug: Log summary before storing
        console.log('AI summary before storing - Length (characters):', summary.length);
        console.log('AI summary full text:', summary);
        
        // Always get the latest from storage before updating
        const items = storage.getFeedItems();
        const currentItem = items.find(i => i.id === item.id);
        
        // Only update if summary is still missing and we're still on the same article
        const currentRouteId = id ? decodeURIComponent(id) : null;
        if (currentItem && needsSummary(currentItem) && 
            (currentRouteId === item.id || currentRouteId === item.url || id === item.id)) {
          const updated = items.map((i) =>
            i.id === item.id ? { ...i, aiSummary: summary } : i
          );
          storage.saveFeedItems(updated);
          const updatedItem = updated.find(i => i.id === item.id);
          
          // Debug: Log what we're storing
          if (updatedItem) {
            console.log('AI summary stored in item - Length (characters):', (updatedItem.aiSummary || '').length);
            console.log('AI summary stored text:', updatedItem.aiSummary);
          }
          
          if (updatedItem && (currentRouteId === item.id || currentRouteId === item.url || id === item.id)) {
            setItem(updatedItem);
          }
        }
      })
      .catch((error) => {
        console.error('Error generating summary:', error);
        console.error('Error details:', {
          message: error?.message || 'Unknown error',
          stack: error?.stack,
          itemId: item?.id,
          itemTitle: item?.title,
        });
        
        // Check if backend is not running
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.error('⚠️ Backend server is not running. Start it with: npm run dev:server or npm run dev:all');
        }
        
        // Only set fallback if summary is still missing and we're still on the same article
        const items = storage.getFeedItems();
        const currentItem = items.find(i => i.id === item.id);
        const currentRouteId = id ? decodeURIComponent(id) : null;
        if (currentItem && needsSummary(currentItem) &&
            (currentRouteId === item.id || currentRouteId === item.url || id === item.id)) {
          const updated = items.map((i) =>
            i.id === item.id ? { ...i, aiSummary: 'Summary not available.' } : i
          );
          storage.saveFeedItems(updated);
          const updatedItem = updated.find(i => i.id === item.id);
          if (updatedItem && (currentRouteId === item.id || currentRouteId === item.url || id === item.id)) {
            setItem(updatedItem);
          }
        }
      })
      .finally(() => {
        // Only clear if this is still the current item being processed
        if (summaryGenerationInProgress.current === item.id) {
          summaryGenerationInProgress.current = null;
        }
        setIsGeneratingSummary(false);
      });
  };

  // Get content - prefer fullContent, fallback to contentSnippet
  const content = item.fullContent || item.contentSnippet || '';
  const contentText = content.replace(/<[^>]*>/g, '').trim(); // Strip HTML for comparison
  
  // Check if content exists and is meaningful (not just the title)
  const hasMeaningfulContent = content && content.trim().length > 0 && 
    contentText.toLowerCase() !== item.title.toLowerCase();
  
  // Check if we actually had content from the feed (not just empty)
  const hadContentFromFeed = !!(item.fullContent || item.contentSnippet);

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="mb-8 text-sm font-medium transition-colors"
        style={{ color: 'var(--theme-text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--theme-text)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--theme-text-muted)';
        }}
      >
        ← Back
      </button>

      <article className="prose prose-lg max-w-none">
        <header className="mb-12">
          <div className="flex items-center gap-3 text-sm mb-4" style={{ color: 'var(--theme-text-muted)' }}>
            <span className="font-medium">{item.source}</span>
            <span>·</span>
            <time>{formatDate(item.publishedAt)}</time>
          </div>
          
          <h1 
            className="text-4xl font-bold leading-tight tracking-tight mb-6"
            style={{ color: 'var(--theme-text)' }}
          >
            {item.title}
          </h1>

          {isGeneratingSummary ? (
            <div 
              className="border-l-4 pl-6 py-4 mb-3"
              style={{ 
                backgroundColor: 'var(--theme-hover-bg)', 
                borderColor: 'var(--theme-accent)' 
              }}
            >
              <p 
                className="text-base italic m-0 flex items-center gap-2"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <svg 
                  className="animate-spin h-4 w-4" 
                  style={{ color: 'var(--theme-text-muted)' }}
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating summary...
              </p>
            </div>
          ) : item.aiSummary ? (
            <div 
              className="border-l-4 pl-6 py-4 mb-3"
              style={{ 
                backgroundColor: 'var(--theme-hover-bg)', 
                borderColor: 'var(--theme-accent)',
                overflow: 'visible',
                maxHeight: 'none',
                height: 'auto',
                minHeight: 'auto'
              }}
            >
              {/* Debug: Log what's being rendered */}
              {(() => {
                console.log('Rendering AI summary - Length (characters):', (item.aiSummary || '').length);
                return null;
              })()}
              <p 
                className="text-base m-0 whitespace-pre-wrap break-words"
                style={{ 
                  color: 'var(--theme-text-secondary)',
                  overflow: 'visible',
                  textOverflow: 'clip',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  maxHeight: 'none',
                  height: 'auto',
                  display: 'block'
                }}
              >
                {item.aiSummary}
              </p>
            </div>
          ) : needsSummary(item) ? (
            <div className="mb-3">
              <button
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary}
                className="text-sm border px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{
                  borderColor: 'var(--theme-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--theme-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isGeneratingSummary) {
                    e.currentTarget.style.borderColor = 'var(--theme-accent)';
                    e.currentTarget.style.color = 'var(--theme-text)';
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isGeneratingSummary) {
                    e.currentTarget.style.borderColor = 'var(--theme-border)';
                    e.currentTarget.style.color = 'var(--theme-text-secondary)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Generate AI Summary
              </button>
            </div>
          ) : null}
        </header>

        {/* Action bar above content */}
        <div className="mb-12">
          <ArticleActionBar 
            item={item} 
            onStatusChange={handleStatusChange} 
            onDelete={handleDelete}
            showBottomBorder={true}
          />
        </div>

        {hasMeaningfulContent ? (
          <div 
            className="article-content prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="prose prose-lg max-w-none">
            {!hadContentFromFeed ? (
              <p className="italic" style={{ color: 'var(--theme-text-secondary)' }}>
                No content available for this article. 
                {item.url && (
                  <span> <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline" style={{ color: 'var(--theme-text)' }}>Read on original site</a></span>
                )}
              </p>
            ) : (
              <p className="italic" style={{ color: 'var(--theme-text-secondary)' }}>
                Content not available in feed.
                {item.url && (
                  <span> <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline" style={{ color: 'var(--theme-text)' }}>Read on original site</a></span>
                )}
              </p>
            )}
          </div>
        )}

        {/* Action bar below content */}
        <div className="mt-8">
          <ArticleActionBar 
            item={item} 
            onStatusChange={handleStatusChange} 
            onDelete={handleDelete} 
          />
        </div>
      </article>
    </div>
  );
}
