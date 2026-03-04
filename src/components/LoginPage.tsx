import { useState, FormEvent, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Detect if we're in dev environment
  const isDev = useMemo(() => {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local') || hostname.includes('dev');
  }, []);

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
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
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            Invite-only. Contact the owner for access.
          </p>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm mb-2"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border focus:outline-none focus:ring-1"
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
              autoComplete="email"
              required
            />
          </div>

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
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--theme-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--theme-text-muted)';
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
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
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: 'var(--theme-border)' }} />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span
              className="px-2"
              style={{
                backgroundColor: 'var(--theme-bg)',
                color: 'var(--theme-text-muted)',
              }}
            >
              or
            </span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full px-3 py-2 text-sm font-medium border transition-colors focus:outline-none flex items-center justify-center gap-2"
          style={{
            borderColor: 'var(--theme-border)',
            color: 'var(--theme-text)',
            backgroundColor: 'var(--theme-bg)',
            borderRadius: '0',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg, rgba(0,0,0,0.05))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--theme-bg)';
          }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </button>

        <div className="text-center">
          <Link
            to="/reset-password"
            className="text-sm"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
