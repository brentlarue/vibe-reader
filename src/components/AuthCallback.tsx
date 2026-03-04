import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth state change — Supabase processes the URL hash tokens
    // and fires SIGNED_IN once the session is established.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          navigate('/', { replace: true });
        }
      }
    );

    // Fallback: if already signed in (e.g. hash was processed before listener attached)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true });
      }
    });

    // Safety timeout — redirect to login if nothing happens after 5s
    const timeout = setTimeout(() => {
      navigate('/login', { replace: true });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
    >
      <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
        Signing you in...
      </div>
    </div>
  );
}
