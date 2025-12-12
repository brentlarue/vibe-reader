import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../types';

const themes: { value: Theme; label: string; icon: 'sun' | 'moon' | 'book' | 'leaf' }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'sepia', label: 'Sepia', icon: 'book' },
  { value: 'mint', label: 'Mint', icon: 'leaf' },
];

export default function SettingsMenu() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ bottom: 0, left: 0, width: 0 });

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        bottom: window.innerHeight - rect.top + 8, // 8px gap above button
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      // Still redirect to login even if logout request fails
      window.location.href = '/login';
    }
  };

  return (
    <div className="relative">
      {/* Settings Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-3 py-2 text-sm transition-colors"
        style={{
          color: 'var(--theme-text-secondary)',
          backgroundColor: isOpen ? 'var(--theme-hover-bg)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            e.currentTarget.style.color = 'var(--theme-text)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--theme-text-secondary)';
          }
        }}
      >
        <span>Settings</span>
      </button>

      {/* Click outside overlay - rendered via portal to escape sidebar stacking context */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[100]"
          onClick={() => setIsOpen(false)}
        />,
        document.body
      )}

      {/* Settings Menu Card - also rendered via portal to be above overlay */}
      {isOpen && createPortal(
        <div
          className="fixed shadow-xl p-4 space-y-4 z-[101]"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            bottom: menuPosition.bottom,
            left: menuPosition.left,
            width: menuPosition.width,
          }}
        >
          {/* Theme Section */}
          <div>
            <div 
              className="flex items-center gap-1 p-1"
              style={{ backgroundColor: 'var(--theme-hover-bg)' }}
            >
              {themes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex-1 flex items-center justify-center px-2 py-2.5 transition-colors ${
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
                  {t.icon === 'leaf' && (
                    <svg className="w-4 h-4" viewBox="0 0 75 95" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M71.2149 1.39246C70.793 -0.0177445 68.9922 -0.478644 67.9688 0.579955C66.5235 1.99016 64.6876 3.54476 62.4297 4.99016C56.8555 8.55266 51.9527 9.29486 45.9917 10.5293C31.2457 13.5645 15.4797 16.4551 6.66367 30.1073C1.12457 38.6776 -0.496526 49.6503 2.35897 59.4193C3.27694 62.5599 4.68708 65.6263 6.69878 68.2005C4.47608 73.0677 2.71437 78.1458 1.47997 83.3335C0.987785 85.3452 0.597165 87.3882 0.245575 89.4702C-0.0708351 91.4468 -0.461456 93.6343 1.76117 94.689C2.53851 95.0757 3.52287 95.1108 4.30027 94.7241C5.64007 94.0171 6.06197 92.3257 6.31197 90.8452C7.37057 84.4624 8.81587 78.3572 11.2847 72.3612C14.7769 74.5487 18.9409 75.6424 23.0657 76.1346C26.4876 76.5213 29.9095 76.5213 33.3317 76.1346C48.4997 74.3729 62.4687 65.3766 69.1677 51.6186C76.6482 36.0676 76.1524 17.5845 71.2149 1.39246ZM69.4883 26.6155C69.3125 34.9397 67.5469 42.5605 64.3399 49.2245C58.6602 60.9005 46.5629 69.1545 32.7349 70.7755C31.2193 70.9512 29.6646 71.0567 28.1138 71.0567C26.6333 71.0567 25.149 70.9864 23.7036 70.8106C19.4341 70.3184 16.0474 69.1895 13.5436 67.4239C14.8483 64.8145 16.2936 62.3106 17.9186 59.877C25.8913 47.779 35.7306 40.725 41.6916 36.455C45.4299 33.7753 48.8166 31.7284 51.3908 30.248C52.3791 29.6855 52.7306 28.4121 52.0978 27.498C52.0626 27.4629 52.0275 27.4277 51.9923 27.3925C51.465 26.7558 50.6173 26.4746 49.8048 26.7207C49.7345 26.7558 49.6642 26.791 49.5939 26.8261C47.3712 27.8495 44.34 29.3652 40.9181 31.4472C35.379 34.7636 23.4921 42.0992 13.7231 56.0682C12.1372 58.326 10.7583 60.5838 9.52389 62.8065C8.74655 61.3963 8.07859 59.7713 7.54729 58.0096C5.11369 49.6854 6.48869 40.3726 11.2153 33.0716C14.4965 27.9935 19.0825 24.3607 25.6413 21.6066C31.8132 18.9972 38.9383 17.5519 45.8523 16.1378L47.1218 15.8917C47.6843 15.7863 48.2156 15.6808 48.7429 15.5753C54.2468 14.4464 59.4659 13.423 65.3559 9.64954C66.0981 9.19251 66.8012 8.69642 67.5082 8.16904C68.9223 14.3018 69.6293 20.618 69.4887 26.614L69.4883 26.6155Z" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Log out */}
          <button
            onClick={handleLogout}
            className="w-full text-left px-2 py-2.5 text-sm transition-colors"
            style={{
              color: 'var(--theme-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--theme-text)';
              e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>Log out</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

