/**
 * Model Router
 * 
 * Provides a unified interface for calling different LLM providers.
 * Supports OpenAI (required) and Anthropic (optional).
 */

import { getModelProvider, getProviderAPIKey, calculateCost, getModelConfig } from './config.js';
import { RateLimitError, InvalidJSONError, TimeoutError, MissingAPIKeyError } from './errors.js';
import { createMessages } from './prompts.js';

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call OpenAI API
 * @param {Object} params
 * @param {string} params.apiKey - OpenAI API key
 * @param {Array} params.messages - Messages array
 * @param {string} params.model - Model name
 * @param {number} params.temperature - Temperature
 * @param {number} params.maxTokens - Max tokens
 * @param {Object} params.jsonSchema - JSON schema for structured output (optional)
 * @returns {Promise<{content: string, usage: Object}>}
 */
async function callOpenAI({ apiKey, messages, model, temperature, maxTokens, jsonSchema }) {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const body = {
    model,
    messages,
    temperature: temperature || DEFAULT_TEMPERATURE,
    max_tokens: maxTokens || 4096,
  };
  
  // Add response_format for JSON schema if provided
  if (jsonSchema) {
    body.response_format = { type: 'json_object' };
    // Add instruction to system message if not already present
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage && !systemMessage.content.includes('JSON')) {
      systemMessage.content += '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text outside the JSON object.';
    } else if (!systemMessage) {
      messages.unshift({
        role: 'system',
        content: 'You must respond with valid JSON only. Do not include any text outside the JSON object.',
      });
    }
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        throw new MissingAPIKeyError(model);
      }
      
      if (response.status === 429) {
        const retryAfter = errorData.headers?.['retry-after'] || 60;
        throw new RateLimitError(
          `Rate limit exceeded for ${model}. Please try again later.`,
          parseInt(retryAfter)
        );
      }
      
      throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const usage = data.usage || {};
    
    return { content, usage };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new TimeoutError(`Request timeout after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    
    throw error;
  }
}

/**
 * Call Anthropic API (optional, for future use)
 * @param {Object} params
 * @returns {Promise<{content: string, usage: Object}>}
 */
async function callAnthropic({ apiKey, messages, model, temperature, maxTokens, jsonSchema }) {
  // TODO: Implement Anthropic API when needed
  throw new Error('Anthropic API not yet implemented');
}

/**
 * Parse and validate JSON output
 * @param {string} content - Raw content from LLM
 * @param {Object} jsonSchema - Expected JSON schema (optional, for validation)
 * @returns {Object} Parsed JSON object
 */
function parseJSONOutput(content, jsonSchema) {
  if (!jsonSchema) {
    // Try to parse as JSON anyway
    try {
      return JSON.parse(content);
    } catch {
      return { raw: content };
    }
  }
  
  // Try to extract JSON from content (in case model adds extra text)
  let jsonStr = content.trim();
  
  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');
  
  // Try to find JSON object in content
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    // Basic validation: check if parsed object has expected structure
    // (Full schema validation would require a library like ajv)
    return parsed;
  } catch (error) {
    throw new InvalidJSONError(
      `Failed to parse JSON output: ${error.message}`,
      content
    );
  }
}

/**
 * Call an LLM with retry logic
 * @param {Object} params
 * @param {string} params.model - Model name (e.g., 'gpt-4o', 'gpt-4o-mini')
 * @param {string} params.system - System prompt
 * @param {string} params.user - User prompt
 * @param {Object} [params.jsonSchema] - JSON schema for structured output
 * @param {number} [params.temperature] - Temperature (default: 0.3)
 * @param {number} [params.maxTokens] - Max tokens (default: 4096)
 * @returns {Promise<{output: *, tokens: Object, cost: number}>}
 */
export async function callLLM({ model, system, user, jsonSchema, temperature, maxTokens }) {
  const startTime = Date.now();
  
  // Get model configuration
  const config = getModelConfig(model);
  if (!config.apiKey) {
    throw new MissingAPIKeyError(model);
  }
  
  // Create messages
  const messages = createMessages(system, user);
  
  // Determine provider and call appropriate API
  const provider = getModelProvider(model);
  
  let content, usage;
  let lastError;
  
  // Retry logic with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (provider === 'openai') {
        const result = await callOpenAI({
          apiKey: config.apiKey,
          messages,
          model,
          temperature: temperature || DEFAULT_TEMPERATURE,
          maxTokens: maxTokens || config.maxTokens,
          jsonSchema,
        });
        content = result.content;
        usage = result.usage;
        break; // Success, exit retry loop
      } else if (provider === 'anthropic') {
        const result = await callAnthropic({
          apiKey: config.apiKey,
          messages,
          model,
          temperature: temperature || DEFAULT_TEMPERATURE,
          maxTokens: maxTokens || config.maxTokens,
          jsonSchema,
        });
        content = result.content;
        usage = result.usage;
        break; // Success, exit retry loop
      } else {
        throw new Error(`Unsupported model provider: ${provider}`);
      }
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      if (error instanceof MissingAPIKeyError || error instanceof InvalidJSONError) {
        throw error;
      }
      
      // Don't retry on timeout (last attempt)
      if (error instanceof TimeoutError && attempt === MAX_RETRIES - 1) {
        throw error;
      }
      
      // Retry on rate limits and network errors
      if (error instanceof RateLimitError) {
        const retryAfter = error.retryAfter || RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[LLM] Rate limit hit, waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(retryAfter * 1000);
        continue;
      }
      
      // Retry on network errors with exponential backoff
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[LLM] Error on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay}ms:`, error.message);
        await sleep(delay);
        continue;
      }
      
      // Last attempt failed, throw error
      throw error;
    }
  }
  
  if (!content) {
    throw lastError || new Error('Failed to get response from LLM');
  }
  
  // Parse JSON if schema provided
  let output = content;
  if (jsonSchema) {
    try {
      output = parseJSONOutput(content, jsonSchema);
    } catch (error) {
      // Log but don't fail - return raw content
      console.warn(`[LLM] JSON parsing failed, returning raw content:`, error.message);
      output = { raw: content, parseError: error.message };
    }
  }
  
  // Calculate token usage and cost
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || (inputTokens + outputTokens);
  const cost = calculateCost(model, inputTokens, outputTokens);
  
  const duration = Date.now() - startTime;
  
  console.log(`[LLM] ${model} completed in ${duration}ms: ${totalTokens} tokens, $${cost.toFixed(4)}`);
  
  return {
    output,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens,
    },
    cost,
    duration,
  };
}
