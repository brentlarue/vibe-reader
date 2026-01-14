/**
 * Step List Component
 * 
 * Displays all steps in the workflow with their status.
 */

import { Workflow, WorkflowRunStep } from '../../types';

interface StepListProps {
  workflow: Workflow;
  steps: WorkflowRunStep[];
  selectedStepId: string | null;
  onStepSelect: (stepId: string) => void;
  currentRunStatus?: string;
}

export default function StepList({ workflow, steps, selectedStepId, onStepSelect, currentRunStatus }: StepListProps) {
  const definition = workflow.definitionJson;
  const workflowSteps = definition?.steps || [];

  const getStepStatus = (stepId: string): string => {
    const step = steps.find((s) => s.stepId === stepId);
    if (step) {
      return step.status;
    }
    // If run is running and we haven't seen this step yet, check if it's the next one
    if (currentRunStatus === 'running') {
      const stepIndex = workflowSteps.findIndex(s => s.id === stepId);
      const completedSteps = steps.filter(s => s.status === 'completed').length;
      if (stepIndex === completedSteps) {
        return 'running';
      }
    }
    return 'pending';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'running':
        return 'var(--theme-accent)';
      case 'failed':
        return '#ef4444';
      case 'skipped':
        return 'var(--theme-text-muted)';
      default:
        return 'var(--theme-text-muted)';
    }
  };

  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        borderRadius: '8px',
      }}
    >
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Steps</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {workflowSteps.map((step, idx) => {
          const status = getStepStatus(step.id);
          const isSelected = selectedStepId === step.id;

          return (
            <button
              key={step.id}
              onClick={() => onStepSelect(step.id)}
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
                <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                  {idx + 1}.
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: isSelected ? 600 : 400 }}>
                  {step.name}
                </span>
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(status),
                    marginLeft: 'auto',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                {step.type} {step.model && `• ${step.model}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
