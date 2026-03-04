/**
 * Model Router
 *
 * Provides a unified interface for calling different LLM providers.
 * API keys are passed per-request (from user's stored keys).
 */

import { getModelProvider, calculateCost, getModelConfig } from './config.js';
import { RateLimitError, InvalidJSONError, TimeoutError, MissingAPIKeyError } from './errors.js';
import { createMessages } from './prompts.js';

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call OpenAI API
 */
async function callOpenAI({ apiKey, messages, model, temperature, maxTokens, jsonSchema }) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const body = {
    model,
    messages,
    temperature: temperature || DEFAULT_TEMPERATURE,
    max_tokens: maxTokens || 4096,
  };

  if (jsonSchema) {
    body.response_format = { type: 'json_object' };
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
 * Call Anthropic API
 */
async function callAnthropic({ apiKey, messages, model, temperature, maxTokens, jsonSchema }) {
  const url = 'https://api.anthropic.com/v1/messages';

  // Anthropic uses system as a top-level param, not in messages
  const systemMessage = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  let systemText = systemMessage?.content || '';
  if (jsonSchema && !systemText.includes('JSON')) {
    systemText += '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text outside the JSON object.';
  }

  const body = {
    model,
    max_tokens: maxTokens || 4096,
    messages: userMessages,
    temperature: temperature || DEFAULT_TEMPERATURE,
  };
  if (systemText) {
    body.system = systemText;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
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
        throw new RateLimitError(
          `Rate limit exceeded for ${model}. Please try again later.`,
          60
        );
      }
      throw new Error(`Anthropic API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text?.trim() || '';
    const usage = {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };

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
 * Call Google Gemini API
 */
async function callGemini({ apiKey, messages, model, temperature, maxTokens, jsonSchema }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Convert chat messages to Gemini format
  const systemMessage = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  const contents = userMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens || 4096,
      temperature: temperature || DEFAULT_TEMPERATURE,
    },
  };

  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] };
  }

  if (jsonSchema) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 403 || response.status === 400) {
        const msg = errorData.error?.message || '';
        if (msg.toLowerCase().includes('api key')) {
          throw new MissingAPIKeyError(model);
        }
      }
      if (response.status === 429) {
        throw new RateLimitError(
          `Rate limit exceeded for ${model}. Please try again later.`,
          60
        );
      }
      throw new Error(`Gemini API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    // Gemini usage metadata
    const usageMeta = data.usageMetadata || {};
    const usage = {
      prompt_tokens: usageMeta.promptTokenCount || 0,
      completion_tokens: usageMeta.candidatesTokenCount || 0,
      total_tokens: usageMeta.totalTokenCount || 0,
    };

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
 * Parse and validate JSON output
 */
function parseJSONOutput(content, jsonSchema) {
  if (!jsonSchema) {
    try {
      return JSON.parse(content);
    } catch {
      return { raw: content };
    }
  }

  let jsonStr = content.trim();
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    throw new InvalidJSONError(
      `Failed to parse JSON output: ${error.message}`,
      content
    );
  }
}

/**
 * Call an LLM with retry logic.
 * API key must be provided by caller (from user's stored keys).
 *
 * @param {Object} params
 * @param {string} params.model - Model name
 * @param {string} params.apiKey - Provider API key (required)
 * @param {string} params.system - System prompt
 * @param {string} params.user - User prompt
 * @param {Object} [params.jsonSchema] - JSON schema for structured output
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @returns {Promise<{output: *, tokens: Object, cost: number, duration: number}>}
 */
export async function callLLM({ model, apiKey, system, user, jsonSchema, temperature, maxTokens }) {
  const startTime = Date.now();

  const config = getModelConfig(model);
  if (!apiKey) {
    throw new MissingAPIKeyError(model);
  }

  const messages = createMessages(system, user);
  const provider = getModelProvider(model);

  let content, usage;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const callParams = {
        apiKey,
        messages,
        model,
        temperature: temperature || DEFAULT_TEMPERATURE,
        maxTokens: maxTokens || config.maxTokens,
        jsonSchema,
      };

      if (provider === 'openai') {
        ({ content, usage } = await callOpenAI(callParams));
      } else if (provider === 'anthropic') {
        ({ content, usage } = await callAnthropic(callParams));
      } else if (provider === 'google') {
        ({ content, usage } = await callGemini(callParams));
      } else {
        throw new Error(`Unsupported model provider: ${provider}`);
      }
      break;
    } catch (error) {
      lastError = error;

      if (error instanceof MissingAPIKeyError || error instanceof InvalidJSONError) {
        throw error;
      }
      if (error instanceof TimeoutError && attempt === MAX_RETRIES - 1) {
        throw error;
      }
      if (error instanceof RateLimitError) {
        const retryAfter = error.retryAfter || RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[LLM] Rate limit hit, waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[LLM] Error on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay}ms:`, error.message);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  if (!content) {
    throw lastError || new Error('Failed to get response from LLM');
  }

  let output = content;
  if (jsonSchema) {
    try {
      output = parseJSONOutput(content, jsonSchema);
    } catch (error) {
      console.warn(`[LLM] JSON parsing failed, returning raw content:`, error.message);
      output = { raw: content, parseError: error.message };
    }
  }

  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || (inputTokens + outputTokens);
  const cost = calculateCost(model, inputTokens, outputTokens);
  const duration = Date.now() - startTime;

  console.log(`[LLM] ${model} completed in ${duration}ms: ${totalTokens} tokens, $${cost.toFixed(4)}`);

  return {
    output,
    tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
    cost,
    duration,
  };
}
