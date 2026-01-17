import { useState, useEffect, useCallback, useRef } from 'react';
import BriefPlayer from './BriefPlayer';
import { BriefRun, FeedItem } from '../types';

const WORKFLOW_STEPS = [
  { status: 'running', step: 'Refreshing feeds...' },
  { status: 'running', step: 'Generating summaries...' },
  { status: 'running', step: 'Creating compliment...' },
  { status: 'running', step: 'Generating audio...' },
  { status: 'running', step: 'Uploading to storage...' },
  { status: 'completed', step: 'Complete!' },
];

interface BriefCard {
  date: string;
  run: BriefRun | null;
  audioUrl: string | null;
  articleCount: number;
  thumbnail: string | null;
  items: FeedItem[];
  duration?: number | null; // Duration in seconds, loaded from audio file
}

// Extract first image from HTML content
const extractFirstImage = (html: string): string | null => {
  if (!html) return null;
  
  // Try to find img tags
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }
  
  // Try alternative img syntax
  const imgMatch2 = html.match(/<img[^>]+src=([^\s>]+)/i);
  if (imgMatch2 && imgMatch2[1]) {
    return imgMatch2[1].replace(/["']/g, '');
  }
  
  return null;
};

// Get audio duration from URL by loading metadata
const getAudioDuration = (audioUrl: string): Promise<number | null> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        resolve(audio.duration);
      } else {
        resolve(null);
      }
      cleanup();
    };
    
    const handleError = () => {
      resolve(null);
      cleanup();
    };
    
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.src = '';
    };
    
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    
    // Set timeout to avoid hanging
    setTimeout(() => {
      if (audio.readyState === 0) {
        resolve(null);
        cleanup();
      }
    }, 5000); // 5 second timeout
    
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audio.src = audioUrl;
  });
};

export default function BriefPage() {
  const [briefs, setBriefs] = useState<BriefCard[]>([]);
  const [selectedBrief, setSelectedBrief] = useState<BriefCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef<HTMLDivElement>(null);

  const LIMIT = 10;

  // Generate mock sample data for dev only
  const generateMockBriefs = useCallback((): BriefCard[] => {
    const hostname = window.location.hostname;
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local') || hostname.includes('dev');
    
    if (!isDev) return [];

    const mockBriefs: BriefCard[] = [];
    const today = new Date();
    
    for (let i = 1; i <= 12; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      mockBriefs.push({
        date: dateStr,
        run: {
          id: `mock-${dateStr}`,
          date: dateStr,
          status: 'completed',
          metadata: {
            articleCount: Math.floor(Math.random() * 10) + 3,
            audioUrl: `https://example.com/audio-briefs/${dateStr}.mp3`,
          },
          createdAt: date.toISOString(),
          updatedAt: date.toISOString(),
          startedAt: date.toISOString(),
          completedAt: date.toISOString(),
        },
        audioUrl: `https://example.com/audio-briefs/${dateStr}.mp3`,
        articleCount: Math.floor(Math.random() * 10) + 3,
        thumbnail: `https://picsum.photos/seed/${dateStr}/400/400`,
        items: [],
      });
    }
    
    return mockBriefs;
  }, []);

  // Load briefs
  const loadBriefs = useCallback(async (startOffset: number = 0, append: boolean = false) => {
    try {
      if (!append) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      // Get recent brief runs
      const runsResponse = await fetch(`/api/brief/runs?limit=${LIMIT}&offset=${startOffset}`, {
        credentials: 'include',
      });

      if (!runsResponse.ok) {
        throw new Error('Failed to load briefs');
      }

      const runs: BriefRun[] = await runsResponse.json();
      
      if (runs.length < LIMIT) {
        setHasMore(false);
      }

      // Get storage URL for constructing audio URLs
      const storageUrlResponse = await fetch('/api/brief/storage-url', {
        credentials: 'include',
      });
      const storageUrl = storageUrlResponse.ok ? (await storageUrlResponse.json()).storageUrl : null;

      // Load items and metadata for each brief
      const briefCards: BriefCard[] = await Promise.all(
        runs.map(async (run) => {
          // Try to get items for this date
          let items: FeedItem[] = [];
          let articleCount = 0;
          let thumbnail: string | null = null;

          try {
            const itemsResponse = await fetch(`/api/brief/items?date=${run.date}`, {
              credentials: 'include',
            });
            if (itemsResponse.ok) {
              items = await itemsResponse.json();
              articleCount = items.length;

              // Extract first image from items
              for (const item of items) {
                const img = extractFirstImage(item.fullContent || item.contentSnippet || '');
                if (img) {
                  thumbnail = img;
                  break;
                }
              }
            }
          } catch (err) {
            console.error('Error loading items for brief:', run.date, err);
          }

          // Determine audio URL
          let audioUrl: string | null = null;
          if (run.metadata?.audioUrl) {
            audioUrl = run.metadata.audioUrl;
          } else if (storageUrl && run.status === 'completed') {
            audioUrl = `${storageUrl}/${run.date}.mp3`;
          }

          // Get audio duration from the file itself (if audioUrl exists)
          let duration: number | null = null;
          if (audioUrl) {
            try {
              duration = await getAudioDuration(audioUrl);
            } catch (err) {
              console.error(`[BriefPage] Error getting duration for ${run.date}:`, err);
              duration = null;
            }
          }

          return {
            date: run.date,
            run,
            audioUrl,
            articleCount: run.metadata?.articleCount || articleCount,
            thumbnail,
            items,
            duration,
          };
        })
      );

      if (append) {
        setBriefs((prev) => [...prev, ...briefCards]);
      } else {
        // Merge with mock briefs in dev mode
        const mockBriefs = generateMockBriefs();
        const allBriefs = [...briefCards, ...mockBriefs];
        
        // Remove duplicates by date (real briefs take priority)
        const dateMap = new Map<string, BriefCard>();
        allBriefs.forEach((brief) => {
          if (!dateMap.has(brief.date)) {
            dateMap.set(brief.date, brief);
          }
        });
        
        setBriefs(Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date)));
      }

      setOffset(startOffset + briefCards.length);
    } catch (err) {
      console.error('Error loading briefs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load briefs');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [generateMockBriefs]);

  // Initial load
  useEffect(() => {
    loadBriefs(0, false);
  }, [loadBriefs]);

  // Lazy load on scroll
  useEffect(() => {
    if (!hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadBriefs(offset, true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadingRef.current) {
      observer.observe(loadingRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, offset, loadBriefs]);

  // Poll for brief run status when generating
  useEffect(() => {
    if (!isGenerating || !generatingDate) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/brief/runs/${generatingDate}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const run: BriefRun = await response.json();

          // Update generation step based on status
          if (run.status === 'running') {
            const stepIndex = Math.min(
              Math.floor((Date.now() - new Date(run.startedAt || run.createdAt).getTime()) / 30000),
              WORKFLOW_STEPS.length - 2
            );
            setGenerationStep(WORKFLOW_STEPS[stepIndex]?.step || 'Processing...');
          } else if (run.status === 'completed') {
            setGenerationStep('Complete!');
            setIsGenerating(false);
            setGeneratingDate(null);
            // Reload briefs
            await loadBriefs(0, false);
          } else if (run.status === 'failed') {
            setGenerationStep('Failed');
            setIsGenerating(false);
            setGeneratingDate(null);
            setError(run.errorMessage || 'Generation failed');
          }
        }
      } catch (err) {
        console.error('Error polling brief status:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isGenerating, generatingDate, loadBriefs]);

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setGenerationStep('Starting...');

      // Generate yesterday's brief (not today's - today's news isn't complete yet)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      setGeneratingDate(yesterdayStr);
      
      const response = await fetch('/api/brief/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ date: yesterdayStr }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle 409 Conflict (brief already exists with same article count)
        if (response.status === 409) {
          throw new Error(errorData.message || `Brief already exists for ${yesterdayStr}`);
        }
        
        throw new Error(errorData.error || 'Failed to start generation');
      }

      setGenerationStep('Refreshing feeds...');
    } catch (err) {
      console.error('Error generating brief:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate brief');
      setIsGenerating(false);
      setGeneratingDate(null);
    }
  };

  const handleBriefClick = (brief: BriefCard) => {
    if (brief.audioUrl) {
      setSelectedBrief(brief);
    }
  };

  // Format day name (e.g., "Monday" or "Yesterday")
  const formatDayName = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
      });
    }
  };

  // Format full date (e.g., "January 16, 2026")
  const formatDateFull = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format duration in seconds to "X min" or "X:XX"
  const formatDuration = (seconds: number | string | undefined | null): string | null => {
    // Convert to number if string
    const numSeconds = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
    
    if (!numSeconds || isNaN(numSeconds) || numSeconds <= 0) return null;
    
    const mins = Math.floor(numSeconds / 60);
    const secs = Math.floor(numSeconds % 60);
    
    if (mins === 0) {
      return `${secs}s`;
    } else if (secs === 0) {
      return `${mins} min`;
    } else {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  };

  // If a brief is selected, show player
  if (selectedBrief) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-14 lg:mt-0 pb-6 sm:pb-8 lg:pb-12">
        <BriefPlayer
          audioUrl={selectedBrief.audioUrl!}
          date={selectedBrief.date}
          articleCount={selectedBrief.articleCount}
          thumbnail={selectedBrief.thumbnail}
          onClose={() => setSelectedBrief(null)}
          onDelete={async () => {
            if (!confirm(`Are you sure you want to delete the brief for ${formatDateFull(selectedBrief.date)}?`)) {
              return;
            }

            try {
              const response = await fetch(`/api/brief/${selectedBrief.date}`, {
                method: 'DELETE',
                credentials: 'include',
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to delete brief');
              }

              // Close player and reload briefs
              setSelectedBrief(null);
              await loadBriefs(0, false);
            } catch (err) {
              console.error('Error deleting brief:', err);
              setError(err instanceof Error ? err.message : 'Failed to delete brief');
            }
          }}
        />
      </div>
    );
  }

  // Sort briefs by date (most recent first)
  const sortedBriefs = briefs.length > 0 ? [...briefs].sort((a, b) => b.date.localeCompare(a.date)) : [];

  return (
    <div className="w-full max-w-3xl mx-auto mt-14 lg:mt-0 pb-6 sm:pb-8 lg:pb-12">
      {/* Header with Generate button */}
      <div className="flex items-center justify-between mb-8 sm:mb-12">
        <h1 
          className="text-2xl sm:text-3xl font-bold"
          style={{ color: 'var(--theme-text)' }}
        >
          Daily Brief
        </h1>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-4 py-2 text-sm font-medium border transition-colors touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'transparent',
            borderColor: 'var(--theme-border)',
            color: 'var(--theme-text-secondary)',
          }}
          onMouseEnter={(e) => {
            if (!isGenerating) {
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
              e.currentTarget.style.color = 'var(--theme-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isGenerating) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'var(--theme-border)';
              e.currentTarget.style.color = 'var(--theme-text-secondary)';
            }
          }}
        >
          {isGenerating ? 'Generating...' : "Generate yesterday's brief"}
        </button>
      </div>

      {/* Generation progress */}
      {isGenerating && (
        <div
          className="p-4 border mb-6"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: 'var(--theme-accent)' }}></div>
            <p className="font-medium" style={{ color: 'var(--theme-text)' }}>
              {generationStep || 'Starting...'}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="p-4 border mb-6"
          style={{
            backgroundColor: 'var(--theme-error-bg, rgba(220, 38, 38, 0.1))',
            borderColor: 'var(--theme-error-border, rgba(220, 38, 38, 0.3))',
            color: 'var(--theme-error-text, #dc2626)',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--theme-text-muted)' }}></div>
            <p style={{ color: 'var(--theme-text-muted)' }}>Loading briefs...</p>
          </div>
        </div>
      )}

      {/* Medium-style card list */}
      {!isLoading && sortedBriefs.length > 0 && (
        <div>
          {sortedBriefs.map((brief) => (
            <button
              key={brief.date}
              onClick={() => handleBriefClick(brief)}
              disabled={!brief.audioUrl}
              className="w-full text-left py-6 sm:py-8 border-b transition-opacity touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed group"
              style={{ 
                color: 'var(--theme-text)',
                borderColor: 'var(--theme-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              <div className="flex gap-4 lg:gap-6">
                {/* Text content - left side */}
                <div className="flex-1 min-w-0">
                  {/* Day name (e.g., "Monday" or "Yesterday") */}
                  <div 
                    className="text-sm mb-2"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    {formatDayName(brief.date)}
                  </div>

                  {/* Title - Full date (e.g., "January 16, 2026") */}
                  <h2 
                    className="text-xl sm:text-2xl font-bold mb-3 leading-tight"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    {formatDateFull(brief.date)}
                  </h2>

                  {/* Metadata line: article count, duration, and play button */}
                  <div 
                    className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-sm"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <span>{brief.articleCount} {brief.articleCount === 1 ? 'article' : 'articles'}</span>
                    {(() => {
                      // Use duration from metadata first, fallback to duration loaded from audio file
                      const duration = brief.run?.metadata?.totalDuration || brief.duration;
                      const formattedDuration = formatDuration(duration);
                      return formattedDuration ? (
                        <>
                          <span>·</span>
                          <span>{formattedDuration}</span>
                        </>
                      ) : null;
                    })()}
                    {brief.audioUrl && (
                      <>
                        <span>·</span>
                        <span 
                          className="font-medium transition-colors"
                          style={{ color: 'var(--theme-accent)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '0.8';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBriefClick(brief);
                          }}
                        >
                          ▶ Play
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Thumbnail - right side, 3x2 landscape - no hover effects */}
                {brief.thumbnail && (
                  <div 
                    className="flex-shrink-0 w-32 sm:w-40 lg:w-48 aspect-[3/2] overflow-hidden"
                    style={{ backgroundColor: 'var(--theme-border)' }}
                  >
                    <img
                      src={brief.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ pointerEvents: 'none' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Loading more indicator */}
      {isLoadingMore && (
        <div ref={loadingRef} className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-2" style={{ borderColor: 'var(--theme-text-muted)' }}></div>
            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Loading more...</p>
          </div>
        </div>
      )}

      {/* No briefs state */}
      {!isLoading && sortedBriefs.length === 0 && (
        <div className="text-center py-12">
          <p className="text-lg mb-2 font-medium" style={{ color: 'var(--theme-text)' }}>
            No briefs yet
          </p>
          <p className="text-sm mb-6" style={{ color: 'var(--theme-text-muted)' }}>
            Generate your first daily brief to get started.
          </p>
        </div>
      )}
    </div>
  );
}
