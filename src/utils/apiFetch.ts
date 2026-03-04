import { supabase } from '../lib/supabase';

// API fetch wrapper that sends Supabase JWT and handles 401 redirects
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const isLoginPage = window.location.pathname === '/login';

  try {
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

    if (res.status === 401) {
      if (!isLoginPage) {
        window.location.href = '/login';
      }
      const error = new Error('Unauthorized');
      (error as any).isUnauthorized = true;
      (error as any).suppressWarning = isLoginPage;
      throw error;
    }

    return res;
  } catch (error) {
    throw error;
  }
}
