/**
 * Feed Repository
 * 
 * Data access layer for feeds and feed items using Supabase.
 * All functions return plain JS objects suitable for the frontend.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';

// ============================================================================
// FEEDS
// ============================================================================

/**
 * Get all feeds
 * @returns {Promise<Array>} List of feeds
 */
export async function getFeeds() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  const { data, error } = await supabase
    .from('feeds')
    .select('*')
    .eq('env', env)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error fetching feeds:', error);
    throw error;
  }

  // Transform to match frontend Feed type
  return (data || []).map(feed => ({
    id: feed.id,
    name: feed.display_name,
    url: feed.url,
    sourceType: feed.source_type,
    rssTitle: feed.rss_title,
  }));
}

/**
 * Get a single feed by ID
 * @param {string} feedId - Feed UUID
 * @returns {Promise<Object|null>} Feed object or null
 */
export async function getFeed(feedId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase
    .from('feeds')
    .select('*')
    .eq('id', feedId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[DB] Error fetching feed:', error);
    throw error;
  }

  return data ? {
    id: data.id,
    name: data.display_name,
    url: data.url,
    sourceType: data.source_type,
    rssTitle: data.rss_title,
  } : null;
}

/**
 * Get feed by URL
 * @param {string} url - Feed URL
 * @returns {Promise<Object|null>} Feed object or null
 */
export async function getFeedByUrl(url) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  const { data, error } = await supabase
    .from('feeds')
    .select('*')
    .eq('url', url)
    .eq('env', env)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[DB] Error fetching feed by URL:', error);
    throw error;
  }

  return data ? {
    id: data.id,
    name: data.display_name,
    url: data.url,
    sourceType: data.source_type,
    rssTitle: data.rss_title,
  } : null;
}

/**
 * Create a new feed
 * @param {Object} feed - Feed data
 * @param {string} feed.url - Feed URL
 * @param {string} feed.displayName - Display name
 * @param {string} [feed.rssTitle] - Original RSS title
 * @param {string} [feed.sourceType='rss'] - Source type
 * @returns {Promise<Object>} Created feed
 */
export async function createFeed({ url, displayName, rssTitle, sourceType = 'rss' }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  const { data, error } = await supabase
    .from('feeds')
    .insert({
      url,
      display_name: displayName,
      rss_title: rssTitle || null,
      source_type: sourceType,
      env,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating feed:', error);
    throw error;
  }

  return {
    id: data.id,
    name: data.display_name,
    url: data.url,
    sourceType: data.source_type,
    rssTitle: data.rss_title,
  };
}

/**
 * Update a feed's display name and update all related items' source field
 * @param {string} feedId - Feed UUID
 * @param {string} displayName - New display name
 * @returns {Promise<Object>} Updated feed
 */
export async function updateFeedName(feedId, displayName) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // First, get the current feed to know its rssTitle for matching items
  const { data: currentFeed, error: fetchError } = await supabase
    .from('feeds')
    .select('rss_title')
    .eq('id', feedId)
    .single();

  if (fetchError) {
    console.error('[DB] Error fetching feed for rename:', fetchError);
    throw fetchError;
  }

  // Update the feed's display name
  const { data, error } = await supabase
    .from('feeds')
    .update({ display_name: displayName })
    .eq('id', feedId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating feed name:', error);
    throw error;
  }

  // Update all items that belong to this feed to use the rssTitle as source (not display name)
  // Items should always use rssTitle for matching, display name is only for UI
  if (currentFeed.rss_title) {
    // Get environment (default to 'prod' if not set)
    const env = process.env.APP_ENV || 'prod';
    const { error: itemsError } = await supabase
      .from('feed_items')
      .update({ source: currentFeed.rss_title })
      .eq('feed_id', feedId)
      .eq('env', env);

    if (itemsError) {
      console.error('[DB] Error updating feed items source:', itemsError);
      // Don't throw - feed was updated successfully, items update is secondary
    }
  }

  return {
    id: data.id,
    name: data.display_name,
    url: data.url,
    sourceType: data.source_type,
    rssTitle: data.rss_title,
  };
}

/**
 * Update a feed's RSS title (from feed metadata)
 * @param {string} feedId - Feed UUID
 * @param {string} rssTitle - RSS title from feed
 * @returns {Promise<Object>} Updated feed
 */
export async function updateFeedRssTitle(feedId, rssTitle) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase
    .from('feeds')
    .update({ rss_title: rssTitle })
    .eq('id', feedId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating feed RSS title:', error);
    throw error;
  }

  // Update all items for this feed to use the rssTitle as source
  // This ensures items can be correctly matched after RSS title changes
  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';
  const { error: itemsError } = await supabase
    .from('feed_items')
    .update({ source: rssTitle })
    .eq('feed_id', feedId)
    .eq('env', env);

  if (itemsError) {
    console.error('[DB] Error updating feed items source with rssTitle:', itemsError);
    // Don't throw - feed was updated successfully, items update is secondary
  }

  return {
    id: data.id,
    name: data.display_name,
    url: data.url,
    sourceType: data.source_type,
    rssTitle: data.rss_title,
  };
}

/**
 * Delete a feed and all its items
 * @param {string} feedId - Feed UUID
 * @returns {Promise<void>}
 */
export async function deleteFeed(feedId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Items are automatically deleted due to ON DELETE CASCADE
  const { error } = await supabase
    .from('feeds')
    .delete()
    .eq('id', feedId);

  if (error) {
    console.error('[DB] Error deleting feed:', error);
    throw error;
  }
}

// ============================================================================
// FEED ITEMS
// ============================================================================

/**
 * Get all feed items
 * @param {Object} [options] - Query options
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.feedId] - Filter by feed ID
 * @param {number} [options.limit] - Limit results
 * @returns {Promise<Array>} List of feed items
 */
export async function getFeedItems({ status, feedId, limit } = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  let query = supabase
    .from('feed_items')
    .select('*')
    .eq('env', env)
    .order('published_at', { ascending: false, nullsFirst: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (feedId) {
    query = query.eq('feed_id', feedId);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[DB] Error fetching feed items:', error);
    throw error;
  }

  // Transform to match frontend FeedItem type
  return (data || []).map(transformFeedItem);
}

/**
 * Get a single feed item by ID (supports UUID or external_id/URL lookup)
 * @param {string} itemId - Item UUID or external_id or URL
 * @returns {Promise<Object|null>} Feed item or null
 */
export async function getFeedItem(itemId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  // First try by UUID id
  let { data, error } = await supabase
    .from('feed_items')
    .select('*')
    .eq('id', itemId)
    .eq('env', env)
    .single();

  // If not found and itemId looks like a URL or non-UUID, try external_id
  if (error?.code === 'PGRST116' || (error && !data)) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId);
    if (!isUUID) {
      // Try by external_id
      const result = await supabase
        .from('feed_items')
        .select('*')
        .eq('external_id', itemId)
        .eq('env', env)
        .single();
      
      if (!result.error) {
        return transformFeedItem(result.data);
      }
      
      // Try by URL
      const urlResult = await supabase
        .from('feed_items')
        .select('*')
        .eq('url', itemId)
        .eq('env', env)
        .single();
      
      if (!urlResult.error) {
        return transformFeedItem(urlResult.data);
      }
    }
    return null; // Not found
  }

  if (error) {
    console.error('[DB] Error fetching feed item:', error);
    throw error;
  }

  return data ? transformFeedItem(data) : null;
}

/**
 * Upsert feed items (insert or update on conflict)
 * @param {string} feedId - Feed UUID
 * @param {Array} items - Array of feed items
 * @returns {Promise<Array>} Upserted items
 */
export async function upsertFeedItems(feedId, items) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  if (!items || items.length === 0) {
    return [];
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  // Transform items for database
  const dbItems = items.map(item => ({
    feed_id: feedId,
    external_id: item.id || item.externalId || null,
    title: item.title,
    url: item.url,
    published_at: item.publishedAt || null,
    content_snippet: item.contentSnippet || null,
    full_content: item.fullContent || null,
    ai_summary: item.aiSummary || null,
    status: item.status || 'inbox',
    paywall_status: item.paywallStatus || 'unknown',
    source: item.source || null,
    source_type: item.sourceType || 'rss',
    env,
  }));

  // Use upsert with ON CONFLICT on (feed_id, url, env)
  const { data, error } = await supabase
    .from('feed_items')
    .upsert(dbItems, {
      onConflict: 'feed_items_feed_id_url_env_unique',
      ignoreDuplicates: false,
    })
    .select();

  if (error) {
    console.error('[DB] Error upserting feed items:', error);
    throw error;
  }

  return (data || []).map(transformFeedItem);
}

/**
 * Update a feed item's status (supports UUID or external_id/URL lookup)
 * @param {string} itemId - Item UUID or external_id or URL
 * @param {string} status - New status ('inbox' | 'saved' | 'bookmarked' | 'archived')
 * @returns {Promise<Object>} Updated item
 */
export async function updateFeedItemStatus(itemId, status) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const validStatuses = ['inbox', 'saved', 'bookmarked', 'archived'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  // First, find the item to get its UUID
  const item = await getFeedItem(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { data, error } = await supabase
    .from('feed_items')
    .update({ status })
    .eq('id', item.id)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating feed item status:', error);
    throw error;
  }

  return transformFeedItem(data);
}

/**
 * Update a feed item's AI summary (supports UUID or external_id/URL lookup)
 * @param {string} itemId - Item UUID or external_id or URL
 * @param {string} summary - AI summary text
 * @returns {Promise<Object>} Updated item
 */
export async function updateFeedItemSummary(itemId, summary) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // First, find the item to get its UUID
  const item = await getFeedItem(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { data, error } = await supabase
    .from('feed_items')
    .update({ ai_summary: summary })
    .eq('id', item.id)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating feed item summary:', error);
    throw error;
  }

  return transformFeedItem(data);
}

/**
 * Update a feed item's AI feature (supports UUID or external_id/URL lookup)
 * @param {string} itemId - Item UUID or external_id or URL
 * @param {string} featureType - Feature type ('insightful-reply' | 'investor-analysis' | 'founder-implications')
 * @param {string} content - AI feature content
 * @returns {Promise<Object>} Updated item
 */
export async function updateFeedItemAIFeature(itemId, featureType, content) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Map feature type to database column
  const columnMap = {
    'insightful-reply': 'ai_insightful_reply',
    'investor-analysis': 'ai_investor_analysis',
    'founder-implications': 'ai_founder_implications',
  };

  const column = columnMap[featureType];
  if (!column) {
    throw new Error(`Invalid feature type: ${featureType}`);
  }

  // First, find the item to get its UUID
  const item = await getFeedItem(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { data, error } = await supabase
    .from('feed_items')
    .update({ [column]: content })
    .eq('id', item.id)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating AI feature:', error);
    throw error;
  }

  return transformFeedItem(data);
}

/**
 * Update a feed item's paywall status (supports UUID or external_id/URL lookup)
 * @param {string} itemId - Item UUID or external_id or URL
 * @param {string} paywallStatus - Paywall status ('unknown' | 'free' | 'paid')
 * @returns {Promise<Object>} Updated item
 */
export async function updateFeedItemPaywallStatus(itemId, paywallStatus) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const validStatuses = ['unknown', 'free', 'paid'];
  if (!validStatuses.includes(paywallStatus)) {
    throw new Error(`Invalid paywall status: ${paywallStatus}`);
  }

  // First, find the item to get its UUID
  const item = await getFeedItem(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { data, error } = await supabase
    .from('feed_items')
    .update({ paywall_status: paywallStatus })
    .eq('id', item.id)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating feed item paywall status:', error);
    throw error;
  }

  return transformFeedItem(data);
}

/**
 * Reassociate a feed item with a different feed (updates feed_id and source)
 * @param {string} itemId - Item UUID or external_id or URL
 * @param {string} feedId - New feed UUID
 * @param {string} source - New source value (rssTitle)
 * @returns {Promise<Object>} Updated item
 */
export async function reassociateFeedItem(itemId, feedId, source) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // First, find the item to get its UUID
  const item = await getFeedItem(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  // Update the item's feed_id and source
  const { data, error } = await supabase
    .from('feed_items')
    .update({ 
      feed_id: feedId,
      source: source
    })
    .eq('id', item.id)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error reassociating feed item:', error);
    throw error;
  }

  return transformFeedItem(data);
}

/**
 * Delete a feed item (supports UUID or external_id/URL lookup)
 * @param {string} itemId - Item UUID or external_id or URL
 * @returns {Promise<void>}
 */
export async function deleteFeedItem(itemId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // First, find the item to get its UUID
  const item = await getFeedItem(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { error } = await supabase
    .from('feed_items')
    .delete()
    .eq('id', item.id);

  if (error) {
    console.error('[DB] Error deleting feed item:', error);
    throw error;
  }
}

/**
 * Delete all feed items with a specific status
 * @param {string} status - Status to delete
 * @returns {Promise<number>} Number of deleted items
 */
export async function deleteFeedItemsByStatus(status) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase
    .from('feed_items')
    .delete()
    .eq('status', status)
    .select();

  if (error) {
    console.error('[DB] Error deleting feed items by status:', error);
    throw error;
  }

  return data?.length || 0;
}

// ============================================================================
// PREFERENCES
// ============================================================================

/**
 * Get all preferences
 * @returns {Promise<Object>} Preferences object
 */
export async function getPreferences() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  const { data, error } = await supabase
    .from('preferences')
    .select('key, value')
    .eq('env', env);

  if (error) {
    console.error('[DB] Error fetching preferences:', error);
    throw error;
  }

  // Transform array of key-value pairs to object
  const prefs = {};
  for (const row of (data || [])) {
    prefs[row.key] = row.value;
  }

  return prefs;
}

/**
 * Set a preference
 * @param {string} key - Preference key
 * @param {*} value - Preference value (will be stored as JSONB)
 * @returns {Promise<void>}
 */
export async function setPreference(key, value) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  const { error } = await supabase
    .from('preferences')
    .upsert({ key, value, env }, { onConflict: 'preferences_key_env_unique' });

  if (error) {
    console.error('[DB] Error setting preference:', error);
    throw error;
  }
}

/**
 * Update multiple preferences
 * @param {Object} updates - Object of key-value pairs to update
 * @returns {Promise<void>}
 */
export async function updatePreferences(updates) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get environment (default to 'prod' if not set)
  const env = process.env.APP_ENV || 'prod';

  const upserts = Object.entries(updates).map(([key, value]) => ({
    key,
    value,
    env,
  }));

  console.log('[DB] Updating preferences:', upserts);
  const { error } = await supabase
    .from('preferences')
    .upsert(upserts, { onConflict: 'preferences_key_env_unique' });

  if (error) {
    console.error('[DB] Error updating preferences:', error);
    throw error;
  }
  console.log('[DB] Successfully updated preferences');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Transform database feed item to frontend format
 * @param {Object} dbItem - Database row
 * @returns {Object} Frontend-compatible feed item
 */
function transformFeedItem(dbItem) {
  return {
    id: dbItem.id,
    feedId: dbItem.feed_id,
    externalId: dbItem.external_id,
    source: dbItem.source,
    sourceType: dbItem.source_type,
    title: dbItem.title,
    url: dbItem.url,
    publishedAt: dbItem.published_at,
    contentSnippet: dbItem.content_snippet,
    fullContent: dbItem.full_content,
    aiSummary: dbItem.ai_summary,
    aiInsightfulReply: dbItem.ai_insightful_reply,
    aiInvestorAnalysis: dbItem.ai_investor_analysis,
    aiFounderImplications: dbItem.ai_founder_implications,
    status: dbItem.status,
    paywallStatus: dbItem.paywall_status,
  };
}

/**
 * Check if a feed item already exists by URL
 * @param {string} feedId - Feed UUID
 * @param {string} url - Item URL
 * @returns {Promise<boolean>}
 */
export async function feedItemExistsByUrl(feedId, url) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { count, error } = await supabase
    .from('feed_items')
    .select('id', { count: 'exact', head: true })
    .eq('feed_id', feedId)
    .eq('url', url);

  if (error) {
    console.error('[DB] Error checking feed item existence:', error);
    throw error;
  }

  return count > 0;
}

