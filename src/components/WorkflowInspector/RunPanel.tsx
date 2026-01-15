/**
 * Run Panel Component
 * 
 * Displays input form, run button, status, and final output.
 */

import { useState, useEffect } from 'react';
import { WorkflowRun } from '../../types';
import { runWorkflow, getWorkflowRun, cancelWorkflowRun } from '../../utils/workflowApi';

interface RunPanelProps {
  workflowSlug: string;
  onRunComplete: (run: WorkflowRun) => void;
}

export default function RunPanel({ workflowSlug, onRunComplete }: RunPanelProps) {
  const [interests, setInterests] = useState('');
  const [criteria, setCriteria] = useState('');
  const [searchLimit, setSearchLimit] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<WorkflowRun | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const handleRun = async () => {
    if (!interests.trim()) {
      setError('Please enter interests');
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const run = await runWorkflow(workflowSlug, {
        interests: interests.trim(),
        criteria: criteria.trim() || 'high quality, thought leadership',
        searchLimit,
      });

      setCurrentRun(run);
      onRunComplete(run);

      // If run is still running, start polling
      if (run.status === 'running' || run.status === 'pending') {
        const interval = setInterval(async () => {
          try {
            const updatedRun = await getWorkflowRun(run.id);
            setCurrentRun(updatedRun);
            
            // Find the current running step
            if ((updatedRun as any).steps && Array.isArray((updatedRun as any).steps)) {
              const runningStep = (updatedRun as any).steps.find((s: any) => s.status === 'running');
              if (runningStep) {
                setCurrentStep(runningStep.stepName || runningStep.stepId);
              } else {
                setCurrentStep(null);
              }
            }
            
            if (updatedRun.status === 'completed' || updatedRun.status === 'failed' || updatedRun.status === 'cancelled') {
              clearInterval(interval);
              setPollingInterval(null);
              setIsRunning(false);
              onRunComplete(updatedRun);
            }
          } catch (err) {
            console.error('Failed to poll run status:', err);
          }
        }, 1000); // Poll every 1 second for better real-time updates
        setPollingInterval(interval);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run workflow');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!currentRun || (currentRun.status !== 'running' && currentRun.status !== 'pending')) {
      return;
    }

    setIsCancelling(true);
    setError(null);

    try {
      const cancelledRun = await cancelWorkflowRun(currentRun.id);
      setCurrentRun(cancelledRun);
      setIsRunning(false);
      
      // Stop polling
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
      
      onRunComplete(cancelledRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel workflow');
    } finally {
      setIsCancelling(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const statusColor = isRunning
    ? 'var(--theme-accent)'
    : currentRun?.status === 'completed'
    ? '#10b981'
    : currentRun?.status === 'failed'
    ? '#ef4444'
    : currentRun?.status === 'cancelled'
    ? '#f59e0b'
    : 'var(--theme-text-muted)';

  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        borderRadius: '8px',
        marginBottom: '1.5rem',
      }}
    >
      <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: 600 }}>
        Run Workflow
      </h2>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            color: 'var(--theme-text-secondary)',
          }}
        >
          Interests *
        </label>
        <textarea
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          placeholder="e.g., AI, machine learning, thought leadership"
          rows={3}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '0.875rem',
            backgroundColor: 'var(--theme-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: '4px',
            color: 'var(--theme-text)',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            color: 'var(--theme-text-secondary)',
          }}
        >
          Criteria (optional)
        </label>
        <textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder="e.g., contrarian views, original content, high signal"
          rows={2}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '0.875rem',
            backgroundColor: 'var(--theme-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: '4px',
            color: 'var(--theme-text)',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            color: 'var(--theme-text-secondary)',
          }}
        >
          Search Limit
        </label>
        <input
          type="number"
          value={searchLimit}
          onChange={(e) => setSearchLimit(parseInt(e.target.value) || 10)}
          min={1}
          max={50}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '0.875rem',
            backgroundColor: 'var(--theme-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: '4px',
            color: 'var(--theme-text)',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={handleRun}
          disabled={isRunning}
          style={{
            flex: 1,
            padding: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            backgroundColor: isRunning ? 'var(--theme-text-muted)' : 'var(--theme-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning ? 'Running...' : 'Run Workflow'}
        </button>
        {currentRun && (currentRun.status === 'running' || currentRun.status === 'pending') && (
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              backgroundColor: isCancelling ? 'var(--theme-text-muted)' : '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: isCancelling ? 'not-allowed' : 'pointer',
            }}
          >
            {isCancelling ? 'Cancelling...' : 'Stop'}
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '4px',
            color: '#991b1b',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {currentRun && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: statusColor,
              }}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--theme-text-secondary)' }}>
              Status: <strong>{currentRun.status}</strong>
              {currentStep && (
                <span style={{ marginLeft: '1rem', color: 'var(--theme-accent)' }}>
                  • Step: {currentStep}
                </span>
              )}
            </span>
            {currentRun.actualCost && (
              <span style={{ fontSize: '0.875rem', color: 'var(--theme-text-muted)', marginLeft: 'auto' }}>
                Cost: ${currentRun.actualCost.toFixed(4)}
              </span>
            )}
          </div>

          {currentRun.outputJson && (currentRun.outputJson as { feeds?: unknown[] }).feeds && (
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Results ({((currentRun.outputJson as { feeds?: unknown[] }).feeds || []).length} feeds)
              </h3>
              <div
                style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  padding: '0.75rem',
                  backgroundColor: 'var(--theme-bg)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '4px',
                }}
              >
                {(currentRun.outputJson.feeds as any[]).map((feed: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      backgroundColor: 'var(--theme-card-bg)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                      {feed.authorOrBrand || feed.name}
                    </div>
                    {feed.description && (
                      <div style={{ fontSize: '0.875rem', color: 'var(--theme-text-secondary)', marginBottom: '0.5rem' }}>
                        {feed.description}
                      </div>
                    )}
                    {feed.rssUrl && (
                      <a
                        href={feed.rssUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--theme-accent)',
                          textDecoration: 'none',
                        }}
                      >
                        {feed.rssUrl}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
