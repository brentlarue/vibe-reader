import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BriefPlayer from './BriefPlayer';
import { BriefRun } from '../types';

const WORKFLOW_STEPS = [
  { status: 'running', step: 'Refreshing feeds...' },
  { status: 'running', step: 'Generating summaries...' },
  { status: 'running', step: 'Creating compliment...' },
  { status: 'running', step: 'Generating audio...' },
  { status: 'running', step: 'Uploading to storage...' },
  { status: 'completed', step: 'Complete!' },
];

export default function BriefPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>(date || new Date().toISOString().split('T')[0]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [articleCount, setArticleCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [briefRuns, setBriefRuns] = useState<BriefRun[]>([]);

  // Update selected date when URL param changes
  useEffect(() => {
    if (date) {
      setSelectedDate(date);
    }
  }, [date]);

  // Load brief data when selected date changes
  useEffect(() => {
    loadBriefData(selectedDate);
  }, [selectedDate]);

  // Poll for brief run status when generating
  useEffect(() => {
    if (!isGenerating || !selectedDate) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/brief/runs/${selectedDate}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const run: BriefRun = await response.json();

          // Update generation step based on status
          if (run.status === 'running') {
            // Estimate step based on time elapsed or metadata
            const stepIndex = Math.min(
              Math.floor((Date.now() - new Date(run.startedAt || run.createdAt).getTime()) / 30000),
              WORKFLOW_STEPS.length - 2
            );
            setGenerationStep(WORKFLOW_STEPS[stepIndex]?.step || 'Processing...');
          } else if (run.status === 'completed') {
            setGenerationStep('Complete!');
            setIsGenerating(false);
            // Reload brief data to show player
            await loadBriefData(selectedDate);
          } else if (run.status === 'failed') {
            setGenerationStep('Failed');
            setIsGenerating(false);
            setError(run.errorMessage || 'Generation failed');
          }
        }
      } catch (err) {
        console.error('Error polling brief status:', err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [isGenerating, selectedDate]);

  // Load list of recent brief runs
  useEffect(() => {
    loadBriefRuns();
  }, []);

  const loadBriefRuns = async () => {
    try {
      const response = await fetch('/api/brief/runs?limit=30', {
        credentials: 'include',
      });
      if (response.ok) {
        const runs: BriefRun[] = await response.json();
        setBriefRuns(runs);
      }
    } catch (err) {
      console.error('Error loading brief runs:', err);
    }
  };

  const loadBriefData = async (briefDate: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setAudioUrl(null);

      // Get brief metadata
      const metadataResponse = await fetch(`/api/brief/metadata?date=${briefDate}`, {
        credentials: 'include',
      });

      if (!metadataResponse.ok) {
        if (metadataResponse.status === 404) {
          setIsLoading(false);
          return;
        }
        throw new Error('Failed to load brief metadata');
      }

      const metadata = await metadataResponse.json();
      setArticleCount(metadata.articleCount || 0);

      // Get brief run status
      const runsResponse = await fetch(`/api/brief/runs/${briefDate}`, {
        credentials: 'include',
      });

      if (runsResponse.ok) {
        const run: BriefRun = await runsResponse.json();

        // Check if metadata contains audio URL
        if (run.metadata?.audioUrl) {
          setAudioUrl(run.metadata.audioUrl);
          setIsLoading(false);
          return;
        }
      }

      // Fallback: Construct URL from date
      const storageUrlResponse = await fetch(`/api/brief/storage-url`, {
        credentials: 'include',
      });

      if (storageUrlResponse.ok) {
        const { storageUrl } = await storageUrlResponse.json();
        const constructedUrl = `${storageUrl}/${briefDate}.mp3`;
        setAudioUrl(constructedUrl);
      }
    } catch (err) {
      console.error('Error loading brief:', err);
      setError(err instanceof Error ? err.message : 'Failed to load daily brief');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setGenerationStep('Starting...');

      const response = await fetch('/api/brief/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ date: selectedDate }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start generation');
      }

      setGenerationStep('Refreshing feeds...');
      // Polling will handle status updates
    } catch (err) {
      console.error('Error generating brief:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate brief');
      setIsGenerating(false);
    }
  };

  const navigateToDate = (newDate: string) => {
    setSelectedDate(newDate);
    navigate(`/brief/${newDate}`);
  };

  const getPreviousDate = (currentDate: string): string => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const getNextDate = (currentDate: string): string => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  const hasBrief = audioUrl !== null;
  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const canGoNext = getNextDate(selectedDate) <= new Date().toISOString().split('T')[0];

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-8">
      {/* Header with date navigation */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--theme-text)' }}>
            Daily Brief
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateToDate(getPreviousDate(selectedDate))}
              className="px-3 py-1 text-sm border transition-colors touch-manipulation"
              style={{
                borderColor: 'var(--theme-border)',
                backgroundColor: 'transparent',
                color: 'var(--theme-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ← Previous
            </button>
            <span className="text-sm px-3" style={{ color: 'var(--theme-text-muted)' }}>
              {formatDate(selectedDate)}
            </span>
            <button
              onClick={() => navigateToDate(getNextDate(selectedDate))}
              disabled={!canGoNext}
              className="px-3 py-1 text-sm border transition-colors touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: 'var(--theme-border)',
                backgroundColor: 'transparent',
                color: 'var(--theme-text)',
              }}
              onMouseEnter={(e) => {
                if (canGoNext) {
                  e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
                  e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                }
              }}
              onMouseLeave={(e) => {
                if (canGoNext) {
                  e.currentTarget.style.borderColor = 'var(--theme-border)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              Next →
            </button>
            {!isToday && (
              <button
                onClick={() => navigateToDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-1 text-sm border transition-colors touch-manipulation ml-2"
                style={{
                  borderColor: 'var(--theme-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--theme-text)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--theme-text-muted)';
                  e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--theme-border)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !isGenerating && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--theme-text-muted)' }}></div>
            <p style={{ color: 'var(--theme-text-muted)' }}>Loading...</p>
          </div>
        </div>
      )}

      {/* Generation in progress */}
      {isGenerating && (
        <div 
          className="p-6 rounded-lg border mb-6"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: 'var(--theme-accent)' }}></div>
            <p className="font-medium" style={{ color: 'var(--theme-text)' }}>
              Generating brief...
            </p>
          </div>
          <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
            {generationStep || 'Starting...'}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !isGenerating && (
        <div 
          className="p-4 rounded-lg border mb-6"
          style={{
            backgroundColor: 'var(--theme-error-bg, rgba(220, 38, 38, 0.1))',
            borderColor: 'var(--theme-error-border, rgba(220, 38, 38, 0.3))',
            color: 'var(--theme-error-text, #dc2626)',
          }}
        >
          {error}
        </div>
      )}

      {/* No brief available - show generate button */}
      {!isLoading && !hasBrief && !isGenerating && (
        <div 
          className="p-8 rounded-lg border text-center"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <p className="text-lg mb-2 font-medium" style={{ color: 'var(--theme-text)' }}>
            No brief yet
          </p>
          <p className="text-sm mb-6" style={{ color: 'var(--theme-text-muted)' }}>
            Nothing ready for {formatDate(selectedDate)} yet.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-6 py-2 rounded transition-colors touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--theme-button-bg)',
              color: 'var(--theme-button-text)',
            }}
            onMouseEnter={(e) => {
              if (!isGenerating) {
                e.currentTarget.style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              if (!isGenerating) {
                e.currentTarget.style.opacity = '1';
              }
            }}
          >
            Generate Daily Brief
          </button>
        </div>
      )}

      {/* Brief player */}
      {!isLoading && hasBrief && !isGenerating && (
        <BriefPlayer
          audioUrl={audioUrl!}
          date={selectedDate}
          articleCount={articleCount}
        />
      )}

      {/* Recent briefs list */}
      {briefRuns.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--theme-text)' }}>
            Recent Briefs
          </h2>
          <div className="space-y-2">
            {briefRuns.slice(0, 10).map((run) => {
              const isSelected = run.date === selectedDate;
              const hasAudio = run.status === 'completed' && (run.metadata?.audioUrl || true);
              return (
                <button
                  key={run.id}
                  onClick={() => navigateToDate(run.date)}
                  className="w-full text-left p-3 rounded border transition-colors touch-manipulation"
                  style={{
                    backgroundColor: isSelected ? 'var(--theme-hover-bg)' : 'var(--theme-card-bg)',
                    borderColor: isSelected ? 'var(--theme-accent)' : 'var(--theme-border)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'var(--theme-card-bg)';
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--theme-text)' }}>
                        {formatDate(run.date)}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                        {run.metadata?.articleCount || 0} articles · {run.status}
                      </p>
                    </div>
                    {hasAudio && (
                      <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        ▶
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
