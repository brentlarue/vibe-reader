/**
 * Model Configuration
 *
 * Defines available models, their providers, and pricing.
 * API keys are provided per-request from user's stored keys — not from env vars.
 */

/**
 * Model pricing per 1M tokens (as of 2025)
 * Format: { input: price, output: price }
 */
const MODEL_PRICING = {
  // OpenAI models
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

  // Anthropic models
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },

  // Google models
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
};

/**
 * Get model provider (openai, anthropic, google)
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
  if (model.startsWith('gemini-')) {
    return 'google';
  }
  return 'unknown';
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
    return 0;
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
  if (env === 'dev') {
    return 'gpt-4o-mini';
  }
  return 'gpt-4o';
}

/**
 * Get model configuration (without API key — caller must supply it)
 * @param {string} model - Model name
 * @returns {Object} Model config
 */
export function getModelConfig(model) {
  const provider = getModelProvider(model);

  return {
    name: model,
    provider,
    pricing: MODEL_PRICING[model] || null,
    maxTokens: 4096,
  };
}
