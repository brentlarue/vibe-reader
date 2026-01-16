/**
 * API Key Repository
 * 
 * Manages API keys for automated access (n8n, scripts, etc.)
 * Keys are stored as SHA-256 hashes for security.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getAppEnv } from './env.js';
import crypto from 'crypto';

/**
 * Generate a new API key
 * @param {string} name - Human-readable name for the key
 * @param {Date|null} expiresAt - Optional expiration date
 * @returns {Promise<{key: string, id: string}>} The plain key (shown once) and key ID
 */
export async function createApiKey(name, expiresAt = null) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  // Generate a secure random API key (32 bytes = 256 bits)
  const plainKey = crypto.randomBytes(32).toString('hex');
  
  // Hash it with SHA-256 for storage
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      key_hash: keyHash,
      name: name.trim(),
      env,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating API key:', error);
    throw error;
  }

  console.log(`[DB] Created API key "${name}" for env=${env}`);
  
  // Return the plain key (only shown once) and the ID
  return {
    key: plainKey,
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
  };
}

/**
 * Verify an API key
 * @param {string} plainKey - The plain API key
 * @returns {Promise<{valid: boolean, keyId?: string, name?: string}>}
 */
export async function verifyApiKey(plainKey) {
  if (!isSupabaseConfigured()) {
    return { valid: false };
  }

  const env = getAppEnv();

  // Hash the provided key
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

  // Look up the hash
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, expires_at, env')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data) {
    return { valid: false };
  }

  // Check environment matches
  if (data.env !== env) {
    console.warn(`[API Key] Key found but env mismatch: key env=${data.env}, current env=${env}`);
    return { valid: false };
  }

  // Check expiration
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      console.warn(`[API Key] Key expired: ${data.id}`);
      return { valid: false };
    }
  }

  // Update last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    valid: true,
    keyId: data.id,
    name: data.name,
  };
}

/**
 * List all API keys for current environment
 * @returns {Promise<Array>} List of API keys (without plain keys)
 */
export async function listApiKeys() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, env, last_used_at, created_at, expires_at')
    .eq('env', env)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] Error listing API keys:', error);
    throw error;
  }

  return (data || []).map(key => ({
    id: key.id,
    name: key.name,
    env: key.env,
    lastUsedAt: key.last_used_at,
    createdAt: key.created_at,
    expiresAt: key.expires_at,
    isExpired: key.expires_at ? new Date(key.expires_at) < new Date() : false,
  }));
}

/**
 * Delete an API key
 * @param {string} keyId - Key UUID
 * @returns {Promise<void>}
 */
export async function deleteApiKey(keyId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', keyId)
    .eq('env', env);

  if (error) {
    console.error('[DB] Error deleting API key:', error);
    throw error;
  }

  console.log(`[DB] Deleted API key ${keyId} for env=${env}`);
}
