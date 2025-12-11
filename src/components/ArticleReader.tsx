import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FeedItem } from '../types';
import { storage } from '../utils/storage';
import { summarizeItem } from '../services/aiSummarizer';
import { generateAIFeature, AIFeatureType } from '../services/aiFeatures';
import ArticleActionBar from './ArticleActionBar';

export default function ArticleReader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<FeedItem | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const summaryGenerationInProgress = useRef<string | null>(null);
  
  // State for AI features
  const [generatingFeature, setGeneratingFeature] = useState<AIFeatureType | null>(null);
  const [aiFeatureResults, setAiFeatureResults] = useState<{
    'insightful-reply': string | null;
    'investor-analysis': string | null;
    'founder-implications': string | null;
  }>({
    'insightful-reply': null,
    'investor-analysis': null,
    'founder-implications': null,
  });

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
    // Reset AI feature results when article changes
    setAiFeatureResults({
      'insightful-reply': null,
      'investor-analysis': null,
      'founder-implications': null,
    });
    setGeneratingFeature(null);
    summaryGenerationInProgress.current = null;
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

  const handleGenerateAIFeature = async (featureType: AIFeatureType) => {
    if (!item || generatingFeature) {
      return;
    }

    setGeneratingFeature(featureType);
    
    try {
      const result = await generateAIFeature(item, featureType);
      setAiFeatureResults(prev => ({
        ...prev,
        [featureType]: result
      }));
    } catch (error) {
      console.error(`Error generating ${featureType}:`, error);
      // Optionally show error to user
    } finally {
      setGeneratingFeature(null);
    }
  };

  // Helper function to convert markdown to HTML
  const markdownToHtml = (text: string, removeNumbering: boolean = false, removeBold: boolean = false, noLists: boolean = false, listNoBullets: boolean = false, boldHeaderColor: boolean = false): string => {
    if (!text) return '';
    
    let html = text;
    
    // Remove numbering from section headers if requested (e.g., "1. **Section:**" or "1. ### Section")
    if (removeNumbering) {
      // Remove numbering from lines like "1. **Section:**" or "1. ### Section"
      html = html.replace(/^\d+\.\s+/gm, '');
    }
    
    // Process line by line to handle different markdown elements
    const lines = html.split('\n');
    const result: string[] = [];
    let inList = false;
    let listItems: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      if (!line) {
        // Empty line - close list if open, add paragraph break
        if (inList && listItems.length > 0) {
          const ulStyle = listNoBullets 
            ? 'margin-bottom: 1rem; padding-left: 0; list-style: none;' 
            : 'margin-bottom: 1rem; padding-left: 1.5rem; list-style-type: disc;';
          result.push(`<ul style="${ulStyle}">${listItems.join('')}</ul>`);
          listItems = [];
          inList = false;
        }
        continue;
      }
      
      // Check if it's a header (starts with ### or ## or #)
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headerMatch) {
        // Close list if open
        if (inList && listItems.length > 0) {
          const ulStyle = listNoBullets 
            ? 'margin-bottom: 1rem; padding-left: 0; list-style: none;' 
            : 'margin-bottom: 1rem; padding-left: 1.5rem; list-style-type: disc;';
          result.push(`<ul style="${ulStyle}">${listItems.join('')}</ul>`);
          listItems = [];
          inList = false;
        }
        
        const level = headerMatch[1].length;
        let title = headerMatch[2].trim();
        // Remove trailing colon from header
        title = title.replace(/:\s*$/, '');
        // Convert **bold** in header title to <strong>
        title = title.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
        result.push(`<h${level} style="font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; color: var(--theme-text); font-size: ${level === 1 ? '1.5' : level === 2 ? '1.25' : '1.125'}rem;">${title}</h${level}>`);
        continue;
      }
      
      // Check for bold text at start of line (like "**Section:**")
      const boldHeaderMatch = line.match(/^\*\*([^*:]+?):?\*\*\s*$/);
      if (boldHeaderMatch) {
        // Close list if open
        if (inList && listItems.length > 0) {
          const ulStyle = listNoBullets 
            ? 'margin-bottom: 1rem; padding-left: 0; list-style: none;' 
            : 'margin-bottom: 1rem; padding-left: 1.5rem; list-style-type: disc;';
          result.push(`<ul style="${ulStyle}">${listItems.join('')}</ul>`);
          listItems = [];
          inList = false;
        }
        // Treat as a header (h3)
        const title = boldHeaderMatch[1].trim();
        result.push(`<h3 style="font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; color: var(--theme-text); font-size: 1.125rem;">${title}</h3>`);
        continue;
      }
      
      // Skip list processing if noLists is true - convert list items to paragraphs
      if (noLists) {
        // Check for numbered list items - convert to paragraphs
        const numberedListMatch = line.match(/^\d+\.\s+(.+)$/);
        if (numberedListMatch) {
          let itemContent = numberedListMatch[1].trim();
          // Convert **bold** to <strong> in paragraphs (unless removeBold is true)
          if (!removeBold) {
            if (boldHeaderColor) {
              // Use header color for bold text
              itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '<strong style="color: var(--theme-text);">$1</strong>');
            } else {
              itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
            }
          } else {
            // Remove bold markdown but keep the text
            itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '$1');
          }
          result.push(`<p style="margin-bottom: 1rem; line-height: 1.625;">${itemContent}</p>`);
          continue;
        }
        
        // Check for markdown list items (starting with - or * or •) - convert to paragraphs
        const listMatch = line.match(/^[\-\*•]\s+(.+)$/);
        if (listMatch) {
          let itemContent = listMatch[1].trim();
          // Convert **bold** to <strong> in paragraphs (unless removeBold is true)
          if (!removeBold) {
            if (boldHeaderColor) {
              // Use header color for bold text
              itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '<strong style="color: var(--theme-text);">$1</strong>');
            } else {
              itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
            }
          } else {
            // Remove bold markdown but keep the text
            itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '$1');
          }
          result.push(`<p style="margin-bottom: 1rem; line-height: 1.625;">${itemContent}</p>`);
          continue;
        }
      } else {
        // Check for numbered list items - convert to bulleted lists
        const numberedListMatch = line.match(/^\d+\.\s+(.+)$/);
        if (numberedListMatch) {
          inList = true;
          let itemContent = numberedListMatch[1].trim();
          // Convert **bold** to <strong> in list items (unless removeBold is true)
          if (!removeBold) {
            itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
          } else {
            // Remove bold markdown but keep the text
            itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '$1');
          }
          const listStyle = listNoBullets 
            ? 'margin-bottom: 0.5rem; line-height: 1.625; list-style: none; padding-left: 0;' 
            : 'margin-bottom: 0.5rem; line-height: 1.625;';
          listItems.push(`<li style="${listStyle}">${itemContent}</li>`);
          continue;
        }
        
        // Check for markdown list items (starting with - or * or •)
        const listMatch = line.match(/^[\-\*•]\s+(.+)$/);
        if (listMatch) {
          inList = true;
          let itemContent = listMatch[1].trim();
          // Convert **bold** to <strong> in list items (unless removeBold is true)
          if (!removeBold) {
            itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
          } else {
            // Remove bold markdown but keep the text
            itemContent = itemContent.replace(/\*\*([^*]+?)\*\*/g, '$1');
          }
          const listStyle = listNoBullets 
            ? 'margin-bottom: 0.5rem; line-height: 1.625; list-style: none; padding-left: 0;' 
            : 'margin-bottom: 0.5rem; line-height: 1.625;';
          listItems.push(`<li style="${listStyle}">${itemContent}</li>`);
          continue;
        }
      }
      
      // Close list if we hit a non-list line
      if (inList && listItems.length > 0) {
        const ulStyle = listNoBullets 
          ? 'margin-bottom: 1rem; padding-left: 0; list-style: none;' 
          : 'margin-bottom: 1rem; padding-left: 1.5rem; list-style-type: disc;';
        result.push(`<ul style="${ulStyle}">${listItems.join('')}</ul>`);
        listItems = [];
        inList = false;
      }
      
      // Regular paragraph line - convert **bold** to <strong> (unless removeBold is true)
      if (!removeBold) {
        if (boldHeaderColor) {
          // Use header color for bold text
          line = line.replace(/\*\*([^*]+?)\*\*/g, '<strong style="color: var(--theme-text);">$1</strong>');
        } else {
          line = line.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
        }
      } else {
        // Remove bold markdown but keep the text
        line = line.replace(/\*\*([^*]+?)\*\*/g, '$1');
      }
      result.push(`<p style="margin-bottom: 1rem; line-height: 1.625;">${line}</p>`);
    }
    
    // Close any remaining list
    if (inList && listItems.length > 0) {
      const ulStyle = listNoBullets 
        ? 'margin-bottom: 1rem; padding-left: 0; list-style: none;' 
        : 'margin-bottom: 1rem; padding-left: 1.5rem; list-style-type: disc;';
      result.push(`<ul style="${ulStyle}">${listItems.join('')}</ul>`);
    }
    
    return result.join('\n');
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
    <div className="w-full max-w-3xl mx-auto lg:px-0">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 sm:mb-8 mt-14 lg:mt-0 text-sm font-medium transition-colors touch-manipulation py-2 px-2 lg:-ml-2"
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

      <article className="prose prose-lg max-w-none" style={{ paddingLeft: '0', paddingRight: '0' }}>
        <header className="mb-8 sm:mb-12">
          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm mb-3 sm:mb-4" style={{ color: 'var(--theme-text-muted)' }}>
            <span className="font-medium">{item.source}</span>
            <span>·</span>
            <time>{formatDate(item.publishedAt)}</time>
          </div>
          
          <h1 
            className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight mb-4 sm:mb-6"
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
                className="text-xs sm:text-sm border px-3 sm:px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 touch-manipulation"
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
          <div className="mb-8 sm:mb-12">
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
            style={{ paddingLeft: '0', paddingRight: '0' }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="prose prose-lg max-w-none" style={{ paddingLeft: '0', paddingRight: '0' }}>
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

        {/* AI Features Row */}
        <div className="flex items-center gap-2 sm:gap-3 mb-6 flex-wrap mt-6 sm:mt-8">
          <button
            onClick={() => handleGenerateAIFeature('insightful-reply')}
            disabled={!!generatingFeature}
            className="text-sm border px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{
              borderColor: 'var(--theme-border)',
              backgroundColor: generatingFeature === 'insightful-reply' ? 'var(--theme-hover-bg)' : 'transparent',
              color: 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              if (!generatingFeature) {
                e.currentTarget.style.borderColor = 'var(--theme-accent)';
                e.currentTarget.style.color = 'var(--theme-text)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }
            }}
            onMouseLeave={(e) => {
              if (!generatingFeature) {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.color = 'var(--theme-text-secondary)';
                e.currentTarget.style.backgroundColor = generatingFeature === 'insightful-reply' ? 'var(--theme-hover-bg)' : 'transparent';
              }
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {generatingFeature === 'insightful-reply' ? 'Generating...' : 'Insightful Reply'}
          </button>
          <button
            onClick={() => handleGenerateAIFeature('investor-analysis')}
            disabled={!!generatingFeature}
            className="text-sm border px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{
              borderColor: 'var(--theme-border)',
              backgroundColor: generatingFeature === 'investor-analysis' ? 'var(--theme-hover-bg)' : 'transparent',
              color: 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              if (!generatingFeature) {
                e.currentTarget.style.borderColor = 'var(--theme-accent)';
                e.currentTarget.style.color = 'var(--theme-text)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }
            }}
            onMouseLeave={(e) => {
              if (!generatingFeature) {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.color = 'var(--theme-text-secondary)';
                e.currentTarget.style.backgroundColor = generatingFeature === 'investor-analysis' ? 'var(--theme-hover-bg)' : 'transparent';
              }
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {generatingFeature === 'investor-analysis' ? 'Generating...' : 'Investor Analysis'}
          </button>
          <button
            onClick={() => handleGenerateAIFeature('founder-implications')}
            disabled={!!generatingFeature}
            className="text-sm border px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{
              borderColor: 'var(--theme-border)',
              backgroundColor: generatingFeature === 'founder-implications' ? 'var(--theme-hover-bg)' : 'transparent',
              color: 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              if (!generatingFeature) {
                e.currentTarget.style.borderColor = 'var(--theme-accent)';
                e.currentTarget.style.color = 'var(--theme-text)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }
            }}
            onMouseLeave={(e) => {
              if (!generatingFeature) {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.color = 'var(--theme-text-secondary)';
                e.currentTarget.style.backgroundColor = generatingFeature === 'founder-implications' ? 'var(--theme-hover-bg)' : 'transparent';
              }
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {generatingFeature === 'founder-implications' ? 'Generating...' : 'Founder Implications'}
          </button>
        </div>

        {/* Display AI Feature Results */}
        {aiFeatureResults['insightful-reply'] && (
          <div 
            className="border-l-4 pl-6 py-4 mb-6"
            style={{ 
              backgroundColor: 'var(--theme-hover-bg)', 
              borderColor: 'var(--theme-accent)',
              overflow: 'visible',
              maxHeight: 'none',
              height: 'auto'
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--theme-text-muted)' }}>Insightful Reply</p>
            <p 
              className="text-base m-0 whitespace-pre-wrap break-words"
              style={{ 
                color: 'var(--theme-text-secondary)',
                overflow: 'visible',
                wordWrap: 'break-word',
                overflowWrap: 'break-word'
              }}
            >
              {aiFeatureResults['insightful-reply'].replace(/["']/g, '').replace(/#\w+/g, '')}
            </p>
          </div>
        )}
        {aiFeatureResults['investor-analysis'] && (
          <div 
            className="border-l-4 pl-6 py-4 mb-6"
            style={{ 
              backgroundColor: 'var(--theme-hover-bg)', 
              borderColor: 'var(--theme-accent)',
              overflow: 'visible',
              maxHeight: 'none',
              height: 'auto'
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--theme-text-muted)' }}>Investor Analysis</p>
            <div 
              className="text-base break-words"
              style={{ 
                color: 'var(--theme-text-secondary)',
                overflow: 'visible',
                wordWrap: 'break-word',
                overflowWrap: 'break-word'
              }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(aiFeatureResults['investor-analysis'], true, true, true, false) }}
            />
          </div>
        )}
        {aiFeatureResults['founder-implications'] && (
          <div 
            className="border-l-4 pl-6 py-4 mb-6"
            style={{ 
              backgroundColor: 'var(--theme-hover-bg)', 
              borderColor: 'var(--theme-accent)',
              overflow: 'visible',
              maxHeight: 'none',
              height: 'auto'
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--theme-text-muted)' }}>Founder Implications</p>
            <div 
              className="text-base break-words"
              style={{ 
                color: 'var(--theme-text-secondary)',
                overflow: 'visible',
                wordWrap: 'break-word',
                overflowWrap: 'break-word'
              }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(aiFeatureResults['founder-implications'], false, false, false, true, true) }}
            />
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
