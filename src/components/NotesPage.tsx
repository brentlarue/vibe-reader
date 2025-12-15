import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Annotation } from '../types';
import { getAnnotations, deleteAnnotation } from '../utils/annotations';
import { storage } from '../utils/storage';
import Toast from './Toast';

export default function NotesPage() {
  const navigate = useNavigate();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const allAnnotations = await getAnnotations();
        setAnnotations(allAnnotations);
      } catch (err) {
        console.error('Error loading annotations:', err);
        setError('Failed to load notes and highlights');
      } finally {
        setIsLoading(false);
      }
    };

    loadAnnotations();

    // Reload when feed items are updated
    const handleUpdate = () => {
      loadAnnotations();
    };
    window.addEventListener('feedItemsUpdated', handleUpdate);
    return () => window.removeEventListener('feedItemsUpdated', handleUpdate);
  }, []);

  // Group annotations by date
  const groupedAnnotations = annotations.reduce((groups, annotation) => {
    const date = new Date(annotation.createdAt);
    const dateKey = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(annotation);
    return groups;
  }, {} as Record<string, Annotation[]>);

  // Sort dates (newest first) - use the first annotation's date for sorting
  const sortedDates = Object.keys(groupedAnnotations).sort((a, b) => {
    const dateA = groupedAnnotations[a][0]?.createdAt || '';
    const dateB = groupedAnnotations[b][0]?.createdAt || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const handleAnnotationClick = async (annotation: Annotation) => {
    try {
      const item = await storage.getFeedItem(annotation.feedItemId);
      if (item) {
        // Pass annotation info in state for scrolling
        navigate(`/article/${encodeURIComponent(item.id)}`, {
          state: { 
            scrollToHighlight: annotation.type === 'highlight' ? annotation.content : null,
            highlightId: annotation.type === 'highlight' ? annotation.id : null,
            scrollToNote: annotation.type === 'note' ? annotation.id : null,
            noteId: annotation.type === 'note' ? annotation.id : null,
          }
        });
      }
    } catch (error) {
      console.error('Error loading article:', error);
    }
  };

  const handleDelete = async (e: React.MouseEvent, annotation: Annotation) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete this ${annotation.type}?`)) {
      try {
        await deleteAnnotation(annotation.id);
        // Remove from local state
        setAnnotations(prev => prev.filter(a => a.id !== annotation.id));
        // Trigger event to update article view if it's open
        window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
      } catch (error) {
        console.error('Error deleting annotation:', error);
        alert('Failed to delete annotation');
      }
    }
  };

  const handleCopy = async (e: React.MouseEvent, annotation: Annotation) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(annotation.content);
      setToastMessage(`${annotation.type === 'highlight' ? 'Highlight' : 'Note'} copied to clipboard`);
      setShowToast(true);
    } catch (error) {
      console.error('Failed to copy text:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = annotation.content;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setToastMessage(`${annotation.type === 'highlight' ? 'Highlight' : 'Note'} copied to clipboard`);
        setShowToast(true);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-14 lg:mt-0 pb-6 sm:pb-8 lg:pb-12">
        <p style={{ color: 'var(--theme-text-muted)' }}>Loading notes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-14 lg:mt-0 pb-6 sm:pb-8 lg:pb-12">
        <p style={{ color: '#dc2626' }}>{error}</p>
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-14 lg:mt-0 pb-6 sm:pb-8 lg:pb-12">
        <p style={{ color: 'var(--theme-text-muted)' }}>No notes or highlights yet.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto mt-14 lg:mt-0 pb-6 sm:pb-8 lg:pb-12">
      <h1 
        className="text-2xl sm:text-3xl font-bold mb-8 sm:mb-12"
        style={{ color: 'var(--theme-text)' }}
      >
        Notes
      </h1>

      <div className="space-y-12">
        {sortedDates.map((dateKey) => (
          <div key={dateKey}>
            {/* Date header - styled like body copy with top and bottom border, bold */}
            <h2 
              className="text-base sm:text-lg leading-relaxed pt-6 pb-6 border-t border-b mb-6 font-bold"
              style={{ 
                color: 'var(--theme-text-secondary)',
                borderColor: 'var(--theme-border)',
              }}
            >
              {dateKey}
            </h2>
            
            <div className="space-y-10">
              {groupedAnnotations[dateKey].map((annotation) => (
                <div
                  key={annotation.id}
                  className="cursor-pointer hover:opacity-80 transition-opacity touch-manipulation"
                  onClick={() => handleAnnotationClick(annotation)}
                >
                  {/* Metadata line - matches FeedItemCard metadata */}
                  <div 
                    className="flex flex-wrap items-baseline gap-x-2 sm:gap-x-3 gap-y-0.5 text-xs sm:text-sm mb-3 leading-tight"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <span className="font-medium">{annotation.type === 'highlight' ? 'Highlight' : 'Note'}</span>
                    <span>·</span>
                    <span>{annotation.feedName || 'Unknown feed'}</span>
                    <span>·</span>
                    <span className="break-words">{annotation.articleTitle || 'Unknown article'}</span>
                  </div>

                  {/* Content - matches FeedItemCard body text */}
                  <p 
                    className={`text-base sm:text-lg leading-relaxed mb-3 ${annotation.type === 'highlight' ? 'italic' : ''}`}
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    {annotation.content}
                  </p>

                  {/* Action buttons - delete and copy */}
                  <div 
                    className="flex items-center gap-4 sm:gap-6 flex-wrap mt-4" 
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => handleCopy(e, annotation)}
                      className="transition-colors touch-manipulation p-2 -ml-2"
                      style={{ color: 'var(--theme-text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--theme-text)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--theme-text-muted)';
                      }}
                      title="Copy"
                      aria-label="Copy"
                    >
                      <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, annotation)}
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
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {showToast && (
        <Toast
          message={toastMessage}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}
