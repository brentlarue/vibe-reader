// API fetch wrapper that handles 401 redirects
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  // Don't redirect if we're already on the login page
  const isLoginPage = window.location.pathname === '/login';
  
  const res = await fetch(input, {
    ...init,
    credentials: 'include', // Include cookies in all requests
  });
  
  if (res.status === 401) {
    // Only redirect if not on login page
    if (!isLoginPage) {
      window.location.href = '/login';
    }
    // Create a custom error that won't be logged as a warning
    const error = new Error('Unauthorized');
    (error as any).isUnauthorized = true;
    (error as any).suppressWarning = isLoginPage; // Suppress warning on login page
    throw error;
  }
  
  return res;
}

