/**
 * Run List Component
 * 
 * Displays a list of workflow runs with status and metadata.
 */

import { WorkflowRun } from '../../types';

interface RunListProps {
  runs: WorkflowRun[];
  selectedRunId: string | null;
  onRunSelect: (runId: string) => void;
  filterStatus?: string;
  onFilterChange?: (status: string) => void;
}

export default function RunList({
  runs,
  selectedRunId,
  onRunSelect,
  filterStatus = 'all',
  onFilterChange,
}: RunListProps) {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'running':
        return 'var(--theme-accent)';
      case 'failed':
        return '#ef4444';
      case 'partial':
        return '#f59e0b';
      default:
        return 'var(--theme-text-muted)';
    }
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (startedAt: string | undefined, finishedAt: string | undefined): string => {
    if (!startedAt || !finishedAt) return 'N/A';
    const duration = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    const seconds = Math.round(duration / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const filteredRuns = filterStatus === 'all' 
    ? runs 
    : runs.filter(run => run.status === filterStatus);

  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Runs ({filteredRuns.length})</h3>
        {onFilterChange && (
          <select
            value={filterStatus}
            onChange={(e) => onFilterChange(e.target.value)}
            style={{
              padding: '0.5rem',
              fontSize: '0.875rem',
              backgroundColor: 'var(--theme-bg)',
              border: '1px solid var(--theme-border)',
              borderRadius: '4px',
              color: 'var(--theme-text)',
            }}
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="partial">Partial</option>
          </select>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredRuns.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
            No runs found
          </div>
        ) : (
          filteredRuns.map((run) => {
            const isSelected = selectedRunId === run.id;

            return (
              <button
                key={run.id}
                onClick={() => onRunSelect(run.id)}
                style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  backgroundColor: isSelected ? 'var(--theme-bg)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--theme-accent)' : 'var(--theme-border)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(run.status),
                    }}
                  />
                  <span style={{ fontSize: '0.875rem', fontWeight: isSelected ? 600 : 400 }}>
                    {run.status}
                  </span>
                  {run.actualCost && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', marginLeft: 'auto' }}>
                      ${run.actualCost.toFixed(4)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                  {formatDate(run.createdAt)} • {formatDuration(run.startedAt, run.finishedAt)}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
