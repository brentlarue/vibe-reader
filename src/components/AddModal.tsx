import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';

type AddType = 'feed' | 'article';

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFeed: (url: string) => Promise<void>;
  onAddArticle: (url: string) => Promise<void>;
}

export default function AddModal({ isOpen, onClose, onAddFeed, onAddArticle }: AddModalProps) {
  const { theme } = useTheme();
  const [addType, setAddType] = useState<AddType>('feed');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isValidUrl = (urlString: string): boolean => {
    try {
      const parsed = new URL(urlString.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Please enter a URL');
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      setError('Please enter a valid http or https URL');
      return;
    }

    setIsLoading(true);
    try {
      if (addType === 'feed') {
        await onAddFeed(trimmedUrl);
      } else {
        await onAddArticle(trimmedUrl);
      }
      // Success - close modal and reset
      setUrl('');
      setAddType('feed');
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setUrl('');
      setError(null);
      setAddType('feed');
      onClose();
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div
        className="fixed inset-0 z-[151] flex items-end sm:items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div
          className="w-full max-w-md shadow-xl"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
            <h2 className="text-lg font-medium" style={{ color: 'var(--theme-text)' }}>
              Add
            </h2>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="p-1 transition-colors touch-manipulation disabled:opacity-50"
              style={{ color: 'var(--theme-text-muted)' }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.color = 'var(--theme-text)';
                  e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-muted)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Type Selection - Tab style */}
            <div 
              className="flex border-b"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <button
                type="button"
                onClick={() => {
                  setAddType('feed');
                  setError(null);
                }}
                className="relative px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: addType === 'feed' ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (addType !== 'feed') {
                    e.currentTarget.style.color = 'var(--theme-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (addType !== 'feed') {
                    e.currentTarget.style.color = 'var(--theme-text-secondary)';
                  }
                }}
              >
                RSS feed
                {addType === 'feed' && (
                  <span 
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: 'var(--theme-accent)' }}
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddType('article');
                  setError(null);
                }}
                className="relative px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: addType === 'article' ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (addType !== 'article') {
                    e.currentTarget.style.color = 'var(--theme-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (addType !== 'article') {
                    e.currentTarget.style.color = 'var(--theme-text-secondary)';
                  }
                }}
              >
                Article
                {addType === 'article' && (
                  <span 
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: 'var(--theme-accent)' }}
                  />
                )}
              </button>
            </div>

            {/* URL Input */}
            <div>
              <label 
                htmlFor="add-url" 
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                {addType === 'feed' ? 'Feed URL' : 'Article URL'}
              </label>
              <input
                id="add-url"
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder={addType === 'feed' ? 'https://example.com/feed.xml' : 'https://example.com/article'}
                disabled={isLoading}
                className={`w-full px-3 py-2.5 text-sm border focus:outline-none transition-colors disabled:opacity-50 ${
                  theme === 'light' ? 'placeholder:text-gray-400' :
                  theme === 'dark' ? 'placeholder:text-gray-400' :
                  theme === 'sepia' ? 'placeholder:[color:#8B7355]' :
                  theme === 'hn' ? 'placeholder:[color:#999999]' :
                  'placeholder:text-gray-400'
                }`}
                style={{
                  borderColor: error ? '#dc2626' : 'var(--theme-border)',
                  backgroundColor: 'var(--theme-card-bg)',
                  color: 'var(--theme-text)',
                }}
                onFocus={(e) => {
                  if (!error) {
                    e.currentTarget.style.borderColor = 'var(--theme-accent)';
                    e.currentTarget.style.outline = '1px solid var(--theme-accent)';
                    e.currentTarget.style.outlineOffset = '-1px';
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = error ? '#dc2626' : 'var(--theme-border)';
                  e.currentTarget.style.outline = 'none';
                }}
                autoFocus
              />
              {error && (
                <p className="mt-2 text-xs" style={{ color: '#dc2626' }}>{error}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1 py-2.5 px-4 text-sm font-medium transition-colors border disabled:opacity-50"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--theme-text-secondary)',
                  borderColor: 'var(--theme-border)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-2.5 px-4 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--theme-button-bg)',
                  color: 'var(--theme-button-text)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                {isLoading ? 'Adding...' : addType === 'feed' ? 'Add feed' : 'Add article'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
