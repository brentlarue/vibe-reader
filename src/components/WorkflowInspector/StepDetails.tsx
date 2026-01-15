/**
 * Step Details Component
 * 
 * Displays detailed information about a workflow step.
 */

import { useState } from 'react';
import { WorkflowRunStep, WorkflowRun } from '../../types';

interface StepDetailsProps {
  step: WorkflowRunStep | null;
  run: WorkflowRun | null;
  workflowSlug: string;
  onRerunComplete?: (run: WorkflowRun) => void;
}

export default function StepDetails({ step, run: _run, workflowSlug: _workflowSlug, onRerunComplete: _onRerunComplete }: StepDetailsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['input', 'output']));

  if (!step) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--theme-text-muted)',
        }}
      >
        Select a step to view details
      </div>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'running':
        return 'var(--theme-accent)';
      case 'failed':
        return '#ef4444';
      default:
        return 'var(--theme-text-muted)';
    }
  };

  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        borderRadius: '8px',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          {step.stepName}
        </h3>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--theme-text-secondary)' }}>
          <span>Type: {step.stepType}</span>
          {step.model && <span>Model: {step.model}</span>}
          <span>
            Status:{' '}
            <span style={{ color: getStatusColor(step.status) }}>{step.status}</span>
          </span>
        </div>
      </div>

      {step.errorMessage && (
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
          <strong>Error:</strong> {step.errorMessage}
        </div>
      )}

      {step.tokenCount && (
        <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--theme-text-secondary)' }}>
          Tokens: {step.tokenCount.toLocaleString()} • Cost: ${step.cost?.toFixed(4) || '0.0000'}
        </div>
      )}

      {step.startedAt && step.finishedAt && (
          <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--theme-text-secondary)' }}>
            Duration: {Math.round((new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()) / 1000)}s
          </div>
        )}

        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {step.outputJson && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(step.outputJson, null, 2));
                alert('Copied to clipboard!');
              }}
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
              Copy Output
            </button>
          )}
          {step.outputJson && (
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(step.outputJson, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `step-${step.stepId}-output.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
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
          )}
        </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <button
            onClick={() => toggleSection('input')}
            style={{
              width: '100%',
              padding: '0.75rem',
              textAlign: 'left',
              backgroundColor: 'var(--theme-bg)',
              border: '1px solid var(--theme-border)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {expandedSections.has('input') ? '▼' : '▶'} Input
          </button>
          {expandedSections.has('input') && step.inputJson && (
            <pre
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                backgroundColor: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                overflow: 'auto',
                maxHeight: '300px',
                width: '100%',
                boxSizing: 'border-box',
                overflowWrap: 'break-word',
                wordWrap: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {JSON.stringify(step.inputJson, null, 2)}
            </pre>
          )}
        </div>

        <div>
          <button
            onClick={() => toggleSection('output')}
            style={{
              width: '100%',
              padding: '0.75rem',
              textAlign: 'left',
              backgroundColor: 'var(--theme-bg)',
              border: '1px solid var(--theme-border)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {expandedSections.has('output') ? '▼' : '▶'} Output
          </button>
          {expandedSections.has('output') && step.outputJson && (
            <pre
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                backgroundColor: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                overflow: 'auto',
                maxHeight: '300px',
                width: '100%',
                boxSizing: 'border-box',
                overflowWrap: 'break-word',
                wordWrap: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {JSON.stringify(step.outputJson, null, 2)}
            </pre>
          )}
        </div>

        {step.toolTraceJson && (
          <div>
            <button
              onClick={() => toggleSection('trace')}
              style={{
                width: '100%',
                padding: '0.75rem',
                textAlign: 'left',
                backgroundColor: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {expandedSections.has('trace') ? '▼' : '▶'} Tool Trace
            </button>
            {expandedSections.has('trace') && (
              <pre
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  backgroundColor: 'var(--theme-bg)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '300px',
                  width: '100%',
                  boxSizing: 'border-box',
                  overflowWrap: 'break-word',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(step.toolTraceJson, null, 2)}
              </pre>
            )}
          </div>
        )}

        {step.promptSystem && (
          <div>
            <button
              onClick={() => toggleSection('prompt')}
              style={{
                width: '100%',
                padding: '0.75rem',
                textAlign: 'left',
                backgroundColor: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {expandedSections.has('prompt') ? '▼' : '▶'} Prompts
            </button>
            {expandedSections.has('prompt') && (
              <div style={{ marginTop: '0.5rem' }}>
                {step.promptSystem && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)', marginBottom: '0.25rem' }}>
                      System Prompt:
                    </div>
                    <pre
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'var(--theme-bg)',
                        border: '1px solid var(--theme-border)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: '200px',
                        whiteSpace: 'pre-wrap',
                        width: '100%',
                        boxSizing: 'border-box',
                        overflowWrap: 'break-word',
                        wordWrap: 'break-word',
                      }}
                    >
                      {step.promptSystem}
                    </pre>
                  </div>
                )}
                {step.promptUser && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)', marginBottom: '0.25rem' }}>
                      User Prompt:
                    </div>
                    <pre
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'var(--theme-bg)',
                        border: '1px solid var(--theme-border)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: '200px',
                        whiteSpace: 'pre-wrap',
                        width: '100%',
                        boxSizing: 'border-box',
                        overflowWrap: 'break-word',
                        wordWrap: 'break-word',
                      }}
                    >
                      {step.promptUser}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
