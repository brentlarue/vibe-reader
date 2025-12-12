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

// Log configuration status on startup
console.log('=== Supabase Configuration ===');
console.log('SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? `${supabaseServiceKey.substring(0, 20)}...` : 'NOT SET');

// Validate environment variables
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ ERROR: Supabase environment variables not configured!');
  console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  console.error('   Without Supabase, data will be lost on each deployment!');
} else {
  console.log('✓ Supabase configured - data will persist in cloud database');
}
console.log('==============================');

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
  const configured = supabase !== null;
  // Log on first check to help debug
  if (!configured) {
    console.warn('[DB] isSupabaseConfigured() returned false - using file storage');
  }
  return configured;
}

export { supabase };

