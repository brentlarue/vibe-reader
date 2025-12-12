import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../types';

const themes: { value: Theme; label: string; icon: 'sun' | 'moon' | 'book' | 'yc' }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'sepia', label: 'Sepia', icon: 'book' },
  { value: 'hn', label: 'Hacker News', icon: 'yc' },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mt-auto">
      <div 
        className="flex items-center gap-1 p-1 rounded"
        style={{ backgroundColor: 'var(--theme-hover-bg)', borderColor: 'var(--theme-border)' }}
      >
        {themes.map((t) => (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`flex-1 flex items-center justify-center px-2 py-2 rounded transition-colors ${
              theme === t.value
                ? 'shadow-sm'
                : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: theme === t.value ? 'var(--theme-card-bg)' : 'transparent',
              color: 'var(--theme-text-secondary)',
            }}
            title={t.label}
            aria-label={t.label}
          >
            {t.icon === 'sun' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
            {t.icon === 'moon' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            {t.icon === 'book' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            )}
            {t.icon === 'yc' && (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" strokeWidth="2" />
                <path d="M7 6L12 13V18M17 6L12 13" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
