import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme } from '../types';
import { preferences } from '../utils/preferences';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [isLoading, setIsLoading] = useState(true);

  // Load theme from server on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await preferences.getTheme();
        setThemeState(savedTheme);
        applyTheme(savedTheme);
      } catch (error) {
        // Fallback to localStorage if API fails
        const saved = localStorage.getItem('readerTheme');
        const fallbackTheme = (saved as Theme) || 'light';
        setThemeState(fallbackTheme);
        applyTheme(fallbackTheme);
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, []);

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

  useEffect(() => {
    if (!isLoading) {
      applyTheme(theme);
    }
  }, [theme, isLoading]);

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

