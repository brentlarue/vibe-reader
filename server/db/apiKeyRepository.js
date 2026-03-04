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
 * @param {string} userId - User UUID
 * @param {Date|null} expiresAt - Optional expiration date
 * @returns {Promise<{key: string, id: string}>} The plain key (shown once) and key ID
 */
export async function createApiKey(name, userId, expiresAt = null) {
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
      user_id: userId,
      env,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating API key:', error);
    throw error;
  }

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
 * @returns {Promise<{valid: boolean, userId?: string, keyId?: string, name?: string}>}
 */
export async function verifyApiKey(plainKey) {
  if (!isSupabaseConfigured()) {
    return { valid: false };
  }

  const env = getAppEnv();
  const cleanKey = plainKey.trim();

  // Hash the provided key
  const keyHash = crypto.createHash('sha256').update(cleanKey).digest('hex');

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, expires_at, env, user_id')
    .eq('key_hash', keyHash);

  if (error) {
    console.warn(`[API Key] Database error: ${error.message}`);
    return { valid: false };
  }

  if (!data || data.length === 0) {
    return { valid: false };
  }

  const keyData = data[0];

  // Check environment matches
  if (keyData.env !== env) {
    return { valid: false };
  }

  // Check expiration
  if (keyData.expires_at) {
    const expiresAt = new Date(keyData.expires_at);
    if (expiresAt < new Date()) {
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
    userId: keyData.user_id,
    keyId: keyData.id,
    name: keyData.name,
  };
}

/**
 * List all API keys for current environment and user
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} List of API keys (without plain keys)
 */
export async function listApiKeys(userId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, env, last_used_at, created_at, expires_at')
    .eq('env', env)
    .eq('user_id', userId)
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
 * @param {string} userId - User UUID
 * @returns {Promise<void>}
 */
export async function deleteApiKey(keyId, userId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', keyId)
    .eq('env', env)
    .eq('user_id', userId);

  if (error) {
    console.error('[DB] Error deleting API key:', error);
    throw error;
  }
}
