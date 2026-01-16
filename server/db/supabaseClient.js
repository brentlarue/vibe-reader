/**
 * Supabase Client Configuration
 * 
 * This module creates and exports a Supabase client for server-side use only.
 * It uses the service role key which has full access to the database.
 * NEVER expose this client or the service role key to the frontend.
 */

import { createClient } from '@supabase/supabase-js';

// Lazy initialization - read env vars when first accessed, not at module load time
// This ensures dotenv.config() has run first
let supabaseClient = null;
let initialized = false;

function initializeSupabase() {
  if (initialized) {
    return supabaseClient;
  }
  
  initialized = true;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Log configuration status on startup
  console.log('=== Supabase Configuration ===');
  console.log('SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? `${supabaseServiceKey.substring(0, 20)}...` : 'NOT SET');

  // Validate environment variables
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ ERROR: Supabase environment variables not configured!');
    console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
    console.error('   Without Supabase, data will be lost on each deployment!');
    supabaseClient = null;
  } else {
    console.log('✓ Supabase configured - data will persist in cloud database');
    // Create Supabase client with service role key
    // Service role key bypasses Row Level Security (RLS)
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  console.log('==============================');
  
  return supabaseClient;
}

/**
 * Get the Supabase client (lazy initialization)
 * @returns {Object|null} Supabase client or null
 */
function getSupabase() {
  if (!initialized) {
    initializeSupabase();
  }
  return supabaseClient;
}

/**
 * Check if Supabase is properly configured
 * @returns {boolean} True if Supabase client is available
 */
export function isSupabaseConfigured() {
  if (!initialized) {
    initializeSupabase();
  }
  const configured = supabaseClient !== null;
  // Log on first check to help debug
  if (!configured) {
    console.warn('[DB] isSupabaseConfigured() returned false - using file storage');
  }
  return configured;
}

// Export supabase as a Proxy to maintain backward compatibility
// This allows existing code like `supabase.from('table')` to work
// while ensuring lazy initialization
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getSupabase();
    if (!client) return undefined;
    const value = client[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

