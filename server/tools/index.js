/**
 * Tool Interface and Types
 * 
 * Defines the common interface for all workflow tools.
 * Tools are deterministic functions that can be called by workflow steps.
 */

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success - Whether the tool execution succeeded
 * @property {*} data - The result data (type depends on tool)
 * @property {string} [error] - Error message if success is false
 * @property {Object} [metadata] - Additional metadata (duration, cache hit, etc.)
 */

/**
 * @typedef {Object} ToolError
 * @property {string} type - Error type: 'missing_api_key' | 'rate_limit' | 'network' | 'invalid_input' | 'unknown'
 * @property {string} message - Human-readable error message
 * @property {number} [retryAfter] - Seconds to wait before retry (for rate limits)
 * @property {*} [details] - Additional error details
 */

/**
 * Tool registry - maps tool names to their implementations
 * @type {Map<string, Function>}
 */
const toolRegistry = new Map();

/**
 * Register a tool implementation
 * @param {string} name - Tool name (e.g., 'web_search', 'discover_feed_urls')
 * @param {Function} implementation - Tool function
 */
export function registerTool(name, implementation) {
  toolRegistry.set(name, implementation);
}

/**
 * Get a tool implementation by name
 * @param {string} name - Tool name
 * @returns {Function|null} Tool implementation or null if not found
 */
export function getTool(name) {
  return toolRegistry.get(name) || null;
}

/**
 * Check if a tool is registered
 * @param {string} name - Tool name
 * @returns {boolean}
 */
export function hasTool(name) {
  return toolRegistry.has(name);
}

/**
 * List all registered tools
 * @returns {string[]} Array of tool names
 */
export function listTools() {
  return Array.from(toolRegistry.keys());
}
