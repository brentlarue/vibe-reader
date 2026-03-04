import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getAppEnv } from './env.js';

/**
 * List all feature requests for the current environment
 * Returns requests with vote count and whether current user has voted
 */
export async function listFeatureRequests(userId, sort = 'top') {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const env = getAppEnv();

  // Fetch all feature requests for this env
  const { data: requests, error: requestsError } = await supabase
    .from('feature_requests')
    .select('*')
    .eq('env', env)
    .order(sort === 'top' ? 'vote_count' : 'created_at', { ascending: false });

  if (requestsError) {
    console.error('[FeatureRequests] Error listing requests:', requestsError);
    throw requestsError;
  }

  // Fetch all votes by current user
  const { data: userVotes, error: votesError } = await supabase
    .from('feature_request_votes')
    .select('feature_request_id')
    .eq('user_id', userId)
    .eq('env', env);

  if (votesError) {
    console.error('[FeatureRequests] Error listing votes:', votesError);
    throw votesError;
  }

  const votedIds = new Set((userVotes || []).map(v => v.feature_request_id));

  return (requests || []).map(r => transformRequest(r, votedIds.has(r.id)));
}

/**
 * Create a new feature request
 * Auto-votes for the submitter (sets vote_count to 1, inserts vote record)
 */
export async function createFeatureRequest(userId, userEmail, title, description, env = null) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  env = env || getAppEnv();

  // Insert the feature request
  const { data: request, error: insertError } = await supabase
    .from('feature_requests')
    .insert({
      user_id: userId,
      user_email: userEmail,
      title,
      description: description || null,
      env,
      vote_count: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    console.error('[FeatureRequests] Error creating request:', insertError);
    throw insertError;
  }

  // Insert the auto-vote for the submitter
  const { error: voteError } = await supabase
    .from('feature_request_votes')
    .insert({
      feature_request_id: request.id,
      user_id: userId,
      env,
    });

  if (voteError) {
    console.error('[FeatureRequests] Error inserting auto-vote:', voteError);
    throw voteError;
  }

  return transformRequest(request, true);
}

/**
 * Toggle a vote on a feature request
 * If user has voted, removes vote and decrements count
 * If user hasn't voted, adds vote and increments count
 * Returns { voted: boolean, voteCount: number }
 */
export async function toggleVote(userId, requestId, env = null) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  env = env || getAppEnv();

  // Check if user has already voted
  const { data: existingVote, error: checkError } = await supabase
    .from('feature_request_votes')
    .select('id')
    .eq('feature_request_id', requestId)
    .eq('user_id', userId)
    .eq('env', env)
    .maybeSingle();

  if (checkError) {
    console.error('[FeatureRequests] Error checking vote:', checkError);
    throw checkError;
  }

  if (existingVote) {
    // Remove vote
    const { error: deleteError } = await supabase
      .from('feature_request_votes')
      .delete()
      .eq('id', existingVote.id);

    if (deleteError) {
      console.error('[FeatureRequests] Error removing vote:', deleteError);
      throw deleteError;
    }

    // Decrement count via RPC
    const { error: decrementError } = await supabase.rpc('decrement_feature_request_votes', {
      request_id: requestId,
    });

    if (decrementError) {
      console.error('[FeatureRequests] Error decrementing vote:', decrementError);
      throw decrementError;
    }

    return { voted: false };
  } else {
    // Add vote
    const { error: insertError } = await supabase
      .from('feature_request_votes')
      .insert({
        feature_request_id: requestId,
        user_id: userId,
        env,
      });

    if (insertError) {
      console.error('[FeatureRequests] Error adding vote:', insertError);
      throw insertError;
    }

    // Increment count via RPC
    const { error: incrementError } = await supabase.rpc('increment_feature_request_votes', {
      request_id: requestId,
    });

    if (incrementError) {
      console.error('[FeatureRequests] Error incrementing vote:', incrementError);
      throw incrementError;
    }

    return { voted: true };
  }
}

function transformRequest(dbRow, hasVoted = false) {
  return {
    id: dbRow.id,
    title: dbRow.title,
    description: dbRow.description,
    voteCount: dbRow.vote_count,
    userEmail: dbRow.user_email,
    hasVoted,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
