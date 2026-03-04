import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  listUserAiKeys,
  saveUserAiKey,
  deleteUserAiKey,
  UserAiKey,
} from '../services/userAiKeys';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'google', label: 'Google Gemini', placeholder: 'AIza...' },
] as const;

interface AIKeysSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIKeysSettings({ isOpen, onClose }: AIKeysSettingsProps) {
  const [keys, setKeys] = useState<UserAiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      const data = await listUserAiKeys();
      setKeys(data);
    } catch {
      // Silently fail on load
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      loadKeys();
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingProvider) {
          handleCancel();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, editingProvider]);

  const getKeyForProvider = (provider: string) =>
    keys.find(k => k.provider === provider);

  const handleSave = async (provider: string) => {
    if (!inputValue.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await saveUserAiKey(provider, inputValue.trim());
      setEditingProvider(null);
      setInputValue('');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider: string) => {
    try {
      await deleteUserAiKey(provider);
      await loadKeys();
    } catch {
      setError('Failed to delete key');
    }
  };

  const handleCancel = () => {
    setEditingProvider(null);
    setInputValue('');
    setError(null);
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200]"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-[201] shadow-2xl"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--theme-card-bg)',
          border: '1px solid var(--theme-border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--theme-border)' }}
        >
          <h2
            className="text-sm font-medium"
            style={{ color: 'var(--theme-text)' }}
          >
            AI API Keys
          </h2>
          <button
            onClick={onClose}
            className="p-1 transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--theme-text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
              Loading...
            </div>
          ) : (
            PROVIDERS.map(provider => {
              const existing = getKeyForProvider(provider.id);
              const isEditing = editingProvider === provider.id;

              return (
                <div key={provider.id}>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm"
                      style={{ color: 'var(--theme-text-secondary)' }}
                    >
                      {provider.label}
                    </span>

                    {existing && !isEditing ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-mono"
                          style={{ color: 'var(--theme-text-muted)' }}
                        >
                          {existing.keyHint}
                        </span>
                        <button
                          onClick={() => handleDelete(provider.id)}
                          className="text-xs px-1.5 py-0.5 transition-colors"
                          style={{ color: 'var(--theme-text-muted)' }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#ef4444';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = 'var(--theme-text-muted)';
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : !isEditing ? (
                      <button
                        onClick={() => {
                          setEditingProvider(provider.id);
                          setError(null);
                        }}
                        className="text-xs px-1.5 py-0.5 transition-colors"
                        style={{ color: 'var(--theme-text-muted)' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = 'var(--theme-text)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = 'var(--theme-text-muted)';
                        }}
                      >
                        Add
                      </button>
                    ) : null}
                  </div>

                  {isEditing && (
                    <div className="mt-2 space-y-2">
                      <input
                        type="password"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        placeholder={provider.placeholder}
                        autoFocus
                        className="w-full text-sm px-3 py-2 rounded outline-none"
                        style={{
                          backgroundColor: 'var(--theme-hover-bg)',
                          color: 'var(--theme-text)',
                          border: '1px solid var(--theme-border)',
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSave(provider.id);
                          if (e.key === 'Escape') handleCancel();
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(provider.id)}
                          disabled={saving || !inputValue.trim()}
                          className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
                          style={{
                            backgroundColor: 'var(--theme-text)',
                            color: 'var(--theme-bg)',
                          }}
                        >
                          {saving ? 'Validating...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 transition-colors"
                          style={{ color: 'var(--theme-text-muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                      {error && (
                        <div
                          className="text-xs"
                          style={{ color: '#ef4444' }}
                        >
                          {error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
