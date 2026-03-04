import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';
import { parseOpml, OpmlFeed } from '../utils/opml';

type AddType = 'feed' | 'article' | 'opml';

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFeed: (url: string) => Promise<void>;
  onAddArticle: (url: string) => Promise<void>;
  onImportOpml?: (feeds: OpmlFeed[]) => Promise<{ added: number; duplicates: number; failed: number }>;
}

export default function AddModal({ isOpen, onClose, onAddFeed, onAddArticle, onImportOpml }: AddModalProps) {
  const { theme } = useTheme();
  const [addType, setAddType] = useState<AddType>('feed');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opmlFeeds, setOpmlFeeds] = useState<OpmlFeed[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; duplicates: number; failed: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to input when modal opens or when keyboard appears
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure keyboard is open on mobile
      const timeoutId = setTimeout(() => {
        inputRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
        });
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Handle keyboard visibility changes on mobile
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (inputRef.current && modalRef.current) {
        // Scroll to keep input visible when keyboard appears
        setTimeout(() => {
          inputRef.current?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
          });
        }, 100);
      }
    };

    // Listen for viewport changes (keyboard opening/closing)
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

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

    // Skip form submission for OPML tab
    if (addType === 'opml') {
      return;
    }

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

  const handleOpmlFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const xmlString = event.target?.result as string;
        const feeds = parseOpml(xmlString);
        if (feeds.length === 0) {
          setError('No RSS feeds found in this OPML file');
        } else {
          setOpmlFeeds(feeds);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse OPML file');
      }
    };
    reader.readAsText(file);
  };

  const handleImportOpml = async () => {
    if (!opmlFeeds.length || !onImportOpml) return;

    setIsImporting(true);
    setError(null);
    try {
      const result = await onImportOpml(opmlFeeds);
      setImportResult(result);
      setOpmlFeeds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isLoading && !isImporting) {
      setUrl('');
      setError(null);
      setAddType('feed');
      setOpmlFeeds([]);
      setImportResult(null);
      onClose();
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      
      {/* Modal container - scrollable on mobile */}
      <div
        className="fixed inset-0 z-[151] overflow-y-auto sm:overflow-y-visible sm:flex sm:items-center sm:justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
        style={{
          // Use visual viewport on mobile for proper keyboard handling
          ...(typeof window !== 'undefined' && window.visualViewport && window.innerWidth < 640
            ? { maxHeight: `${window.visualViewport.height}px` }
            : {}
          ),
        }}
      >
        <div
          ref={modalRef}
          className="w-full max-w-md shadow-xl sm:my-auto"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            marginTop: 'auto',
            marginBottom: 'auto',
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
              <button
                type="button"
                onClick={() => {
                  setAddType('opml');
                  setError(null);
                  setOpmlFeeds([]);
                  setImportResult(null);
                }}
                className="relative px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: addType === 'opml' ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (addType !== 'opml') {
                    e.currentTarget.style.color = 'var(--theme-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (addType !== 'opml') {
                    e.currentTarget.style.color = 'var(--theme-text-secondary)';
                  }
                }}
              >
                OPML
                {addType === 'opml' && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: 'var(--theme-accent)' }}
                  />
                )}
              </button>
            </div>

            {/* URL Input or OPML Import */}
            {addType === 'opml' ? (
              <div>
                {!opmlFeeds.length && !importResult ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-6 border-2 border-dashed text-center transition-colors"
                      style={{
                        borderColor: error ? '#dc2626' : 'var(--theme-border)',
                        backgroundColor: 'var(--theme-hover-bg)',
                        color: 'var(--theme-text-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        if (!error && !isImporting) {
                          e.currentTarget.style.backgroundColor = 'var(--theme-border)';
                          e.currentTarget.style.borderColor = 'var(--theme-accent)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                        e.currentTarget.style.borderColor = error ? '#dc2626' : 'var(--theme-border)';
                      }}
                    >
                      <div className="text-sm font-medium">Choose .opml or .xml file</div>
                      <div className="text-xs mt-1">Exported from Feedly, The Old Reader, etc.</div>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".opml,.xml"
                      onChange={handleOpmlFileChange}
                      disabled={isImporting}
                      className="hidden"
                      aria-label="Upload OPML file"
                    />
                    {error && (
                      <p className="mt-2 text-xs" style={{ color: '#dc2626' }}>{error}</p>
                    )}
                  </div>
                ) : importResult ? (
                  <div className="space-y-3">
                    <div
                      className="p-3 text-sm"
                      style={{
                        backgroundColor: 'var(--theme-hover-bg)',
                        borderLeft: '3px solid #10b981',
                        color: 'var(--theme-text)',
                      }}
                    >
                      <div className="font-medium">Import complete</div>
                      <div className="mt-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                        Added: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{importResult.added}</span>
                        {importResult.duplicates > 0 && (
                          <>
                            {' '} | Duplicates skipped: <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{importResult.duplicates}</span>
                          </>
                        )}
                        {importResult.failed > 0 && (
                          <>
                            {' '} | Failed: <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{importResult.failed}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm" style={{ color: 'var(--theme-text)' }}>
                      Found <span style={{ fontWeight: 'bold' }}>{opmlFeeds.length}</span> feeds
                    </div>
                    <div
                      className="max-h-48 overflow-y-auto text-xs space-y-1"
                      style={{
                        border: '1px solid var(--theme-border)',
                        padding: '8px',
                        backgroundColor: 'var(--theme-hover-bg)',
                      }}
                    >
                      {opmlFeeds.slice(0, 10).map((feed, idx) => (
                        <div key={idx} style={{ color: 'var(--theme-text-secondary)', wordBreak: 'break-word' }}>
                          • {feed.title}
                        </div>
                      ))}
                      {opmlFeeds.length > 10 && (
                        <div style={{ color: 'var(--theme-text-secondary)', marginTop: '8px' }}>
                          + {opmlFeeds.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label
                  htmlFor="add-url"
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
                  {addType === 'feed' ? 'Feed URL' : 'Article URL'}
                </label>
                <input
                  ref={inputRef}
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
                    // Scroll input into view on mobile when keyboard appears
                    if (window.innerWidth < 640) {
                      setTimeout(() => {
                        e.currentTarget.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        });
                      }, 300);
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
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              {addType === 'opml' && !importResult ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                    disabled={isImporting || opmlFeeds.length > 0}
                    className="flex-1 py-2.5 px-4 text-sm font-medium transition-colors border disabled:opacity-50"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--theme-text-secondary)',
                      borderColor: 'var(--theme-border)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isImporting && opmlFeeds.length === 0) {
                        e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    Choose File
                  </button>
                  {opmlFeeds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleImportOpml}
                      disabled={isImporting}
                      className="flex-1 py-2.5 px-4 text-sm font-medium transition-colors disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--theme-button-bg)',
                        color: 'var(--theme-button-text)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isImporting) {
                          e.currentTarget.style.opacity = '0.9';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      {isImporting ? 'Importing...' : 'Import all'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isLoading || isImporting}
                    className="flex-1 py-2.5 px-4 text-sm font-medium transition-colors border disabled:opacity-50"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--theme-text-secondary)',
                      borderColor: 'var(--theme-border)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading && !isImporting) {
                        e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {importResult ? 'Done' : 'Cancel'}
                  </button>
                  {!importResult && (
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
                  )}
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
