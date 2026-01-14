/**
 * Model Configuration
 * 
 * Defines available models, their providers, and pricing
 */

/**
 * Model pricing per 1M tokens (as of 2025)
 * Format: { input: price, output: price }
 */
const MODEL_PRICING = {
  // OpenAI models
  'gpt-4o': { input: 2.50, output: 10.00 }, // $2.50/$10 per 1M tokens
  'gpt-4o-mini': { input: 0.15, output: 0.60 }, // $0.15/$0.60 per 1M tokens
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  
  // Anthropic models (optional, for future)
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
};

/**
 * Get model provider (openai, anthropic, etc.)
 * @param {string} model - Model name
 * @returns {string} Provider name
 */
export function getModelProvider(model) {
  if (model.startsWith('gpt-')) {
    return 'openai';
  }
  if (model.startsWith('claude-')) {
    return 'anthropic';
  }
  return 'unknown';
}

/**
 * Get API key for a model provider
 * @param {string} provider - Provider name
 * @returns {string|undefined} API key
 */
export function getProviderAPIKey(provider) {
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY;
  }
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY;
  }
  return undefined;
}

/**
 * Calculate cost for a model call
 * @param {string} model - Model name
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @returns {number} Cost in USD
 */
export function calculateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return 0; // Unknown model, can't calculate cost
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Get default model for environment
 * @param {string} env - Environment (dev, prod)
 * @returns {string} Default model name
 */
export function getDefaultModel(env = 'prod') {
  // Use cheaper model in dev, better model in prod
  if (env === 'dev') {
    return 'gpt-4o-mini';
  }
  return 'gpt-4o';
}

/**
 * Get model configuration
 * @param {string} model - Model name
 * @returns {Object} Model config
 */
export function getModelConfig(model) {
  const provider = getModelProvider(model);
  const apiKey = getProviderAPIKey(provider);
  
  return {
    name: model,
    provider,
    apiKey,
    pricing: MODEL_PRICING[model] || null,
    maxTokens: provider === 'openai' ? 4096 : 4096, // Default max tokens
  };
}
