// API fetch wrapper that handles 401 redirects
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  // Don't redirect if we're already on the login page
  const isLoginPage = window.location.pathname === '/login';
  
  try {
    const url = typeof input === 'string' ? input : input.toString();
    console.log('[API] Fetching:', url, { credentials: 'include' });
    
    const res = await fetch(input, {
      ...init,
      credentials: 'include', // Include cookies in all requests
    });
    
    console.log('[API] Response:', url, res.status, res.statusText);
    
    if (res.status === 401) {
      console.error('[API] 401 Unauthorized for:', url);
      console.error('[API] Cookies available:', document.cookie);
      
      // Only redirect if not on login page
      if (!isLoginPage) {
        console.log('[API] Redirecting to login...');
        window.location.href = '/login';
      }
      // Create a custom error that won't be logged as a warning
      const error = new Error('Unauthorized');
      (error as any).isUnauthorized = true;
      (error as any).suppressWarning = isLoginPage; // Suppress warning on login page
      throw error;
    }
    
    if (!res.ok && res.status !== 401) {
      console.error('[API] Non-OK response:', url, res.status, res.statusText);
    }
    
    return res;
  } catch (error) {
    console.error('[API] Fetch error:', typeof input === 'string' ? input : input.toString(), error);
    throw error;
  }
}
