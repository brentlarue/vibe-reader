import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme } from '../types';
import { preferences } from '../utils/preferences';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize theme from localStorage immediately to avoid flashing
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('readerTheme');
    const initialTheme = (saved as Theme) || 'light';
    // Apply theme immediately to prevent flash
    if (typeof document !== 'undefined') {
      applyTheme(initialTheme);
    }
    return initialTheme;
  });

  // Load theme from server on mount (only if not on login page)
  useEffect(() => {
    const loadTheme = async () => {
      // Skip API call if we're on the login page
      if (window.location.pathname === '/login') {
        return;
      }

      // Wait a bit to ensure auth check has completed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check again if we're still on login page (auth might have redirected)
      if (window.location.pathname === '/login') {
        return;
      }

      try {
        const savedTheme = await preferences.getTheme();
        if (savedTheme !== theme) {
          setThemeState(savedTheme);
          applyTheme(savedTheme);
        }
      } catch (error: any) {
        // Silently fail for 401 errors (expected before authentication)
        if (!error?.isUnauthorized && !error?.suppressWarning) {
          console.warn('Failed to load theme from server, using localStorage:', error);
        }
      }
    };
    loadTheme();
  }, []); // Empty deps - only run once on mount

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    // Save to localStorage as backup
    localStorage.setItem('readerTheme', newTheme);
    // Sync to server
    try {
      await preferences.setTheme(newTheme);
    } catch (error) {
      console.error('Failed to sync theme to server:', error);
    }
  };

  // Apply theme whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  
  // Remove all theme classes
  root.classList.remove('theme-light', 'theme-dark', 'theme-sepia', 'theme-mint');
  
  // Add current theme class
  root.classList.add(`theme-${theme}`);
}

