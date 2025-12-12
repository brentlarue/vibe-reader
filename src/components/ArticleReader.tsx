import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FeedItem } from '../types';
import { storage } from '../utils/storage';
import { summarizeItem } from '../services/aiSummarizer';
import { generateAIFeature, AIFeatureType } from '../services/aiFeatures';
import ArticleActionBar from './ArticleActionBar';

// Session storage key for navigation context
const NAV_CONTEXT_KEY = 'articleNavContext';

interface NavContext {
  itemIds: string[];
  currentIndex: number;
  returnPath: string;
}

export default function ArticleReader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<FeedItem | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const summaryGenerationInProgress = useRef<string | null>(null);
  const [navContext, setNavContext] = useState<NavContext | null>(null);
  
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

  // Load navigation context from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem(NAV_CONTEXT_KEY);
    if (stored) {
      try {
        const context = JSON.parse(stored) as NavContext;
        setNavContext(context);
      } catch (e) {
        console.error('Failed to parse nav context:', e);
      }
    }
  }, []);

  // Navigate to next item in the list
  const navigateToNext = useCallback(() => {
    if (!navContext || !item) {
      // No context, go to inbox
      navigate('/inbox');
      return;
    }

    const currentIdx = navContext.itemIds.findIndex(itemId => 
      itemId === item.id || itemId === item.url
    );
    
    if (currentIdx === -1 || currentIdx >= navContext.itemIds.length - 1) {
      // No next item, return to list
      navigate(navContext.returnPath);
    } else {
      // Navigate to next item
      const nextId = navContext.itemIds[currentIdx + 1];
      // Update context with new index
      const newContext = { ...navContext, currentIndex: currentIdx + 1 };
      sessionStorage.setItem(NAV_CONTEXT_KEY, JSON.stringify(newContext));
      navigate(`/article/${encodeURIComponent(nextId)}`);
    }
  }, [navContext, item, navigate]);

  useEffect(() => {
    if (!id) return;

    // Reset state when ID changes
    setItem(null);
    setHasAttemptedLoad(false);

    const loadArticle = async () => {
      // Decode the ID in case it was URL-encoded in the route
      const decodedId = decodeURIComponent(id);
      
      // Try to find by exact ID match first
      let found = await storage.getFeedItem(decodedId);
      
      // If not found, try with encoded version
      if (!found && decodedId !== id) {
        found = await storage.getFeedItem(id);
      }
      
      // If still not found, try to find by URL (IDs might be URLs)
      if (!found) {
        console.warn('Article not found for id:', decodedId);
        const allItems = await storage.getFeedItems();
        
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
          setHasAttemptedLoad(true);
          setItem(null);
          return;
        }
        
        console.log('Found article by fallback search:', found.id, found.title);
      } else {
        console.log('Found article:', found.id, found.title);
      }
      
      // Use the found item directly - no need for an extra fetch since getFeedItem already returns fresh data
      setItem(found);
      setHasAttemptedLoad(true);
      // Load AI feature results from the item (persisted values)
      setAiFeatureResults({
        'insightful-reply': found.aiInsightfulReply || null,
        'investor-analysis': found.aiInvestorAnalysis || null,
        'founder-implications': found.aiFounderImplications || null,
      });
      setGeneratingFeature(null);
      summaryGenerationInProgress.current = null;
    };
    
    loadArticle();
  }, [id]);

  // Only show "not found" message if we've attempted to load and item is still null
  if (hasAttemptedLoad && !item) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: 'var(--theme-text-muted)' }}>Article not found</p>
      </div>
    );
  }

  // Don't render anything until we've attempted to load
  if (!hasAttemptedLoad || !item) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handleStatusChange = async (newStatus: FeedItem['status']) => {
    try {
      await storage.updateItemStatus(item.id, newStatus);
      setItem({ ...item, status: newStatus });
      // Trigger event for other components to update
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
      // Navigate to next item after action
      navigateToNext();
    } catch (error) {
      console.error('Error updating item status:', error);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this item?')) {
      await storage.removeFeedItem(item.id);
      // Trigger event for other components
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
      // Navigate to next item after deletion
      navigateToNext();
    }
  };

  // Helper function to check if summary needs to be generated
  const needsSummary = (item: FeedItem): boolean => {
    // Check if summary is missing, undefined, empty, or is the error message
    return !item.aiSummary || 
           item.aiSummary.trim() === '' || 
           item.aiSummary === 'Summary not available.';
  };

  const handleGenerateSummary = async () => {
    if (!item || isGeneratingSummary || summaryGenerationInProgress.current === item.id) {
      return;
    }

    summaryGenerationInProgress.current = item.id;
    setIsGeneratingSummary(true);
    
    try {
      const summary = await summarizeItem(item);
      
      // Debug: Log summary before storing
      console.log('AI summary before storing - Length (characters):', summary.length);
      console.log('AI summary full text:', summary);
      
      // Check if we're still on the same article
      const currentRouteId = id ? decodeURIComponent(id) : null;
      if (currentRouteId === item.id || currentRouteId === item.url || id === item.id) {
        // Use the new API to update the summary
        await storage.updateItemSummary(item.id, summary);
        
        console.log('AI summary stored - Length (characters):', summary.length);
        
        setItem({ ...item, aiSummary: summary });
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('Error details:', {
        message: errorMessage,
        stack: errorStack,
        itemId: item?.id,
        itemTitle: item?.title,
      });
      
      // Check if backend is not running
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('⚠️ Backend server is not running. Start it with: npm run dev:server or npm run dev:all');
      }
      
      // Set fallback error message
      const currentRouteId = id ? decodeURIComponent(id) : null;
      if (currentRouteId === item.id || currentRouteId === item.url || id === item.id) {
        try {
          await storage.updateItemSummary(item.id, 'Summary not available.');
          setItem({ ...item, aiSummary: 'Summary not available.' });
        } catch (updateError) {
          console.error('Error saving fallback summary:', updateError);
        }
      }
    } finally {
      // Only clear if this is still the current item being processed
      if (summaryGenerationInProgress.current === item.id) {
        summaryGenerationInProgress.current = null;
      }
      setIsGeneratingSummary(false);
    }
  };

  const handleGenerateAIFeature = async (featureType: AIFeatureType) => {
    if (!item || generatingFeature) {
      return;
    }

    setGeneratingFeature(featureType);
    
    try {
      const result = await generateAIFeature(item, featureType);
      
      // Update local state
      setAiFeatureResults(prev => ({
        ...prev,
        [featureType]: result
      }));
      
      // Persist to database
      await storage.updateItemAIFeature(item.id, featureType, result);
      console.log(`AI feature ${featureType} stored for item ${item.id}`);
      
      // Update the item state with the new AI feature
      const fieldMap: Record<AIFeatureType, keyof FeedItem> = {
        'insightful-reply': 'aiInsightfulReply',
        'investor-analysis': 'aiInvestorAnalysis',
        'founder-implications': 'aiFounderImplications',
      };
      setItem({ ...item, [fieldMap[featureType]]: result });
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

  // Navigate back to the list view (not browser history)
  const handleBack = () => {
    if (navContext?.returnPath) {
      navigate(navContext.returnPath);
    } else {
      navigate('/inbox');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto lg:px-0">
      <button
        onClick={handleBack}
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
            style={{ paddingLeft: '0', paddingRight: '0', lineHeight: '1.75' }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="prose prose-lg max-w-none" style={{ paddingLeft: '0', paddingRight: '0', lineHeight: '1.75' }}>
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

      {/* Floating next button - bottom right with safe area for iOS */}
      {/* z-30 so it appears under sidebar overlay (z-40) when open */}
      {navContext && navContext.itemIds.length > 1 && (
        <button
          onClick={navigateToNext}
          className="fixed bottom-8 right-6 sm:bottom-10 sm:right-8 z-30 p-2 rounded transition-colors touch-manipulation"
          style={{
            color: 'var(--theme-text-muted)',
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            // Extra bottom padding for iOS safe area
            marginBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-secondary)';
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'var(--theme-card-bg)';
          }}
          aria-label="Next article"
          title="Next article"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      )}
    </div>
  );
}
