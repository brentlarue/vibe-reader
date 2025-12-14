/**
 * Environment Configuration
 * 
 * Single source of truth for determining the application environment.
 * 
 * Usage:
 *   Local dev: Set APP_ENV=dev in your .env file or environment
 *   Production: Leave APP_ENV unset or set APP_ENV=prod
 * 
 * This function:
 * - Returns 'dev' only if explicitly set to 'dev'
 * - Returns 'prod' otherwise (default, safe fallback)
 * - Ignores any client-supplied env parameters (security)
 */

/**
 * Get the current application environment
 * @returns {'dev' | 'prod'} The current environment
 */
export function getAppEnv() {
  const env = process.env.APP_ENV;
  
  // Only return 'dev' if explicitly set to 'dev'
  // Everything else (undefined, 'prod', empty string, etc.) returns 'prod'
  return env === 'dev' ? 'dev' : 'prod';
}

/**
 * Log the current environment (useful for debugging)
 */
export function logAppEnv() {
  const env = getAppEnv();
  console.log(`[ENV=${env}] Application environment determined`);
  return env;
}
