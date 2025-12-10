import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FeedItem } from '../types';
import { storage } from '../utils/storage';
import { summarizeItem } from '../services/aiSummarizer';

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
      found = allItems.find(item => item.url === decodedId || item.url === id);
      
      // Try partial match if URL is an ID
      if (!found) {
        found = allItems.find(item => item.id === decodedId || item.id === id);
      }
      
      // Try matching URL contains
      if (!found) {
        found = allItems.find(item => 
          (item.url && (item.url.includes(decodedId) || item.url.includes(id))) ||
          (item.id && (item.id.includes(decodedId) || item.id.includes(id)))
        );
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
    
    // Helper function to check if summary needs to be generated
    const needsSummary = (item: FeedItem): boolean => {
      // Check if summary is missing, undefined, empty, or is the error message
      return !item.aiSummary || 
             item.aiSummary.trim() === '' || 
             item.aiSummary === 'Summary not available.';
    };
    
    // Generate summary if it doesn't exist and we're not already generating for this item
    if (needsSummary(latestItem) && summaryGenerationInProgress.current !== latestItem.id) {
      summaryGenerationInProgress.current = latestItem.id;
      setIsGeneratingSummary(true);
      
      summarizeItem(latestItem)
        .then((summary) => {
          // Always get the latest from storage before updating
          const items = storage.getFeedItems();
          const currentItem = items.find(i => i.id === latestItem.id);
          
          // Only update if summary is still missing (prevent overwriting if user navigated away and back)
          // Also check if we're still on the same article page
          const currentRouteId = id ? decodeURIComponent(id) : null;
          if (currentItem && needsSummary(currentItem) && 
              (currentRouteId === latestItem.id || currentRouteId === latestItem.url || id === latestItem.id)) {
            const updated = items.map((i) =>
              i.id === latestItem.id ? { ...i, aiSummary: summary } : i
            );
            storage.saveFeedItems(updated);
            const updatedItem = updated.find(i => i.id === latestItem.id);
            if (updatedItem) {
              setItem(updatedItem);
            }
          }
        })
        .catch((error) => {
          console.error('Error generating summary:', error);
          console.error('Error details:', {
            message: error?.message || 'Unknown error',
            stack: error?.stack,
            itemId: latestItem?.id,
            itemTitle: latestItem?.title,
          });
          
          // Check if backend is not running
          if (error instanceof TypeError && error.message.includes('fetch')) {
            console.error('⚠️ Backend server is not running. Start it with: npm run dev:server or npm run dev:all');
          }
          
          // Only set fallback if summary is still missing
          // Also check if we're still on the same article page
          const items = storage.getFeedItems();
          const currentItem = items.find(i => i.id === latestItem.id);
          const currentRouteId = id ? decodeURIComponent(id) : null;
          if (currentItem && needsSummary(currentItem) &&
              (currentRouteId === latestItem.id || currentRouteId === latestItem.url || id === latestItem.id)) {
            const updated = items.map((i) =>
              i.id === latestItem.id ? { ...i, aiSummary: 'Summary not available.' } : i
            );
            storage.saveFeedItems(updated);
            const updatedItem = updated.find(i => i.id === latestItem.id);
            if (updatedItem) {
              setItem(updatedItem);
            }
          }
        })
        .finally(() => {
          // Only clear if this is still the current item being processed
          if (summaryGenerationInProgress.current === latestItem.id) {
            summaryGenerationInProgress.current = null;
          }
          setIsGeneratingSummary(false);
        });
    }
  }, [id]);

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Article not found</p>
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
        className="mb-8 text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors"
      >
        ← Back
      </button>

      <article className="prose prose-lg max-w-none">
        <header className="mb-12">
          <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
            <span className="font-medium">{item.source}</span>
            <span>·</span>
            <time>{formatDate(item.publishedAt)}</time>
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 leading-tight tracking-tight mb-6">
            {item.title}
          </h1>

          {isGeneratingSummary ? (
            <div className="bg-gray-50 border-l-4 border-black pl-6 py-4 mb-6">
              <p className="text-base text-gray-500 italic m-0 flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating summary...
              </p>
            </div>
          ) : item.aiSummary ? (
            <div className="bg-gray-50 border-l-4 border-black pl-6 py-4 mb-6">
              <p className="text-base text-gray-700 m-0">
                {item.aiSummary}
              </p>
            </div>
          ) : null}
        </header>

        {hasMeaningfulContent ? (
          <div 
            className="article-content prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="prose prose-lg max-w-none">
            {!hadContentFromFeed ? (
              <p className="text-gray-600 italic">
                No content available for this article. 
                {item.url && (
                  <span> <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-black underline hover:no-underline">Read on original site</a></span>
                )}
              </p>
            ) : (
              <p className="text-gray-600 italic">
                Content not available in feed.
                {item.url && (
                  <span> <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-black underline hover:no-underline">Read on original site</a></span>
                )}
              </p>
            )}
          </div>
        )}

        <footer className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex items-center gap-6">
            <button
              onClick={() => handleStatusChange('saved')}
              className={`transition-colors ${
                item.status === 'saved' 
                  ? 'text-black' 
                  : 'text-gray-500 hover:text-black'
              }`}
              title="Later"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={() => handleStatusChange('bookmarked')}
              className={`transition-colors ${
                item.status === 'bookmarked' 
                  ? 'text-black' 
                  : 'text-gray-500 hover:text-black'
              }`}
              title={item.status === 'bookmarked' ? 'Bookmarked' : 'Bookmark'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              onClick={() => handleStatusChange('archived')}
              className={`transition-colors ${
                item.status === 'archived' 
                  ? 'text-black' 
                  : 'text-gray-500 hover:text-black'
              }`}
              title={item.status === 'archived' ? 'Archived' : 'Archive'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="text-gray-500 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </footer>
      </article>
    </div>
  );
}
