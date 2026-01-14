# Milestone 3: LLM Interface & Model Router

## Overview

This milestone implements a unified LLM interface that supports multiple model providers (OpenAI required, Anthropic optional) with structured outputs, token tracking, cost calculation, retry logic, and error handling.

## Files Created

### Core LLM System

1. **`server/llm/modelRouter.js`**
   - Main entry point: `callLLM()` function
   - Supports OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo)
   - Supports Anthropic (claude-3-5-sonnet, claude-3-haiku) - placeholder for future
   - Features:
     - JSON schema enforcement via `response_format: { type: 'json_object' }`
     - Automatic retry with exponential backoff (max 3 retries)
     - Rate limit handling with retry-after support
     - Timeout protection (60s default)
     - Token usage tracking
     - Cost calculation

2. **`server/llm/config.js`**
   - Model configuration and pricing
   - Provider detection (openai, anthropic)
   - API key management
   - Cost calculation based on token usage
   - Default model selection per environment

3. **`server/llm/errors.js`**
   - Custom error classes:
     - `LLMError` - Base error class
     - `RateLimitError` - Rate limit exceeded
     - `InvalidJSONError` - JSON parsing failed
     - `TimeoutError` - Request timeout
     - `MissingAPIKeyError` - API key not found

4. **`server/llm/prompts.js`**
   - Prompt formatting utilities
   - Variable substitution with `{{variable}}` syntax
   - Message array creation
   - Template helpers

### API Routes

5. **`server/routes/llm.js`**
   - Debug endpoint: `POST /api/debug/llm`
   - Requires authentication
   - Accepts: `{ model, system, user, jsonSchema, temperature }`
   - Returns: `{ success, output, tokens, cost, duration }`

## Features

### Model Support

- **OpenAI** (required):
  - `gpt-4o` - Best quality, $2.50/$10 per 1M tokens
  - `gpt-4o-mini` - Cost-effective, $0.15/$0.60 per 1M tokens
  - `gpt-4-turbo` - Legacy, $10/$30 per 1M tokens
  - `gpt-3.5-turbo` - Cheapest, $0.50/$1.50 per 1M tokens

- **Anthropic** (optional, placeholder):
  - `claude-3-5-sonnet` - $3/$15 per 1M tokens
  - `claude-3-haiku` - $0.25/$1.25 per 1M tokens

### JSON Schema Enforcement

When `jsonSchema` is provided:
- Adds `response_format: { type: 'json_object' }` to OpenAI requests
- Injects JSON instruction into system prompt
- Attempts to parse and validate JSON output
- Handles markdown code blocks and extra text

### Error Handling

- **Rate Limits**: Automatically retries with `retry-after` header support
- **Timeouts**: 60s default, throws `TimeoutError` if exceeded
- **Invalid JSON**: Throws `InvalidJSONError` with raw output for debugging
- **Missing API Keys**: Throws `MissingAPIKeyError` with model name
- **Network Errors**: Retries with exponential backoff (1s, 2s, 4s)

### Token & Cost Tracking

- Tracks input, output, and total tokens
- Calculates cost based on model pricing
- Logs usage for monitoring
- Returns usage data in API responses

## Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key (required for OpenAI models)

Optional:
- `ANTHROPIC_API_KEY` - Anthropic API key (for future Anthropic support)

## Usage Examples

### Basic LLM Call

```javascript
import { callLLM } from './llm/modelRouter.js';

const result = await callLLM({
  model: 'gpt-4o',
  system: 'You are a helpful assistant.',
  user: 'What is the capital of France?',
  temperature: 0.3,
});

console.log(result.output); // "Paris"
console.log(result.tokens); // { input: 15, output: 1, total: 16 }
console.log(result.cost); // 0.0000375 (very small)
```

### JSON Schema Call

```javascript
const result = await callLLM({
  model: 'gpt-4o-mini',
  system: 'You are a feed discovery assistant.',
  user: 'Find 3 RSS feeds about AI.',
  jsonSchema: {
    type: 'object',
    properties: {
      feeds: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
          },
        },
      },
    },
  },
});

console.log(result.output.feeds); // Array of feed objects
```

### Error Handling

```javascript
import { RateLimitError, InvalidJSONError } from './llm/errors.js';

try {
  const result = await callLLM({ /* ... */ });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited, retry after ${error.retryAfter}s`);
  } else if (error instanceof InvalidJSONError) {
    console.log('JSON parse failed:', error.rawOutput);
  } else {
    console.error('LLM error:', error.message);
  }
}
```

### Debug API Endpoint

```bash
curl -X POST http://localhost:3000/api/debug/llm \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "model": "gpt-4o-mini",
    "system": "You are a helpful assistant.",
    "user": "Say hello in JSON format.",
    "jsonSchema": {"type": "object"},
    "temperature": 0.3
  }'
```

Response:
```json
{
  "success": true,
  "output": { "message": "Hello!" },
  "tokens": { "input": 20, "output": 10, "total": 30 },
  "cost": 0.000003,
  "duration": 1234
}
```

## Testing

1. **Test basic call**:
   ```bash
   curl -X POST http://localhost:3000/api/debug/llm \
     -H "Content-Type: application/json" \
     -H "Cookie: session=YOUR_SESSION" \
     -d '{"model": "gpt-4o-mini", "user": "Say hello"}'
   ```

2. **Test JSON schema**:
   ```bash
   curl -X POST http://localhost:3000/api/debug/llm \
     -H "Content-Type: application/json" \
     -H "Cookie: session=YOUR_SESSION" \
     -d '{
       "model": "gpt-4o-mini",
       "user": "Return a JSON object with a 'greeting' field",
       "jsonSchema": {"type": "object"}
     }'
   ```

3. **Test error handling**:
   - Try with invalid model name
   - Try without API key (should fail gracefully)
   - Try with malformed JSON schema

## Integration with Workflows

The LLM interface is ready to be used in the workflow runner (Milestone 4). Workflow steps of type `llm` will call `callLLM()` with:
- Model from step definition
- System/user prompts from step definition
- JSON schema from step definition
- Input data from previous steps

## Next Steps

- **Milestone 4**: Workflow Runner - Execute workflow steps sequentially, persist run data
- **Milestone 5**: Feed Discovery Workflow - Seed the first workflow definition
- **Milestone 6**: Workflow Inspector UI - Visual interface for viewing/editing workflows

## Notes

- OpenAI's `response_format: { type: 'json_object' }` requires the model to return valid JSON, but doesn't validate against a specific schema. Full schema validation would require a library like `ajv` or `zod`.
- Cost calculation uses current pricing (as of 2025). Update `MODEL_PRICING` in `config.js` if prices change.
- Anthropic support is stubbed but not implemented. To add it, implement `callAnthropic()` in `modelRouter.js` following the OpenAI pattern.
