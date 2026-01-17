/**
 * Retry utility with exponential backoff
 * 
 * Retries a function up to maxRetries times with exponential backoff.
 * Useful for handling transient API errors (rate limits, network issues).
 */

/**
 * Wait for a specified duration (in milliseconds)
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a function with exponential backoff
 * 
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 2)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried (default: retry all errors)
 * @returns {Promise} Result of the function or throws last error
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 2,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true, // By default, retry all errors
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this was the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Don't retry if shouldRetry says not to
      if (!shouldRetry(error)) {
        throw error;
      }

      // Log retry attempt
      console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);

      // Wait before retrying (exponential backoff)
      await wait(delay);

      // Increase delay for next retry (exponential backoff with max cap)
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  // All retries exhausted, throw last error
  throw lastError;
}

/**
 * Check if an error is retriable (rate limit, network error, etc.)
 * 
 * @param {Error} error - Error to check
 * @returns {boolean} True if error should be retried
 */
export function isRetriableError(error) {
  // Rate limit errors (HTTP 429)
  if (error.status === 429 || error.response?.status === 429) {
    return true;
  }

  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // Timeout errors
  if (error.message?.includes('timeout') || error.message?.includes('TIMEOUT')) {
    return true;
  }

  // 5xx server errors (temporary server issues)
  if (error.status >= 500 || error.response?.status >= 500) {
    return true;
  }

  // OpenAI rate limit errors
  if (error.message?.includes('rate_limit_exceeded') || error.message?.includes('rate limit')) {
    return true;
  }

  // Don't retry 4xx client errors (except 429) or validation errors
  return false;
}
