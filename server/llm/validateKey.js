/**
 * Key Validation
 *
 * Tests API keys against cheapest models before saving.
 */

const TIMEOUT_MS = 15000;

/**
 * Validate an API key by making a minimal request
 * @param {string} provider - 'openai' | 'anthropic' | 'google'
 * @param {string} apiKey - The plain API key to test
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateKey(provider, apiKey) {
  try {
    switch (provider) {
      case 'openai':
        return await validateOpenAI(apiKey);
      case 'anthropic':
        return await validateAnthropic(apiKey);
      case 'google':
        return await validateGoogle(apiKey);
      default:
        return { valid: false, error: `Unknown provider: ${provider}` };
    }
  } catch (err) {
    return { valid: false, error: err.message || 'Validation failed' };
  }
}

async function validateOpenAI(apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (res.status === 429) {
      // Rate limited but key is valid
      return { valid: true };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { valid: false, error: data.error?.message || `API error: ${res.status}` };
    }

    return { valid: true };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { valid: false, error: 'Validation timed out' };
    }
    return { valid: false, error: err.message };
  }
}

async function validateAnthropic(apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (res.status === 429) {
      return { valid: true };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { valid: false, error: data.error?.message || `API error: ${res.status}` };
    }

    return { valid: true };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { valid: false, error: 'Validation timed out' };
    }
    return { valid: false, error: err.message };
  }
}

async function validateGoogle(apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (res.status === 400 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error?.message || '';
      if (msg.toLowerCase().includes('api key')) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: msg || `API error: ${res.status}` };
    }
    if (res.status === 429) {
      return { valid: true };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { valid: false, error: data.error?.message || `API error: ${res.status}` };
    }

    return { valid: true };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { valid: false, error: 'Validation timed out' };
    }
    return { valid: false, error: err.message };
  }
}
