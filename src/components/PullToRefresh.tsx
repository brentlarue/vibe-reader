import { useState, useRef, useCallback, ReactNode } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const PULL_THRESHOLD = 80; // px needed to trigger refresh
const MAX_PULL = 120; // max pull distance
const RESISTANCE = 2.5; // pull resistance factor

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  
  const startY = useRef(0);
  const currentY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAtTop = useCallback(() => {
    const container = containerRef.current?.closest('main');
    return container ? container.scrollTop <= 0 : true;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    if (!isAtTop()) return;
    
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [isRefreshing, isAtTop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    if (!isAtTop()) {
      setPullDistance(0);
      return;
    }

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    
    if (diff > 0) {
      // Apply resistance to make pull feel elastic
      const resistedDiff = Math.min(diff / RESISTANCE, MAX_PULL);
      setPullDistance(resistedDiff);
      
      // Prevent default scroll when pulling
      if (resistedDiff > 5) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, isRefreshing, isAtTop]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    setIsPulling(false);

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      // Trigger refresh
      setIsRefreshing(true);
      setPullDistance(50); // Hold at indicator position
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      // Snap back
      setPullDistance(0);
    }
  }, [isPulling, pullDistance, isRefreshing, onRefresh]);

  const showIndicator = pullDistance > 10 || isRefreshing;
  const isPastThreshold = pullDistance >= PULL_THRESHOLD;
  // Calculate arrow opacity based on pull progress (fades as approaching threshold)
  const arrowOpacity = isPastThreshold ? 0 : Math.min(pullDistance / 40, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
      style={{ touchAction: isPulling && pullDistance > 5 ? 'none' : 'auto' }}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex justify-center items-center pointer-events-none transition-opacity duration-150"
        style={{
          top: -50,
          height: 50,
          opacity: showIndicator ? 1 : 0,
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.2s ease-out, opacity 0.15s ease-out',
        }}
      >
        {/* Down arrow - shown while pulling before threshold */}
        {!isPastThreshold && !isRefreshing && (
          <svg 
            className="w-5 h-5" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24" 
            xmlns="http://www.w3.org/2000/svg"
            style={{ 
              color: 'var(--theme-text)',
              opacity: arrowOpacity,
              transition: isPulling ? 'none' : 'opacity 0.15s ease-out',
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        )}

        {/* Spinning loader - shown at/past threshold and during refresh */}
        {(isPastThreshold || isRefreshing) && (
          <div
            className="w-5 h-5 border-2 rounded-full"
            style={{
              borderColor: 'transparent',
              borderTopColor: 'var(--theme-text)',
              borderRightColor: 'var(--theme-text)',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        )}
      </div>

      {/* Content with transform */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>

      {/* Add keyframe animation for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
