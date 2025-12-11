/**
 * Supabase Client Configuration
 * 
 * This module creates and exports a Supabase client for server-side use only.
 * It uses the service role key which has full access to the database.
 * NEVER expose this client or the service role key to the frontend.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('WARNING: Supabase environment variables not configured.');
  console.warn('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
  console.warn('The app will fall back to file-based storage.');
}

// Create Supabase client with service role key
// Service role key bypasses Row Level Security (RLS)
const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Check if Supabase is properly configured
 * @returns {boolean} True if Supabase client is available
 */
export function isSupabaseConfigured() {
  return supabase !== null;
}

export { supabase };

