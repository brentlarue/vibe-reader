import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LIST_SHORTCUTS = [
  { key: 'j', description: 'Focus next item' },
  { key: 'k', description: 'Focus previous item' },
  { key: 'o / Enter', description: 'Open focused item' },
  { key: 'e', description: 'Archive (toggle)' },
  { key: 's', description: 'Save for later (toggle)' },
  { key: 'b', description: 'Bookmark (toggle)' },
  { key: '?', description: 'Show keyboard shortcuts' },
];

const ARTICLE_SHORTCUTS = [
  { key: 'j', description: 'Next article' },
  { key: 'k', description: 'Previous article' },
  { key: 'o', description: 'Open original URL in new tab' },
  { key: 'e', description: 'Archive & return to list' },
  { key: 's', description: 'Save for later (toggle)' },
  { key: 'b', description: 'Bookmark (toggle)' },
  { key: 'u / Esc', description: 'Go back to list' },
  { key: '?', description: 'Show keyboard shortcuts' },
];

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[151] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg max-h-[80vh] overflow-y-auto"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b"
            style={{ borderColor: 'var(--theme-border)' }}
          >
            <h2 className="text-base font-semibold" style={{ color: 'var(--theme-text)' }}>
              Keyboard Shortcuts
            </h2>
            <button
              onClick={onClose}
              className="p-1 transition-opacity hover:opacity-60"
              style={{ color: 'var(--theme-text-muted)' }}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-6">
            <ShortcutSection title="List View" shortcuts={LIST_SHORTCUTS} />
            <ShortcutSection title="Article View" shortcuts={ARTICLE_SHORTCUTS} />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function ShortcutSection({ title, shortcuts }: { title: string; shortcuts: { key: string; description: string }[] }) {
  return (
    <div>
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--theme-text-muted)' }}
      >
        {title}
      </h3>
      <div className="space-y-2">
        {shortcuts.map(({ key, description }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              {description}
            </span>
            <kbd
              className="flex-shrink-0 text-xs px-2 py-0.5 font-mono"
              style={{
                backgroundColor: 'var(--theme-hover-bg)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text)',
              }}
            >
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
