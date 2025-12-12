import { useState, useEffect } from 'react';
import { useWaking } from '../contexts/WakingContext';

export default function WakingUpOverlay() {
  const { isWaking, retry } = useWaking();
  const [dots, setDots] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);

  // Animate the ellipsis: "" → "." → ".." → "..." → ""
  useEffect(() => {
    if (!isWaking) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isWaking]);

  // Reset dots when overlay appears
  useEffect(() => {
    if (isWaking) {
      setDots('');
    }
  }, [isWaking]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retry();
    } finally {
      setIsRetrying(false);
    }
  };

  if (!isWaking) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'var(--theme-bg)',
      }}
    >
      <div className="text-center px-6 max-w-sm">
        {/* Headline with animated ellipsis */}
        <h1
          className="text-2xl font-medium tracking-tight mb-3"
          style={{ color: 'var(--theme-text)' }}
        >
          <span>Waking up</span>
          <span className="inline-block w-6 text-left">{dots}</span>
        </h1>

        {/* Subtext */}
        <p
          className="text-sm mb-8"
          style={{ color: 'var(--theme-text-muted)' }}
        >
          This can take up to ~50 seconds on the free host.
        </p>

        {/* Retry button - square edges, no rounded corners */}
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: 'var(--theme-button-bg)',
            color: 'var(--theme-button-text)',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            if (!isRetrying) {
              e.currentTarget.style.opacity = '0.9';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          {isRetrying ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    </div>
  );
}

