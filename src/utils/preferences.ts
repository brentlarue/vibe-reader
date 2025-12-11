// Preferences storage for syncing across devices
// Stores theme, sidebar state, and other user preferences

export interface Preferences {
  theme?: 'light' | 'dark' | 'sepia' | 'mint';
  sidebarCollapsed?: boolean;
}

// API request helper
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await fetch(`/api/data/${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized. Please check your API key in .env file.');
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
};

// Fallback to localStorage if API fails
const fallbackToLocalStorage = (key: string, defaultValue: any) => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
};

const saveToLocalStorage = (key: string, value: any) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

export const preferences = {
  get: async (): Promise<Preferences> => {
    try {
      const prefs = await apiRequest('preferences');
      // Sync to localStorage as backup
      saveToLocalStorage('vibe-reader-preferences', prefs);
      return prefs;
    } catch (error) {
      console.warn('Failed to fetch preferences from API, using local storage:', error);
      return fallbackToLocalStorage('vibe-reader-preferences', {});
    }
  },

  set: async (updates: Partial<Preferences>): Promise<void> => {
    // Get current preferences and merge
    const current = await preferences.get();
    const updated = { ...current, ...updates };
    
    // Save to localStorage first for immediate UI update
    saveToLocalStorage('vibe-reader-preferences', updated);
    
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

  getTheme: async (): Promise<'light' | 'dark' | 'sepia' | 'mint'> => {
    const prefs = await preferences.get();
    return prefs.theme || 'light';
  },

  setTheme: async (theme: 'light' | 'dark' | 'sepia' | 'mint'): Promise<void> => {
    await preferences.set({ theme });
  },

  getSidebarCollapsed: async (): Promise<boolean> => {
    const prefs = await preferences.get();
    return prefs.sidebarCollapsed || false;
  },

  setSidebarCollapsed: async (collapsed: boolean): Promise<void> => {
    await preferences.set({ sidebarCollapsed: collapsed });
  },
};

