/**
 * User AI Key Repository
 *
 * Manages per-user encrypted API keys for LLM providers.
 * Uses AES-256-GCM encryption with AI_KEY_ENCRYPTION_SECRET env var.
 */

import crypto from 'crypto';
import { getAppEnv } from './env.js';

// Lazy import supabase to ensure dotenv has loaded
let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const mod = await import('./supabaseClient.js');
    _supabase = mod.supabase;
  }
  return _supabase;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET is not set');
  }
  // Derive a 32-byte key from the secret
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plainText) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  // Store as iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
}

function decrypt(encryptedStr) {
  const key = getEncryptionKey();
  const [ivB64, tagB64, ciphertext] = encryptedStr.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function makeHint(apiKey) {
  // Show last 4 characters
  return '****' + apiKey.slice(-4);
}

/**
 * Save (upsert) a user's API key for a provider
 */
export async function saveUserAiKey(userId, provider, plainKey) {
  const supabase = await getSupabase();
  const env = getAppEnv();
  const encryptedKey = encrypt(plainKey);
  const keyHint = makeHint(plainKey);

  const { data, error } = await supabase
    .from('user_ai_keys')
    .upsert({
      user_id: userId,
      provider,
      encrypted_key: encryptedKey,
      key_hint: keyHint,
      env,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider,env',
    })
    .select()
    .single();

  if (error) {
    console.error('[UserAiKeys] Error saving key:', error);
    throw new Error(`Failed to save API key: ${error.message}`);
  }

  return { provider, keyHint, createdAt: data.created_at };
}

/**
 * Get a user's decrypted API key for a provider
 * Returns null if not found
 */
export async function getUserAiKey(userId, provider) {
  const supabase = await getSupabase();
  const env = getAppEnv();

  const { data, error } = await supabase
    .from('user_ai_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('env', env)
    .single();

  if (error || !data) {
    return null;
  }

  try {
    return decrypt(data.encrypted_key);
  } catch (err) {
    console.error('[UserAiKeys] Decryption failed:', err.message);
    return null;
  }
}

/**
 * List all keys for a user (provider + hint only, no decryption)
 */
export async function listUserAiKeys(userId) {
  const supabase = await getSupabase();
  const env = getAppEnv();

  const { data, error } = await supabase
    .from('user_ai_keys')
    .select('provider, key_hint, created_at')
    .eq('user_id', userId)
    .eq('env', env)
    .order('provider');

  if (error) {
    console.error('[UserAiKeys] Error listing keys:', error);
    throw new Error(`Failed to list API keys: ${error.message}`);
  }

  return (data || []).map(row => ({
    provider: row.provider,
    keyHint: row.key_hint,
    createdAt: row.created_at,
  }));
}

/**
 * Delete a user's API key for a provider
 */
export async function deleteUserAiKey(userId, provider) {
  const supabase = await getSupabase();
  const env = getAppEnv();

  const { error } = await supabase
    .from('user_ai_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('env', env);

  if (error) {
    console.error('[UserAiKeys] Error deleting key:', error);
    throw new Error(`Failed to delete API key: ${error.message}`);
  }
}
