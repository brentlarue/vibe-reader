/**
 * Model Selector Component
 * 
 * Allows changing the model for LLM steps.
 */

import { useState, useEffect } from 'react';
import { StepDefinition } from '../../types';

const AVAILABLE_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o', cost: '$2.50/$10 per 1M tokens' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', cost: '$0.15/$0.60 per 1M tokens' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', cost: '$10/$30 per 1M tokens' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', cost: '$0.50/$1.50 per 1M tokens' },
];

interface ModelSelectorProps {
  step: StepDefinition;
  onSave: (stepId: string, model: string) => Promise<void>;
}

export default function ModelSelector({ step, onSave }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState(step.model || 'gpt-4o-mini');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Update state when step changes
  useEffect(() => {
    setSelectedModel(step.model || 'gpt-4o-mini');
    setSaveStatus('idle'); // Reset save status when step changes
  }, [step.id, step.model]);

  if (step.type !== 'llm') {
    return null;
  }

  const selectedModelInfo = AVAILABLE_MODELS.find((m) => m.value === selectedModel);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      await onSave(step.id, selectedModel);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      console.error('Failed to save model:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        borderRadius: '8px',
        marginBottom: '1rem',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--theme-text-secondary)',
            }}
          >
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '0.875rem',
              backgroundColor: 'var(--theme-bg)',
              border: '1px solid var(--theme-border)',
              borderRadius: '4px',
              color: 'var(--theme-text)',
            }}
          >
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
          {selectedModelInfo && (
            <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', marginTop: '0.25rem' }}>
              {selectedModelInfo.cost}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || selectedModel === step.model}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            backgroundColor:
              isSaving || selectedModel === step.model
                ? 'var(--theme-text-muted)'
                : 'var(--theme-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isSaving || selectedModel === step.model ? 'not-allowed' : 'pointer',
          }}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {saveStatus === 'success' && (
          <span style={{ fontSize: '0.875rem', color: '#10b981' }}>✓ Saved</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>✗ Error</span>
        )}
      </div>
    </div>
  );
}
