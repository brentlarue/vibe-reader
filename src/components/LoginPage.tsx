import { useState, FormEvent, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export default function LoginPage() {
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Detect if we're in dev environment (localhost or dev domain)
  const isDev = useMemo(() => {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local') || hostname.includes('dev');
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    console.log('[LOGIN-FE] Submitting login form');
    console.log('[LOGIN-FE] Password length:', password.length);
    console.log('[LOGIN-FE] Remember me:', rememberMe);

    try {
      console.log('[LOGIN-FE] Calling /api/login...');
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password, rememberMe }),
      });

      console.log('[LOGIN-FE] Response status:', res.status);
      console.log('[LOGIN-FE] Response headers:', Object.fromEntries(res.headers.entries()));
      
      const data = await res.json().catch(() => ({}));
      console.log('[LOGIN-FE] Response data:', data);

      if (res.ok) {
        // Login successful, redirect to home
        console.log('[LOGIN-FE] Login successful, redirecting to /');
        window.location.href = '/';
      } else if (res.status === 401) {
        console.log('[LOGIN-FE] 401 Unauthorized');
        setError(data.error || 'Incorrect password');
      } else {
        console.log('[LOGIN-FE] Other error:', res.status);
        setError(data.error || 'An error occurred. Please try again.');
      }
    } catch (error) {
      console.error('[LOGIN-FE] Login error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundColor: 'var(--theme-bg)',
        color: 'var(--theme-text)',
      }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight flex items-center gap-2 whitespace-nowrap"
            style={{ color: 'var(--theme-text)' }}
          >
            <span>The Signal</span>
            {isDev && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded"
                style={{
                  backgroundColor: 'var(--theme-button-bg)',
                  color: 'var(--theme-button-text)',
                  lineHeight: '1.2',
                }}
              >
                Dev
              </span>
            )}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hidden username field for accessibility (password-only auth) */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value="user"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
          />
          <div>
            <label
              htmlFor="password"
              className="block text-sm mb-2"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 text-sm border focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: 'var(--theme-bg)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  borderRadius: '0',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--theme-accent)';
                  e.currentTarget.style.outline = '1px solid var(--theme-accent)';
                  e.currentTarget.style.outlineOffset = '-1px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--theme-border)';
                  e.currentTarget.style.outline = 'none';
                }}
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{
                  color: 'var(--theme-text-muted)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--theme-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--theme-text-muted)';
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4"
              style={{
                accentColor: 'var(--theme-accent)',
              }}
              disabled={isLoading}
            />
            <label
              htmlFor="rememberMe"
              className="ml-2 text-sm"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              Remember me
            </label>
          </div>

          {error && (
            <div
              className="px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--theme-error-bg, #fee2e2)',
                color: 'var(--theme-error-text, #dc2626)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm font-medium transition-colors focus:outline-none"
            style={{
              backgroundColor: isLoading ? 'var(--theme-text-muted)' : 'var(--theme-text)',
              color: 'var(--theme-bg)',
              borderRadius: '0',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'var(--theme-text-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'var(--theme-text)';
              }
            }}
          >
            {isLoading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}

