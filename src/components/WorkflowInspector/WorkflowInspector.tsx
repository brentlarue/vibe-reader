/**
 * Workflow Inspector Component
 * 
 * Main component for viewing and running workflows.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Workflow, WorkflowRun, WorkflowRunStep } from '../../types';
import { getWorkflow, getWorkflowRuns, getWorkflowRun, seedWorkflows } from '../../utils/workflowApi';
import RunPanel from './RunPanel';
import RunList from './RunList';
import StepList from './StepList';
import StepDetails from './StepDetails';
import PromptEditor from './PromptEditor';
import ModelSelector from './ModelSelector';
import EvalPanel from './EvalPanel';
import { updateWorkflowDefinition } from '../../utils/workflowApi';

export default function WorkflowInspector() {
  const { slug } = useParams<{ slug: string }>();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [steps, setSteps] = useState<WorkflowRunStep[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflow();
  }, [slug]);

  useEffect(() => {
    if (workflow) {
      loadRuns();
    }
  }, [workflow]);

  useEffect(() => {
    if (selectedRunId) {
      loadRunDetails(selectedRunId);
      
      // Poll for updates if the run is still running
      const run = runs.find(r => r.id === selectedRunId);
      if (run && (run.status === 'running' || run.status === 'pending')) {
        const interval = setInterval(async () => {
          try {
            await loadRunDetails(selectedRunId);
            // Also reload runs to get updated status
            if (workflow) {
              const runsData = await getWorkflowRuns(workflow.slug, 20);
              setRuns(runsData);
            }
          } catch (err) {
            console.error('Failed to poll run details:', err);
          }
        }, 1000); // Poll every 1 second
        
        return () => clearInterval(interval);
      }
    }
  }, [selectedRunId, runs, workflow]);

  const loadWorkflow = async () => {
    if (!slug) return;

    setLoading(true);
    setError(null);

    try {
      const wf = await getWorkflow(slug);
      setWorkflow(wf);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        // Try to seed workflows
        try {
          await seedWorkflows();
          // Try to get workflow again after seeding
          try {
            const wf = await getWorkflow(slug);
            setWorkflow(wf);
          } catch (getErr) {
            // If still not found after seeding, it might already exist
            // Try one more time with a small delay (race condition handling)
            await new Promise(resolve => setTimeout(resolve, 100));
            const wf = await getWorkflow(slug);
            setWorkflow(wf);
          }
        } catch (seedErr) {
          // If seeding fails with duplicate key, workflow already exists
          if (seedErr instanceof Error && (seedErr.message.includes('duplicate key') || seedErr.message.includes('already exists'))) {
            try {
              const wf = await getWorkflow(slug);
              setWorkflow(wf);
            } catch (getErr) {
              setError('Workflow exists but could not be loaded');
            }
          } else {
            setError(seedErr instanceof Error ? seedErr.message : 'Failed to load workflow');
          }
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load workflow');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    if (!workflow) return;

    try {
      const runsData = await getWorkflowRuns(workflow.slug, 20);
      setRuns(runsData);
      if (runsData.length > 0 && !selectedRunId) {
        setSelectedRunId(runsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load runs:', err);
    }
  };

  const loadRunDetails = async (runId: string) => {
    try {
      const run = await getWorkflowRun(runId);
      // Steps are included in the run response
      if ((run as any).steps && Array.isArray((run as any).steps)) {
        setSteps((run as any).steps);
      } else {
        setSteps([]);
      }
    } catch (err) {
      console.error('Failed to load run details:', err);
      setSteps([]);
    }
  };

  const handleRunComplete = (run: WorkflowRun) => {
    setRuns([run, ...runs]);
    setSelectedRunId(run.id);
    loadRunDetails(run.id);
  };

  const handleRunSelect = (runId: string) => {
    setSelectedRunId(runId);
    setSelectedStepId(null);
  };

  const handleStepSelect = (stepId: string) => {
    setSelectedStepId(stepId);
  };

  const handleUpdateWorkflow = async (stepId: string, updates: { promptSystem?: string; promptUser?: string; model?: string }) => {
    if (!workflow) return;

    const definition = { ...workflow.definitionJson };
    const stepIndex = definition.steps.findIndex((s: any) => s.id === stepId);
    if (stepIndex === -1) return;

    const updatedStep = { ...definition.steps[stepIndex] };
    if (updates.promptSystem !== undefined) updatedStep.promptSystem = updates.promptSystem;
    if (updates.promptUser !== undefined) updatedStep.promptUser = updates.promptUser;
    if (updates.model !== undefined) updatedStep.model = updates.model;

    definition.steps[stepIndex] = updatedStep;

    const updated = await updateWorkflowDefinition(workflow.slug, definition);
    setWorkflow(updated);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
        Loading workflow...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
        Error: {error}
      </div>
    );
  }

  if (!workflow) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
        Workflow not found
      </div>
    );
  }

  const selectedStep = steps.find((s) => s.stepId === selectedStepId) || null;

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '1400px', 
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
        {workflow.name}
      </h1>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', 
        gap: '1.5rem', 
        marginBottom: '1.5rem',
        width: '100%',
      }}>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <RunPanel workflowSlug={workflow.slug} onRunComplete={handleRunComplete} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <RunList
            runs={runs}
            selectedRunId={selectedRunId}
            onRunSelect={handleRunSelect}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
          />
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'minmax(250px, 300px) minmax(0, 1fr)', 
        gap: '1.5rem',
        width: '100%',
      }}>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <StepList
            workflow={workflow}
            steps={steps}
            selectedStepId={selectedStepId}
            onStepSelect={handleStepSelect}
            currentRunStatus={runs.find(r => r.id === selectedRunId)?.status}
          />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden', width: '100%' }}>
          {selectedStepId && workflow.definitionJson.steps.find((s: any) => s.id === selectedStepId) && (
            <>
              {workflow.definitionJson.steps.find((s: any) => s.id === selectedStepId)?.type === 'llm' && (
                <>
                  <ModelSelector
                    key={`model-${selectedStepId}`}
                    step={workflow.definitionJson.steps.find((s: any) => s.id === selectedStepId)!}
                    onSave={async (stepId, model) => {
                      await handleUpdateWorkflow(stepId, { model });
                    }}
                  />
                  <PromptEditor
                    key={`prompt-${selectedStepId}`}
                    step={workflow.definitionJson.steps.find((s: any) => s.id === selectedStepId)!}
                    onSave={async (stepId, updates) => {
                      await handleUpdateWorkflow(stepId, updates);
                    }}
                  />
                </>
              )}
            </>
          )}
          <StepDetails
            step={selectedStep}
            run={runs.find((r) => r.id === selectedRunId) || null}
            workflowSlug={workflow.slug}
            onRerunComplete={handleRunComplete}
          />
        </div>
      </div>

      <div style={{ marginTop: '2.5rem', marginBottom: '1.5rem' }}>
        <EvalPanel workflowId={workflow.id} />
      </div>
    </div>
  );
}
