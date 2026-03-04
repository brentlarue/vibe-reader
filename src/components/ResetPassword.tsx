import { useState, FormEvent, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Detect if we arrived via a password reset link (has access_token in hash)
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    // Check URL hash first (before Supabase client processes it)
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsResetting(true);
    }

    // Also listen for PASSWORD_RECOVERY event (Supabase may process the hash
    // before the component mounts, removing it from the URL)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResetting(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessage('Check your email for a password reset link.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage('Password updated. Redirecting...');
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--theme-text)' }}
          >
            {isResetting ? 'Set New Password' : 'Reset Password'}
          </h1>
        </div>

        {isResetting ? (
          <form onSubmit={handleSetNewPassword} className="space-y-4">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm mb-2"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: 'var(--theme-bg)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  borderRadius: '0',
                }}
                required
                minLength={6}
                disabled={isLoading}
                autoComplete="new-password"
              />
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

            {message && (
              <div
                className="px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--theme-success-bg, #dcfce7)',
                  color: 'var(--theme-success-text, #16a34a)',
                }}
              >
                {message}
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
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
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
                required
                disabled={isLoading}
                autoComplete="email"
              />
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

            {message && (
              <div
                className="px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--theme-success-bg, #dcfce7)',
                  color: 'var(--theme-success-text, #16a34a)',
                }}
              >
                {message}
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
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <Link
              to="/login"
              className="block text-center text-sm"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
