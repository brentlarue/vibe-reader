/**
 * Prompt Editor Component
 * 
 * Allows editing of system and user prompts for workflow steps.
 */

import { useState, useEffect } from 'react';
import { StepDefinition } from '../../types';

interface PromptEditorProps {
  step: StepDefinition;
  onSave: (stepId: string, updates: { promptSystem?: string; promptUser?: string }) => Promise<void>;
}

export default function PromptEditor({ step, onSave }: PromptEditorProps) {
  const [promptSystem, setPromptSystem] = useState(step.promptSystem || '');
  const [promptUser, setPromptUser] = useState(step.promptUser || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Update state when step changes
  useEffect(() => {
    setPromptSystem(step.promptSystem || '');
    setPromptUser(step.promptUser || '');
    setSaveStatus('idle'); // Reset save status when step changes
  }, [step.id, step.promptSystem, step.promptUser]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      await onSave(step.id, {
        promptSystem: promptSystem.trim() || undefined,
        promptUser: promptUser.trim() || undefined,
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      console.error('Failed to save prompts:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const variableHints = [
    '{{input.interests}}',
    '{{input.criteria}}',
    '{{input.searchLimit}}',
    '{{steps.stepId.output.field}}',
    '{{steps.stepId.input.field}}',
  ];

  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        borderRadius: '8px',
        marginBottom: '1rem',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
        Edit Prompts: {step.name}
      </h3>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            color: 'var(--theme-text-secondary)',
          }}
        >
          System Prompt
        </label>
        <textarea
          value={promptSystem}
          onChange={(e) => setPromptSystem(e.target.value)}
          rows={6}
          style={{
            width: '100%',
            maxWidth: '100%',
            padding: '0.75rem',
            fontSize: '0.875rem',
            backgroundColor: 'var(--theme-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: '4px',
            color: 'var(--theme-text)',
            fontFamily: 'monospace',
            resize: 'vertical',
            boxSizing: 'border-box',
            overflowWrap: 'break-word',
            wordWrap: 'break-word',
          }}
          placeholder="Enter system prompt..."
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
          User Prompt
        </label>
        <textarea
          value={promptUser}
          onChange={(e) => setPromptUser(e.target.value)}
          rows={8}
          style={{
            width: '100%',
            maxWidth: '100%',
            padding: '0.75rem',
            fontSize: '0.875rem',
            backgroundColor: 'var(--theme-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: '4px',
            color: 'var(--theme-text)',
            fontFamily: 'monospace',
            resize: 'vertical',
            boxSizing: 'border-box',
            overflowWrap: 'break-word',
            wordWrap: 'break-word',
          }}
          placeholder="Enter user prompt..."
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', marginBottom: '0.5rem' }}>
          Variable Hints (click to insert):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
          {variableHints.map((hint) => (
            <button
              key={hint}
              onClick={() => {
                const textarea = document.activeElement as HTMLTextAreaElement;
                if (textarea && textarea.tagName === 'TEXTAREA') {
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;
                  const text = textarea.value;
                  const newText = text.substring(0, start) + hint + text.substring(end);
                  if (textarea === document.querySelector('textarea[placeholder*="system"]')) {
                    setPromptSystem(newText);
                  } else {
                    setPromptUser(newText);
                  }
                  setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(start + hint.length, start + hint.length);
                  }, 0);
                }
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
              {hint}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            backgroundColor: isSaving ? 'var(--theme-text-muted)' : 'var(--theme-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
          }}
        >
          {isSaving ? 'Saving...' : 'Save Prompts'}
        </button>
        {saveStatus === 'success' && (
          <span style={{ fontSize: '0.875rem', color: '#10b981' }}>✓ Saved</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>✗ Error saving</span>
        )}
      </div>
    </div>
  );
}
