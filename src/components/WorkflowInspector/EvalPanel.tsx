/**
 * Eval Panel Component
 * 
 * Displays evaluation controls and results.
 */

import { useState, useEffect } from 'react';
import { WorkflowEval, WorkflowEvalRun } from '../../types';
import { getWorkflowEvals, runEval, getWorkflowEvalRuns, seedEval } from '../../utils/evalApi';

interface EvalPanelProps {
  workflowId: string;
}

export default function EvalPanel({ workflowId }: EvalPanelProps) {
  const [evals, setEvals] = useState<WorkflowEval[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowEvalRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workflowId) {
      loadEvals();
    } else {
      // Reset evals if workflowId is not available
      setEvals([]);
      setSelectedEvalId(null);
    }
  }, [workflowId]);

  useEffect(() => {
    if (selectedEvalId) {
      loadRuns();
    }
  }, [selectedEvalId]);

  const loadEvals = async () => {
    if (!workflowId) {
      return;
    }

    try {
      setError(null);
      const evalsData = await getWorkflowEvals(workflowId);
      setEvals(evalsData);
      if (evalsData.length > 0 && !selectedEvalId) {
        setSelectedEvalId(evalsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load evals:', err);
      // Don't set error state for 404s when no evals exist - that's expected
      if (err instanceof Error && !err.message.includes('404')) {
        setError(err.message);
      }
    }
  };

  const loadRuns = async () => {
    if (!selectedEvalId) return;
    try {
      const runsData = await getWorkflowEvalRuns(selectedEvalId, 10);
      setRuns(runsData);
    } catch (err) {
      console.error('Failed to load eval runs:', err);
    }
  };

  const handleRunEval = async () => {
    if (!selectedEvalId) return;

    setIsRunning(true);
    setError(null);

    try {
      const result = await runEval(selectedEvalId);
      setRuns([result, ...runs]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run eval');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSeedEval = async () => {
    setIsSeeding(true);
    setError(null);

    try {
      await seedEval();
      // Reload evals after seeding
      await loadEvals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed eval');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleExportResults = (run: WorkflowEvalRun) => {
    const blob = new Blob([JSON.stringify(run.resultsJson, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eval-${run.id}-results.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedEval = evals.find((e) => e.id === selectedEvalId);
  const latestRun = runs[0];

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
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
        Evaluations
      </h2>

      {evals.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--theme-text-muted)', marginBottom: '1rem' }}>
            No evaluations found. Seed the evaluation to get started.
          </div>
          <button
            onClick={handleSeedEval}
            disabled={isSeeding}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              backgroundColor: isSeeding ? 'var(--theme-text-muted)' : 'var(--theme-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: isSeeding ? 'not-allowed' : 'pointer',
            }}
          >
            {isSeeding ? 'Seeding Evaluation...' : 'Seed Evaluation'}
          </button>
          {error && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '4px',
                color: '#991b1b',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                color: 'var(--theme-text-secondary)',
              }}
            >
              Evaluation
            </label>
            <select
              value={selectedEvalId || ''}
              onChange={(e) => setSelectedEvalId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.875rem',
                backgroundColor: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: '4px',
                color: 'var(--theme-text)',
                marginBottom: '1rem',
              }}
            >
              {evals.map((evalItem) => (
                <option key={evalItem.id} value={evalItem.id}>
                  {evalItem.name} ({evalItem.casesJson.length} cases)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRunEval}
            disabled={isRunning || !selectedEvalId}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              backgroundColor: isRunning || !selectedEvalId ? 'var(--theme-text-muted)' : 'var(--theme-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: isRunning || !selectedEvalId ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
            }}
          >
            {isRunning ? 'Running Evaluations...' : 'Run Evaluations'}
          </button>

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

          {latestRun && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                  Latest Results
                </h3>
                <button
                  onClick={() => handleExportResults(latestRun)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--theme-bg)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '4px',
                    color: 'var(--theme-text)',
                    cursor: 'pointer',
                  }}
                >
                  Export JSON
                </button>
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: latestRun.passed ? '#d1fae5' : '#fee2e2',
                  border: `1px solid ${latestRun.passed ? '#10b981' : '#ef4444'}`,
                  borderRadius: '4px',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Overall Score: {latestRun.score?.toFixed(1)}%{' '}
                  {latestRun.passed ? '✓ PASSED' : '✗ FAILED'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)' }}>
                  {latestRun.resultsJson.caseResults.length} cases •{' '}
                  {latestRun.resultsJson.caseResults.filter((r: any) => r.passed).length} passed •{' '}
                  {latestRun.resultsJson.caseResults.filter((r: any) => !r.passed).length} failed
                </div>
              </div>

              <div
                style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '4px',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--theme-bg)', borderBottom: '1px solid var(--theme-border)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Case</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRun.resultsJson.caseResults.map((result: any, idx: number) => {
                      const caseDef = selectedEval?.casesJson.find((c: any) => c.id === result.caseId);
                      return (
                        <tr
                          key={result.caseId}
                          style={{
                            borderBottom: '1px solid var(--theme-border)',
                            backgroundColor: idx % 2 === 0 ? 'var(--theme-card-bg)' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ fontWeight: 500 }}>{caseDef?.name || result.caseId}</div>
                            {result.errors && result.errors.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                                {result.errors[0]}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <span
                              style={{
                                color: result.passed ? '#10b981' : '#ef4444',
                                fontWeight: 600,
                              }}
                            >
                              {result.passed ? '✓ Pass' : '✗ Fail'}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {result.score.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {runs.length > 1 && (
            <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--theme-text-muted)' }}>
              Showing latest run. {runs.length - 1} more run{runs.length - 1 !== 1 ? 's' : ''} available.
            </div>
          )}
        </>
      )}
    </div>
  );
}
