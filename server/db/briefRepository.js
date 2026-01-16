/**
 * Brief Repository
 * 
 * Data access layer for daily brief functionality.
 * Handles brief runs, audio URLs, and brief metadata.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getAppEnv } from './env.js';

/**
 * Get items for a specific date (for daily brief)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} List of feed items
 */
export async function getBriefItems(date) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();
  
  // Parse date and get start/end of day in UTC
  const startDate = new Date(date + 'T00:00:00.000Z');
  const endDate = new Date(date + 'T23:59:59.999Z');

  const { data, error } = await supabase
    .from('feed_items')
    .select('*')
    .eq('env', env)
    .in('status', ['inbox', 'saved']) // Only include inbox and saved items
    .gte('published_at', startDate.toISOString())
    .lte('published_at', endDate.toISOString())
    .order('brief_order', { ascending: true, nullsLast: true })
    .order('published_at', { ascending: false });

  if (error) {
    console.error('[DB] Error fetching brief items:', error);
    throw error;
  }

  // Import transform function from feedRepository
  // Note: We can't directly import it since it's not exported, so we'll duplicate the logic
  // or we could refactor feedRepository to export it, but for now we'll use the same pattern
  return (data || []).map(item => ({
    id: item.id,
    feedId: item.feed_id,
    source: item.source,
    sourceType: item.source_type,
    title: item.title,
    url: item.url,
    publishedAt: item.published_at,
    contentSnippet: item.content_snippet,
    fullContent: item.full_content,
    aiSummary: item.ai_summary,
    aiInsightfulReply: item.ai_insightful_reply,
    aiInvestorAnalysis: item.ai_investor_analysis,
    aiFounderImplications: item.ai_founder_implications,
    status: item.status,
    readingOrder: item.reading_order ?? null,
    audioBriefUrl: item.audio_brief_url,
    audioBriefGeneratedAt: item.audio_brief_generated_at,
    briefOrder: item.brief_order,
    updatedAt: item.updated_at,
  }));
}

/**
 * Get brief metadata for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Brief metadata
 */
export async function getBriefMetadata(date) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();
  
  // Parse date and get start/end of day in UTC
  const startDate = new Date(date + 'T00:00:00.000Z');
  const endDate = new Date(date + 'T23:59:59.999Z');

  // Get item count and unique feeds
  const { data: items, error: itemsError } = await supabase
    .from('feed_items')
    .select('feed_id, source')
    .eq('env', env)
    .in('status', ['inbox', 'saved'])
    .gte('published_at', startDate.toISOString())
    .lte('published_at', endDate.toISOString());

  if (itemsError) {
    console.error('[DB] Error fetching brief metadata:', itemsError);
    throw itemsError;
  }

  // Get unique feed sources
  const uniqueSources = [...new Set((items || []).map(item => item.source).filter(Boolean))];

  // Get brief run status if exists
  const { data: run } = await supabase
    .from('daily_brief_runs')
    .select('*')
    .eq('date', date)
    .eq('env', env)
    .single();

  return {
    date,
    articleCount: items?.length || 0,
    feeds: uniqueSources,
    runStatus: run?.status || null,
    runMetadata: run?.metadata || null,
  };
}

/**
 * Update audio brief URL for an item
 * @param {string} itemId - Item UUID
 * @param {string} audioUrl - URL to audio file
 * @param {number} order - Order in brief (optional)
 * @returns {Promise<Object>} Updated item
 */
export async function updateItemAudioBrief(itemId, audioUrl, order = null) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const updateData = {
    audio_brief_url: audioUrl,
    audio_brief_generated_at: new Date().toISOString(),
  };

  if (order !== null) {
    updateData.brief_order = order;
  }

  const { data, error } = await supabase
    .from('feed_items')
    .update(updateData)
    .eq('id', itemId)
    .eq('env', env)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating item audio brief:', error);
    throw error;
  }

  return data;
}

/**
 * Create or update a daily brief run
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Object} updates - Run updates
 * @returns {Promise<Object>} Run record
 */
export async function upsertBriefRun(date, updates) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('daily_brief_runs')
    .upsert({
      date,
      env,
      ...updates,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'date,env',
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error upserting brief run:', error);
    throw error;
  }

  return data;
}

/**
 * Get brief run for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>} Run record or null
 */
export async function getBriefRun(date) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('daily_brief_runs')
    .select('*')
    .eq('date', date)
    .eq('env', env)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No row found
      return null;
    }
    console.error('[DB] Error fetching brief run:', error);
    throw error;
  }

  return data;
}

/**
 * Get recent brief runs
 * @param {number} limit - Number of runs to fetch
 * @returns {Promise<Array>} List of runs
 */
export async function getRecentBriefRuns(limit = 10) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  const { data, error } = await supabase
    .from('daily_brief_runs')
    .select('*')
    .eq('env', env)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] Error fetching recent brief runs:', error);
    throw error;
  }

  return data || [];
}
