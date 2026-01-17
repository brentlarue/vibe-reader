/**
 * Cost Tracking Utilities
 * 
 * Helper functions for tracking and calculating costs for AI API calls.
 * This works with metadata stored by n8n or can be populated by the backend.
 */

/**
 * Calculate OpenAI cost from token usage
 * Pricing as of 2024 (gpt-4o-mini):
 * - Input: $0.15 per 1M tokens
 * - Output: $0.60 per 1M tokens
 * 
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} model - Model name (default: 'gpt-4o-mini')
 * @returns {number} Cost in USD
 */
export function calculateOpenAICost(inputTokens, outputTokens, model = 'gpt-4o-mini') {
  // Pricing per 1M tokens
  const pricing = {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 1.50, output: 6.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  };

  const modelPricing = pricing[model] || pricing['gpt-4o-mini'];

  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
}

/**
 * Calculate ElevenLabs cost from character count
 * Pricing as of 2024:
 * - eleven_turbo_v2_5: 0.5 credits per character
 * - eleven_monolingual_v1: 1 credit per character
 * - Free tier: ~10,000 characters/month free
 * 
 * Note: This calculates credits, not USD. Actual USD cost depends on plan.
 * 
 * @param {number} characterCount - Number of characters
 * @param {string} model - Model name (default: 'eleven_turbo_v2_5')
 * @returns {number} Credits used
 */
export function calculateElevenLabsCredits(characterCount, model = 'eleven_turbo_v2_5') {
  const creditsPerChar = {
    'eleven_turbo_v2_5': 0.5,
    'eleven_monolingual_v1': 1.0,
    'eleven_multilingual_v2': 1.0,
  };

  const multiplier = creditsPerChar[model] || 0.5;
  return characterCount * multiplier;
}

/**
 * Extract cost data from OpenAI API response
 * 
 * @param {Object} response - OpenAI API response object
 * @returns {Object|null} Cost data or null if not available
 */
export function extractOpenAICost(response) {
  const usage = response?.usage || response?.data?.usage;
  if (!usage) return null;

  const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
  const totalTokens = usage.total_tokens || (inputTokens + outputTokens);
  const model = response?.model || 'gpt-4o-mini';

  const cost = calculateOpenAICost(inputTokens, outputTokens, model);

  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    costUSD: cost,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract cost data from ElevenLabs API response
 * 
 * @param {Object} response - ElevenLabs API response or metadata
 * @param {number} characterCount - Character count if not in response
 * @param {string} model - Model name (default: 'eleven_turbo_v2_5')
 * @returns {Object|null} Cost data or null if not available
 */
export function extractElevenLabsCost(response, characterCount = null, model = 'eleven_turbo_v2_5') {
  // Try to get character count from response
  const chars = response?.character_count || response?.characters || characterCount;
  if (!chars) return null;

  const credits = calculateElevenLabsCredits(chars, model);

  return {
    model,
    characterCount: chars,
    credits,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Aggregate cost data for a brief run
 * 
 * @param {Object} metadata - Brief run metadata (may contain cost data)
 * @returns {Object} Aggregated cost summary
 */
export function aggregateCosts(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {
      totalCostUSD: 0,
      totalTokens: 0,
      totalCredits: 0,
      openAICalls: 0,
      elevenLabsCalls: 0,
    };
  }

  // Extract cost arrays if they exist
  const openAICosts = Array.isArray(metadata.openAICosts) ? metadata.openAICosts : [];
  const elevenLabsCosts = Array.isArray(metadata.elevenLabsCosts) ? metadata.elevenLabsCosts : [];

  const totalCostUSD = openAICosts.reduce((sum, c) => sum + (c.costUSD || 0), 0);
  const totalTokens = openAICosts.reduce((sum, c) => sum + (c.totalTokens || 0), 0);
  const totalCredits = elevenLabsCosts.reduce((sum, c) => sum + (c.credits || 0), 0);

  return {
    totalCostUSD: Math.round(totalCostUSD * 10000) / 10000, // Round to 4 decimal places
    totalTokens,
    totalCredits,
    openAICalls: openAICosts.length,
    elevenLabsCalls: elevenLabsCosts.length,
  };
}
