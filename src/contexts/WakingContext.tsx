import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface WakingState {
  isWaking: boolean;
  pendingCount: number;
}

interface WakingContextValue extends WakingState {
  startWaking: () => void;
  stopWaking: () => void;
  incrementPending: () => void;
  decrementPending: () => void;
  retry: () => Promise<void>;
}

const WakingContext = createContext<WakingContextValue | null>(null);

export function WakingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WakingState>({
    isWaking: false,
    pendingCount: 0,
  });

  const startWaking = useCallback(() => {
    setState(prev => ({ ...prev, isWaking: true }));
  }, []);

  const stopWaking = useCallback(() => {
    setState(prev => ({ ...prev, isWaking: false, pendingCount: 0 }));
  }, []);

  const incrementPending = useCallback(() => {
    setState(prev => ({ ...prev, pendingCount: prev.pendingCount + 1 }));
  }, []);

  const decrementPending = useCallback(() => {
    setState(prev => {
      const newCount = Math.max(0, prev.pendingCount - 1);
      return {
        ...prev,
        pendingCount: newCount,
        // Hide overlay when all pending requests complete
        isWaking: newCount > 0 ? prev.isWaking : false,
      };
    });
  }, []);

  const retry = useCallback(async () => {
    try {
      const response = await fetch('/api/me', {
        credentials: 'include',
      });
      if (response.ok) {
        stopWaking();
      }
    } catch (error) {
      console.error('Retry failed:', error);
    }
  }, [stopWaking]);

  return (
    <WakingContext.Provider
      value={{
        ...state,
        startWaking,
        stopWaking,
        incrementPending,
        decrementPending,
        retry,
      }}
    >
      {children}
    </WakingContext.Provider>
  );
}

export function useWaking() {
  const context = useContext(WakingContext);
  if (!context) {
    throw new Error('useWaking must be used within a WakingProvider');
  }
  return context;
}

// Global reference for use in apiFetch (outside React)
let globalWakingCallbacks: {
  startWaking: () => void;
  stopWaking: () => void;
  incrementPending: () => void;
  decrementPending: () => void;
} | null = null;

export function setGlobalWakingCallbacks(callbacks: typeof globalWakingCallbacks) {
  globalWakingCallbacks = callbacks;
}

export function getGlobalWakingCallbacks() {
  return globalWakingCallbacks;
}

