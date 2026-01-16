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

  // Debug: Log what we're storing
  console.log(`[DB] Creating API key "${name}" for env=${env}`);
  console.log(`[DB] Plain key (first 8 chars): ${plainKey.substring(0, 8)}... (length: ${plainKey.length})`);
  console.log(`[DB] Hash to store: ${keyHash.substring(0, 16)}...`);

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

  console.log(`[DB] Successfully stored API key "${name}" with hash starting: ${keyHash.substring(0, 16)}...`);
  
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
    console.warn('[API Key] Supabase not configured');
    return { valid: false };
  }

  const env = getAppEnv();

  // Trim any whitespace from the key
  const cleanKey = plainKey.trim();
  
  // Debug: Log key info (first/last chars only for security)
  console.log(`[API Key] Verifying key: ${cleanKey.substring(0, 8)}...${cleanKey.substring(cleanKey.length - 8)} (length: ${cleanKey.length})`);

  // Hash the provided key
  const keyHash = crypto.createHash('sha256').update(cleanKey).digest('hex');
  
  // Debug: Log the computed hash
  console.log(`[API Key] Computed hash: ${keyHash.substring(0, 16)}...`);

  // Look up the hash - fetch ALL keys first to debug
  const { data: allKeys, error: listError } = await supabase
    .from('api_keys')
    .select('id, name, key_hash, env');
  
  if (listError) {
    console.warn(`[API Key] Error listing keys: ${listError.message}`);
  } else {
    console.log(`[API Key] Total keys in database: ${allKeys?.length || 0}`);
    allKeys?.forEach(k => {
      console.log(`[API Key]   - ${k.name} (env=${k.env}), hash starts with: ${k.key_hash?.substring(0, 16)}...`);
    });
  }

  // Now do the actual lookup
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, expires_at, env')
    .eq('key_hash', keyHash);

  if (error) {
    console.warn(`[API Key] Database error: ${error.message}`);
    console.warn(`[API Key] Current env: ${env}`);
    return { valid: false };
  }

  if (!data || data.length === 0) {
    console.warn(`[API Key] Key not found! Hash ${keyHash.substring(0, 16)}... does not match any stored hash.`);
    console.warn(`[API Key] Current env: ${env}`);
    return { valid: false };
  }

  if (data.length > 1) {
    console.warn(`[API Key] Multiple keys found with same hash (unexpected!). Using first one.`);
  }

  const keyData = data[0];
  
  console.log(`[API Key] Key found: ${keyData.name}, env=${keyData.env}, current env=${env}`);

  // Check environment matches
  if (keyData.env !== env) {
    console.warn(`[API Key] Key found but env mismatch: key env=${keyData.env}, current env=${env}`);
    console.warn(`[API Key] Make sure APP_ENV in .env matches the environment where the key was created`);
    return { valid: false };
  }

  // Check expiration
  if (keyData.expires_at) {
    const expiresAt = new Date(keyData.expires_at);
    if (expiresAt < new Date()) {
      console.warn(`[API Key] Key expired: ${keyData.id}`);
      return { valid: false };
    }
  }

  // Update last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyData.id);

  return {
    valid: true,
    keyId: keyData.id,
    name: keyData.name,
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
