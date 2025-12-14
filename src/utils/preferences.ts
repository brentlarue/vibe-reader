// Preferences storage for syncing across devices
// Stores theme, sidebar state, and other user preferences

import { apiFetch } from './apiFetch';

export interface Preferences {
  theme?: 'light' | 'dark' | 'sepia' | 'hn';
  sidebarCollapsed?: boolean;
  lastFeedRefresh?: string; // ISO string timestamp
}

// localStorage key for local cache
const PREFERENCES_KEY = 'vibe-reader-preferences';

/**
 * Make an API request with proper error handling
 */
const apiRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await apiFetch(`/api/${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
};

/**
 * Fallback to localStorage if API fails
 */
const fallbackToLocalStorage = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
};

/**
 * Save to localStorage for local caching
 */
const saveToLocalStorage = (key: string, value: unknown): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

export const preferences = {
  /**
   * Get all preferences from the server
   */
  get: async (): Promise<Preferences> => {
    try {
      const prefs = await apiRequest<Preferences>('preferences');
      saveToLocalStorage(PREFERENCES_KEY, prefs);
      return prefs;
    } catch (error: unknown) {
      const err = error as { suppressWarning?: boolean; isUnauthorized?: boolean };
      if (!err?.suppressWarning && !err?.isUnauthorized) {
        console.warn('Failed to fetch preferences from API, using local storage:', error);
      }
      return fallbackToLocalStorage<Preferences>(PREFERENCES_KEY, {});
    }
  },

  /**
   * Update preferences on the server
   */
  set: async (updates: Partial<Preferences>): Promise<void> => {
    // Get current preferences and merge
    const current = await preferences.get();
    const updated = { ...current, ...updates };
    
    // Save to localStorage first for immediate UI update
    saveToLocalStorage(PREFERENCES_KEY, updated);
    
    try {
      await apiRequest('preferences', {
        method: 'POST',
        body: JSON.stringify(updates), // Only send updates, server will merge
      });
    } catch (error) {
      console.error('Failed to save preferences to API:', error);
      throw error;
    }
  },

  /**
   * Get current theme
   */
  getTheme: async (): Promise<'light' | 'dark' | 'sepia' | 'hn'> => {
    const prefs = await preferences.get();
    return prefs.theme || 'light';
  },

  /**
   * Set theme
   */
  setTheme: async (theme: 'light' | 'dark' | 'sepia' | 'hn'): Promise<void> => {
    await preferences.set({ theme });
  },

  /**
   * Get sidebar collapsed state
   */
  getSidebarCollapsed: async (): Promise<boolean> => {
    const prefs = await preferences.get();
    return prefs.sidebarCollapsed || false;
  },

  /**
   * Set sidebar collapsed state
   */
  setSidebarCollapsed: async (collapsed: boolean): Promise<void> => {
    await preferences.set({ sidebarCollapsed: collapsed });
  },

  /**
   * Get last feed refresh time
   * Forces a fresh fetch from server to ensure we get the latest value
   */
  getLastFeedRefresh: async (): Promise<string | null> => {
    try {
      // Force a fresh fetch from server (bypass cache)
      const response = await apiFetch('/api/preferences', {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const prefs = await response.json() as Preferences;
      // Update cache with fresh data
      saveToLocalStorage(PREFERENCES_KEY, prefs);
      return prefs.lastFeedRefresh || null;
    } catch (error: unknown) {
      // Fallback to cached localStorage if server fetch fails
      const err = error as { suppressWarning?: boolean; isUnauthorized?: boolean };
      if (!err?.suppressWarning && !err?.isUnauthorized) {
        console.warn('Failed to fetch last refresh time from API, using cache:', error);
      }
      const cached = fallbackToLocalStorage<Preferences>(PREFERENCES_KEY, {});
      return cached.lastFeedRefresh || null;
    }
  },

  /**
   * Set last feed refresh time
   */
  setLastFeedRefresh: async (timestamp: string): Promise<void> => {
    await preferences.set({ lastFeedRefresh: timestamp });
  },
};
