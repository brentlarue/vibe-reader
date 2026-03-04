import { supabase } from '../lib/supabase';

// API fetch wrapper that sends Supabase JWT and handles 401 redirects
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  // Get the current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(input, {
    ...init,
    headers,
  });

  // Return the response even on 401 — let callers decide how to handle it.
  // Only sign out and redirect if the session token was sent but rejected,
  // indicating the session is truly invalid (not just missing data).
  if (res.status === 401 && token) {
    // Sign out to clear the invalid session
    await supabase.auth.signOut();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  return res;
}
