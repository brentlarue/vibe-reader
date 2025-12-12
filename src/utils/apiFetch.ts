import { getGlobalWakingCallbacks } from '../contexts/WakingContext';

// Threshold for showing "waking up" overlay (in ms)
const SLOW_REQUEST_THRESHOLD = 1200;

// Track pending slow requests
let pendingSlowRequests = 0;
let wakingTimeouts = new Map<number, NodeJS.Timeout>();
let timeoutIdCounter = 0;

// API fetch wrapper that handles 401 redirects and slow request detection
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  // Don't redirect if we're already on the login page
  const isLoginPage = window.location.pathname === '/login';
  
  // Generate unique ID for this request
  const requestId = ++timeoutIdCounter;
  let showedWaking = false;
  
  // Start timer to detect slow requests
  const wakingTimeout = setTimeout(() => {
    const callbacks = getGlobalWakingCallbacks();
    if (callbacks) {
      pendingSlowRequests++;
      showedWaking = true;
      callbacks.incrementPending();
      callbacks.startWaking();
    }
  }, SLOW_REQUEST_THRESHOLD);
  
  wakingTimeouts.set(requestId, wakingTimeout);
  
  try {
    const res = await fetch(input, {
      ...init,
      credentials: 'include', // Include cookies in all requests
    });
    
    // Clear the timeout since request completed
    clearTimeout(wakingTimeout);
    wakingTimeouts.delete(requestId);
    
    // If we showed the waking overlay, decrement pending count
    if (showedWaking) {
      pendingSlowRequests--;
      const callbacks = getGlobalWakingCallbacks();
      if (callbacks) {
        callbacks.decrementPending();
      }
    }
    
    if (res.status === 401) {
      // Only redirect if not on login page
      if (!isLoginPage) {
        window.location.href = '/login';
      }
      // Create a custom error that won't be logged as a warning
      const error = new Error('Unauthorized');
      (error as any).isUnauthorized = true;
      (error as any).suppressWarning = isLoginPage; // Suppress warning on login page
      throw error;
    }
    
    return res;
  } catch (error) {
    // Clear the timeout on error too
    clearTimeout(wakingTimeout);
    wakingTimeouts.delete(requestId);
    
    // If we showed the waking overlay, decrement pending count
    if (showedWaking) {
      pendingSlowRequests--;
      const callbacks = getGlobalWakingCallbacks();
      if (callbacks) {
        callbacks.decrementPending();
      }
    }
    
    throw error;
  }
}

// Separate function for initial auth check that triggers waking on slow response
export async function apiFetchWithWaking(input: RequestInfo, init?: RequestInit): Promise<Response> {
  return apiFetch(input, init);
}
