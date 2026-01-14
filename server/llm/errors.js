/**
 * LLM Error Types
 * 
 * Defines error classes for LLM operations
 */

export class LLMError extends Error {
  constructor(message, type = 'unknown') {
    super(message);
    this.name = 'LLMError';
    this.type = type;
  }
}

export class RateLimitError extends LLMError {
  constructor(message, retryAfter) {
    super(message, 'rate_limit');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class InvalidJSONError extends LLMError {
  constructor(message, rawOutput) {
    super(message, 'invalid_json');
    this.name = 'InvalidJSONError';
    this.rawOutput = rawOutput;
  }
}

export class TimeoutError extends LLMError {
  constructor(message) {
    super(message, 'timeout');
    this.name = 'TimeoutError';
  }
}

export class MissingAPIKeyError extends LLMError {
  constructor(model) {
    super(`API key not found for model: ${model}`, 'missing_api_key');
    this.name = 'MissingAPIKeyError';
    this.model = model;
  }
}
