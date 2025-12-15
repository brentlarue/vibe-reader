import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FeedItem, Annotation } from '../types';
import { storage } from '../utils/storage';
import { summarizeItem } from '../services/aiSummarizer';
import { generateAIFeature, AIFeatureType } from '../services/aiFeatures';
import { createAnnotation, getAnnotationsForArticle } from '../utils/annotations';
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
  const location = useLocation();
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

  // Reading progress state
  const [readingProgress, setReadingProgress] = useState(0);
  const articleContentRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const notesSectionRef = useRef<HTMLDivElement>(null);

  // Highlight state
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [highlightBoxPosition, setHighlightBoxPosition] = useState<{ top: number; left: number } | null>(null);
  const [highlights, setHighlights] = useState<Annotation[]>([]);
  const highlightBoxRef = useRef<HTMLDivElement>(null);
  const hasScrolledToHighlightRef = useRef<boolean>(false);

  // Note state
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

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

  // Reading progress tracking (only on mobile/tablet)
  useEffect(() => {
    if (!articleRef.current || !item) {
      setReadingProgress(0);
      return;
    }

    const updateProgress = () => {
      const article = articleRef.current;
      if (!article) {
        setReadingProgress(0);
        return;
      }

      // Find the scrollable container (main element)
      const scrollContainer = document.querySelector('main') as HTMLElement;
      if (!scrollContainer) {
        setReadingProgress(0);
        return;
      }

      // Get scroll position of the main container
      const scrollTop = scrollContainer.scrollTop;
      const containerHeight = scrollContainer.clientHeight;
      
      // Get article position relative to the scroll container
      const articleRect = article.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      
      // Calculate article position within the scroll container
      // When scrollTop is 0, article top relative to container top
      const articleTopRelativeToContainer = articleRect.top - containerRect.top + scrollTop;
      const articleBottomRelativeToContainer = articleTopRelativeToContainer + articleRect.height;
      
      const articleLength = articleBottomRelativeToContainer - articleTopRelativeToContainer;
      
      if (articleLength <= 0) {
        setReadingProgress(0);
        return;
      }
      
      // Calculate progress: 
      // 0% when article top reaches container top (scrollTop = articleTopRelativeToContainer)
      // 100% when article bottom reaches container top (scrollTop + containerHeight = articleBottomRelativeToContainer)
      // This means scrollTop should be articleBottomRelativeToContainer - containerHeight for 100%
      
      // Current viewport bottom in scroll coordinates
      const viewportBottom = scrollTop + containerHeight;
      
      let progress = 0;
      
      // If article top hasn't reached container top yet
      if (scrollTop < articleTopRelativeToContainer) {
        progress = 0;
      } 
      // If article bottom has reached or passed container top (100% complete)
      else if (viewportBottom >= articleBottomRelativeToContainer) {
        progress = 100;
      } 
      // In the middle - calculate percentage
      else {
        // How much of the article has been scrolled past the start
        const scrolledPastStart = scrollTop - articleTopRelativeToContainer;
        // The scrollable distance is articleLength minus containerHeight (we stop when bottom is visible)
        const scrollableDistance = articleLength - containerHeight;
        
        if (scrollableDistance > 0) {
          progress = Math.min(100, Math.max(0, (scrolledPastStart / scrollableDistance) * 100));
        } else {
          // Article fits in viewport or is shorter
          progress = 100;
        }
      }
      
      setReadingProgress(progress);
    };

    // Find scroll container once
    const scrollContainer = document.querySelector('main') as HTMLElement;
    if (!scrollContainer) {
      return;
    }

    // Initial calculation with multiple attempts to ensure DOM is ready
    const initialTimeout1 = setTimeout(updateProgress, 100);
    const initialTimeout2 = setTimeout(updateProgress, 300);
    const initialTimeout3 = setTimeout(updateProgress, 600);
    
    // Listen to scroll on the main container
    scrollContainer.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress, { passive: true });
    
    // Use MutationObserver to detect when content changes
    const observer = new MutationObserver(() => {
      setTimeout(updateProgress, 100);
    });
    
    if (articleRef.current) {
      observer.observe(articleRef.current, {
        childList: true,
        subtree: true,
        attributes: false,
      });
    }

    return () => {
      clearTimeout(initialTimeout1);
      clearTimeout(initialTimeout2);
      clearTimeout(initialTimeout3);
      scrollContainer.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
      observer.disconnect();
    };
  }, [item, hasAttemptedLoad]);

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

      // Load highlights and notes for this article
      try {
        const articleAnnotations = await getAnnotationsForArticle(found.id);
        setHighlights(articleAnnotations.filter(a => a.type === 'highlight'));
        setNotes(articleAnnotations.filter(a => a.type === 'note'));
      } catch (error) {
        console.error('Error loading annotations:', error);
      }
      
      // Reset scroll flag when loading a new article
      hasScrolledToHighlightRef.current = false;
    };
    
    loadArticle();
  }, [id]);

  // Reload highlights and notes when annotations are updated (e.g., deleted from Notes page)
  useEffect(() => {
    if (!item) return;

    const handleUpdate = async () => {
      try {
        const articleAnnotations = await getAnnotationsForArticle(item.id);
        setHighlights(articleAnnotations.filter(a => a.type === 'highlight'));
        setNotes(articleAnnotations.filter(a => a.type === 'note'));
      } catch (error) {
        console.error('Error reloading annotations:', error);
      }
    };

    window.addEventListener('feedItemsUpdated', handleUpdate);
    return () => window.removeEventListener('feedItemsUpdated', handleUpdate);
  }, [item]);

  // Scroll to highlight when coming from Notes page (instant, no animation)
  // Only runs once per article load when location.state has scrollToHighlight
  useEffect(() => {
    // Don't scroll if we've already scrolled, or if there's no scroll target
    if (hasScrolledToHighlightRef.current || !item || !articleContentRef.current || !location.state) return;

    const state = location.state as { scrollToHighlight?: string; highlightId?: string };
    const scrollToHighlight = state?.scrollToHighlight;
    if (!scrollToHighlight) return;

    // Wait for content to be rendered with highlights, then scroll instantly
    const scrollToHighlightText = () => {
      if (!articleContentRef.current || hasScrolledToHighlightRef.current) return false;

      // Find all mark elements (highlights)
      const marks = articleContentRef.current.querySelectorAll('mark');
      
      for (const mark of Array.from(marks)) {
        const markText = mark.textContent?.trim() || '';
        const searchText = scrollToHighlight.trim();
        
        // Check if this mark contains the highlight text we're looking for
        if (markText.toLowerCase().includes(searchText.toLowerCase()) || 
            searchText.toLowerCase().includes(markText.toLowerCase())) {
          // Get the scroll container (main element)
          const scrollContainer = document.querySelector('main') as HTMLElement;
          
          if (scrollContainer) {
            // Calculate scroll position - get mark's position relative to article content
            const markRect = mark.getBoundingClientRect();
            const articleRect = articleContentRef.current.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const currentScroll = scrollContainer.scrollTop;
            
            // Calculate: mark position in article + article position in container + current scroll - offset
            const markOffsetInArticle = markRect.top - articleRect.top;
            const articleOffsetInContainer = articleRect.top - containerRect.top;
            const targetScroll = currentScroll + markOffsetInArticle + articleOffsetInContainer - 100;
            
            // Scroll instantly (no animation) - set directly
            scrollContainer.scrollTop = targetScroll;
          } else {
            // Fallback to window scrolling
            const markRect = mark.getBoundingClientRect();
            window.scrollTo({ top: window.scrollY + markRect.top - 100, behavior: 'auto' });
          }
          
          // Mark that we've scrolled so we don't scroll again
          hasScrolledToHighlightRef.current = true;
          
          // Highlight the mark briefly for visual feedback
          const originalBg = mark.style.backgroundColor;
          mark.style.backgroundColor = 'rgba(255, 235, 59, 0.6)';
          setTimeout(() => {
            mark.style.backgroundColor = originalBg;
          }, 1000);
          
          return true; // Found and scrolled
        }
      }
      return false; // Not found yet
    };

    // Try scrolling immediately and with delays to ensure content is rendered
    let scrolled = false;
    
    // Immediate attempt
    if (scrollToHighlightText()) {
      scrolled = true;
    }
    
    // Additional attempts with requestAnimationFrame for next paint
    const rafId = requestAnimationFrame(() => {
      if (!scrolled && !hasScrolledToHighlightRef.current && scrollToHighlightText()) {
        scrolled = true;
      }
    });
    
    // Fallback timeouts
    const timeout1 = setTimeout(() => {
      if (!scrolled && !hasScrolledToHighlightRef.current) {
        scrollToHighlightText();
      }
    }, 10);
    
    const timeout2 = setTimeout(() => {
      if (!scrolled && !hasScrolledToHighlightRef.current) {
        scrollToHighlightText();
      }
    }, 100);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [item, location.state]); // Removed 'highlights' from dependencies to prevent re-scrolling when highlights update

  // Scroll to note when coming from Notes page (instant, no animation)
  useEffect(() => {
    if (!item || !location.state) return;

    const state = location.state as { scrollToNote?: string; noteId?: string };
    const scrollToNoteId = state?.scrollToNote || state?.noteId;
    if (!scrollToNoteId) return;

    // Wait for notes to be loaded and rendered, then scroll instantly
    const scrollToNote = () => {
      if (!notesSectionRef.current) return false;

      // Find the note card with the matching ID
      const noteCards = notesSectionRef.current.querySelectorAll('[data-note-id]');
      
      for (const card of Array.from(noteCards)) {
        const cardNoteId = card.getAttribute('data-note-id');
        if (cardNoteId === scrollToNoteId) {
          // Get the scroll container (main element)
          const scrollContainer = document.querySelector('main') as HTMLElement;
          
          if (scrollContainer) {
            // Calculate scroll position - get card's position relative to notes section
            const cardRect = card.getBoundingClientRect();
            const notesRect = notesSectionRef.current.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const currentScroll = scrollContainer.scrollTop;
            
            // Calculate: card position in notes section + notes section position in container + current scroll - offset
            const cardOffsetInNotes = cardRect.top - notesRect.top;
            const notesOffsetInContainer = notesRect.top - containerRect.top;
            const targetScroll = currentScroll + cardOffsetInNotes + notesOffsetInContainer - 100;
            
            // Scroll instantly (no animation) - set directly
            scrollContainer.scrollTop = targetScroll;
          } else {
            // Fallback to window scrolling
            const cardRect = card.getBoundingClientRect();
            window.scrollTo({ top: window.scrollY + cardRect.top - 100, behavior: 'auto' });
          }
          
          // Briefly highlight the note card for visual feedback
          const originalBg = (card as HTMLElement).style.backgroundColor;
          (card as HTMLElement).style.backgroundColor = 'var(--theme-hover-bg)';
          setTimeout(() => {
            (card as HTMLElement).style.backgroundColor = originalBg;
          }, 1000);
          
          return true; // Found and scrolled
        }
      }
      return false; // Not found yet
    };

    // Try scrolling immediately and with delays to ensure content is rendered
    let scrolled = false;
    
    // Immediate attempt
    if (scrollToNote()) {
      scrolled = true;
    }
    
    // Additional attempts with requestAnimationFrame for next paint
    const rafId = requestAnimationFrame(() => {
      if (!scrolled && scrollToNote()) {
        scrolled = true;
      }
    });
    
    // Fallback timeouts
    const timeout1 = setTimeout(() => {
      if (!scrolled) {
        scrollToNote();
      }
    }, 10);
    
    const timeout2 = setTimeout(() => {
      if (!scrolled) {
        scrollToNote();
      }
    }, 100);

    const timeout3 = setTimeout(() => {
      if (!scrolled) {
        scrollToNote();
      }
    }, 500);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [item, notes, location.state]);

  // Handle text selection for highlighting
  useEffect(() => {
    if (!item || !articleContentRef.current) return;

    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectedText(null);
        setHighlightBoxPosition(null);
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length === 0) {
        setSelectedText(null);
        setHighlightBoxPosition(null);
        return;
      }

      // Don't show highlight box if selection is in inputs or buttons
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const parent = container.parentElement;
        if (parent && (parent.tagName === 'INPUT' || parent.tagName === 'TEXTAREA' || parent.tagName === 'BUTTON')) {
          setSelectedText(null);
          setHighlightBoxPosition(null);
          return;
        }
      }

      // Check if selection is within the article content
      if (!articleContentRef.current || !articleContentRef.current.contains(range.commonAncestorContainer)) {
        setSelectedText(null);
        setHighlightBoxPosition(null);
        return;
      }

      setSelectedText(selectedText);

      // Position the highlight box near the selection (viewport coordinates for fixed positioning)
      const rangeRect = range.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
      
      setHighlightBoxPosition({
        top: rangeRect.bottom + scrollTop + 8,
        left: rangeRect.left + scrollLeft + (rangeRect.width / 2) - 40,
      });
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (highlightBoxRef.current && !highlightBoxRef.current.contains(e.target as Node)) {
        // Clear selection if clicking outside
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (!articleContentRef.current?.contains(range.commonAncestorContainer)) {
            setSelectedText(null);
            setHighlightBoxPosition(null);
          }
        }
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    document.addEventListener('mousedown', handleClickOutside);
    const contentEl = articleContentRef.current;
    if (contentEl) {
      contentEl.addEventListener('mouseup', handleSelection);
    }

    return () => {
      document.removeEventListener('selectionchange', handleSelection);
      document.removeEventListener('mousedown', handleClickOutside);
      if (contentEl) {
        contentEl.removeEventListener('mouseup', handleSelection);
      }
    };
  }, [item]);

  // Handle creating a highlight
  const handleCreateHighlight = async () => {
    if (!item || !selectedText || !item.feedId) return;

    try {
      await createAnnotation(item.id, item.feedId, 'highlight', selectedText);
      
      // Reload highlights and notes
      const articleAnnotations = await getAnnotationsForArticle(item.id);
      setHighlights(articleAnnotations.filter(a => a.type === 'highlight'));
      setNotes(articleAnnotations.filter(a => a.type === 'note'));
      
      // Clear selection
      window.getSelection()?.removeAllRanges();
      setSelectedText(null);
      setHighlightBoxPosition(null);
    } catch (error) {
      console.error('Error creating highlight:', error);
    }
  };

  // Handle adding a note
  const handleAddNote = () => {
    setShowNoteInput(true);
    setNoteText('');
  };

  // Handle saving a note
  const handleSaveNote = async () => {
    if (!item || !noteText.trim() || !item.feedId || isSavingNote) return;

    setIsSavingNote(true);
    try {
      await createAnnotation(item.id, item.feedId, 'note', noteText.trim());
      setShowNoteInput(false);
      setNoteText('');
      
      // Reload notes to show the newly created note
      const articleAnnotations = await getAnnotationsForArticle(item.id);
      setNotes(articleAnnotations.filter(a => a.type === 'note'));
      
      // Trigger event to refresh Notes page if open
      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    } catch (error) {
      console.error('Error creating note:', error);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Handle canceling note input
  const handleCancelNote = () => {
    setShowNoteInput(false);
    setNoteText('');
  };

  // Apply highlights to content
  const applyHighlightsToContent = useCallback((htmlContent: string, highlights: Annotation[]): string => {
    if (!highlights || highlights.length === 0) return htmlContent;

    // Use DOM manipulation for safer highlighting
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
    const container = doc.body.firstChild as HTMLElement;
    
    if (!container) return htmlContent;

    // Sort highlights by length (longest first) to avoid partial matches
    const sortedHighlights = [...highlights].sort((a, b) => b.content.length - a.content.length);

    sortedHighlights.forEach(highlight => {
      const searchText = highlight.content.trim();
      if (!searchText) return;

      // Get all text nodes recursively
      const walker = doc.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: Text[] = [];
      let node;
      while (node = walker.nextNode()) {
        // Skip if already inside a mark tag
        let parent = node.parentElement;
        let isInsideMark = false;
        while (parent && parent !== container) {
          if (parent.tagName === 'MARK') {
            isInsideMark = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (!isInsideMark) {
          textNodes.push(node as Text);
        }
      }

      // Search and highlight
      textNodes.forEach(textNode => {
        const text = textNode.textContent || '';
        const searchLower = searchText.toLowerCase();
        const textLower = text.toLowerCase();
        const index = textLower.indexOf(searchLower);
        
        if (index !== -1) {
          const beforeText = text.substring(0, index);
          const matchText = text.substring(index, index + searchText.length);
          const afterText = text.substring(index + searchText.length);

          const mark = doc.createElement('mark');
          // Kindle-like transparent yellow highlight
          mark.style.backgroundColor = 'rgba(255, 235, 59, 0.35)';
          mark.style.padding = '2px 0';
          mark.style.borderRadius = '2px';
          // Ensure text color remains readable in all themes (especially dark)
          mark.style.color = 'inherit';
          mark.textContent = matchText;

          const fragment = doc.createDocumentFragment();
          if (beforeText) {
            fragment.appendChild(doc.createTextNode(beforeText));
          }
          fragment.appendChild(mark);
          if (afterText) {
            fragment.appendChild(doc.createTextNode(afterText));
          }

          textNode.parentNode?.replaceChild(fragment, textNode);
        }
      });
    });

    return container.innerHTML;
  }, []);

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

  const formatBookmarkedDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const hoursStr = String(hours);
    
    return `Bookmarked on ${day}.${month}.${year} at ${hoursStr}:${minutes} ${ampm}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const calculateReadTime = (content: string): string => {
    if (!content) return '1 min';
    
    // Strip HTML tags and get plain text
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Count words (split by whitespace)
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    
    // Average reading speed: 200 words per minute
    const wordsPerMinute = 200;
    const minutes = Math.max(1, Math.round(wordCount / wordsPerMinute));
    
    return minutes <= 1 ? `${minutes} min` : `${minutes} mins`;
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

  const handleReadingOrderChange = async (order: 'next' | 'later' | 'someday') => {
    try {
      const currentExplicit =
        item.status === 'saved' ? item.readingOrder || null : null;

      if (item.status === 'saved' && currentExplicit === order) {
        // Clicking the current category clears Later
        await storage.updateItemStatus(item.id, 'inbox');
        await storage.updateItemReadingOrder(item.id, null);
        setItem({ ...item, status: 'inbox', readingOrder: null });
      } else {
        // Ensure item is in Later
        if (item.status !== 'saved') {
          await storage.updateItemStatus(item.id, 'saved');
        }
        await storage.updateItemReadingOrder(item.id, order);
        setItem({ ...item, status: 'saved', readingOrder: order });
      }

      window.dispatchEvent(new CustomEvent('feedItemsUpdated'));
    } catch (error) {
      console.error('Error updating reading order:', error);
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

  // Process HTML content to make external links open in new tab
  const processExternalLinks = (html: string): string => {
    if (!html) return html;
    
    // Use DOMParser to safely parse and modify HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all anchor tags
    const links = doc.querySelectorAll('a[href]');
    
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      
      // Skip anchor links and javascript: links
      if (href.startsWith('#') || href.startsWith('javascript:')) {
        return;
      }
      
      // Add target="_blank" and rel="noopener noreferrer" to external links
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    
    // Get the processed HTML from the body
    return doc.body.innerHTML;
  };

  // Get content - prefer fullContent, fallback to contentSnippet
  const rawContent = item.fullContent || item.contentSnippet || '';
  const processedContent = processExternalLinks(rawContent);
  const content = applyHighlightsToContent(processedContent, highlights);
  const contentText = rawContent.replace(/<[^>]*>/g, '').trim(); // Strip HTML for comparison
  
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
    <>
      {/* Reading Progress Bar - only visible on mobile/tablet */}
      {item && (
        <div 
          className="lg:hidden" 
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            width: '100vw',
            height: '4px',
            zIndex: 99999,
            pointerEvents: 'none',
            margin: 0,
            padding: 0,
            backgroundColor: 'transparent',
          }}
        >
          <div 
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${readingProgress}%`,
              height: '4px',
              backgroundColor: 'var(--theme-button-bg)',
              transition: 'width 0.15s ease-out',
              minWidth: readingProgress > 0 ? '1px' : '0',
              opacity: 1,
            }}
          />
        </div>
      )}

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

      <article ref={articleRef} className="prose prose-lg max-w-none" style={{ paddingLeft: '0', paddingRight: '0' }}>
        <header className="mb-8 sm:mb-12">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm mb-3 sm:mb-4" style={{ color: 'var(--theme-text-muted)' }}>
            <span className="font-medium">{item.source}</span>
            <span>·</span>
            <time>{formatDate(item.publishedAt)}</time>
            <span>·</span>
            <span>{calculateReadTime(item.fullContent || item.contentSnippet || '')}</span>
          </div>
          
          <h1 
            className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight mb-4 sm:mb-6"
            style={{ color: 'var(--theme-text)' }}
          >
            {item.title}
          </h1>

          {item.status === 'bookmarked' && item.updatedAt && (
            <p 
              className="text-base italic mb-4 sm:mb-6"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              {formatBookmarkedDate(item.updatedAt)}
            </p>
          )}

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
            onAddNote={handleAddNote}
            showBottomBorder={true}
            onReadingOrderChange={handleReadingOrderChange}
          />
        </div>

        {hasMeaningfulContent ? (
          <div 
            ref={articleContentRef}
            className="article-content prose prose-lg max-w-none relative"
            style={{ paddingLeft: '0', paddingRight: '0', lineHeight: '1.75' }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div 
            ref={articleContentRef}
            className="prose prose-lg max-w-none" 
            style={{ paddingLeft: '0', paddingRight: '0', lineHeight: '1.75' }}
          >
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

        {/* Floating highlight action box */}
        {selectedText && highlightBoxPosition && (
          <div
            ref={highlightBoxRef}
            className="fixed z-50 flex items-center gap-2 px-3 py-2 rounded shadow-lg"
            style={{
              top: `${highlightBoxPosition.top}px`,
              left: `${highlightBoxPosition.left}px`,
              backgroundColor: 'var(--theme-card-bg)',
              border: '1px solid var(--theme-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCreateHighlight}
              className="flex items-center gap-2 px-2 py-1 rounded transition-colors touch-manipulation"
              style={{
                color: 'var(--theme-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Highlight"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="8" fill="#FFEB3B" />
              </svg>
              <span className="text-sm">Highlight</span>
            </button>
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
              dangerouslySetInnerHTML={{ __html: processExternalLinks(markdownToHtml(aiFeatureResults['investor-analysis'], true, true, true, false)) }}
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
              dangerouslySetInnerHTML={{ __html: processExternalLinks(markdownToHtml(aiFeatureResults['founder-implications'], false, false, false, true, true)) }}
            />
          </div>
        )}

        {/* Notes display section - shows all notes for this article */}
        {notes.length > 0 && (
          <div ref={notesSectionRef} className="mt-8 sm:mt-12">
            <h2 
              className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6"
              style={{ color: 'var(--theme-text)' }}
            >
              Notes
            </h2>
            <div className="space-y-4 sm:space-y-6">
              {notes.map((note) => (
                <div
                  key={note.id}
                  data-note-id={note.id}
                  className="p-4 border rounded"
                  style={{
                    borderColor: 'var(--theme-border)',
                    backgroundColor: 'var(--theme-card-bg)',
                  }}
                >
                  <p 
                    className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    {note.content}
                  </p>
                  <p 
                    className="text-xs sm:text-sm mt-3"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    {new Date(note.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note input section - appears at end of article */}
        {showNoteInput && (
          <div 
            className="mt-8 sm:mt-12 p-4 border rounded"
            style={{ 
              borderColor: 'var(--theme-border)',
              backgroundColor: 'var(--theme-card-bg)',
            }}
          >
            <label 
              className="block text-sm mb-2"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              Add note
            </label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full px-3 py-2 text-sm border focus:outline-none resize-none"
              style={{
                borderColor: 'var(--theme-border)',
                backgroundColor: 'var(--theme-bg)',
                color: 'var(--theme-text)',
                minHeight: '100px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-accent)';
                e.currentTarget.style.outline = '1px solid var(--theme-accent)';
                e.currentTarget.style.outlineOffset = '-1px';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.outline = 'none';
              }}
              placeholder="Write your note here..."
              disabled={isSavingNote}
              autoFocus
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleSaveNote}
                disabled={!noteText.trim() || isSavingNote}
                className="px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isSavingNote || !noteText.trim() ? 'var(--theme-border)' : 'var(--theme-button-bg)',
                  color: isSavingNote || !noteText.trim() ? 'var(--theme-text-muted)' : 'var(--theme-button-text)',
                }}
                onMouseEnter={(e) => {
                  if (!isSavingNote && noteText.trim()) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSavingNote && noteText.trim()) {
                    e.currentTarget.style.opacity = '1';
                  }
                }}
              >
                {isSavingNote ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancelNote}
                disabled={isSavingNote}
                className="px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  color: 'var(--theme-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isSavingNote) {
                    e.currentTarget.style.color = 'var(--theme-text)';
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSavingNote) {
                    e.currentTarget.style.color = 'var(--theme-text-secondary)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action bar below content */}
        <div className="mt-8">
          <ArticleActionBar 
            item={item} 
            onStatusChange={handleStatusChange} 
            onDelete={handleDelete}
            onAddNote={handleAddNote}
          />
        </div>
      </article>
      </div>

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
    </>
  );
}
