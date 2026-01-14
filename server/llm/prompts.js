/**
 * Prompt Utilities
 * 
 * Helper functions for formatting and managing prompts
 */

/**
 * Format a system prompt template with variable substitution
 * @param {string} template - Prompt template with {{variable}} placeholders
 * @param {Object} vars - Variables to substitute
 * @returns {string} Formatted prompt
 */
export function formatSystemPrompt(template, vars = {}) {
  if (!template) return '';
  
  let formatted = template;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    formatted = formatted.replace(placeholder, String(value || ''));
  }
  
  return formatted;
}

/**
 * Format a user prompt template with variable substitution
 * @param {string} template - Prompt template with {{variable}} placeholders
 * @param {Object} vars - Variables to substitute
 * @returns {string} Formatted prompt
 */
export function formatUserPrompt(template, vars = {}) {
  if (!template) return '';
  
  let formatted = template;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    // Handle arrays and objects by JSON stringifying
    const replacement = Array.isArray(value) || (typeof value === 'object' && value !== null)
      ? JSON.stringify(value, null, 2)
      : String(value || '');
    formatted = formatted.replace(placeholder, replacement);
  }
  
  return formatted;
}

/**
 * Combine system and user prompts into messages array
 * @param {string} system - System prompt
 * @param {string} user - User prompt
 * @returns {Array} Messages array for API
 */
export function createMessages(system, user) {
  const messages = [];
  
  if (system && system.trim()) {
    messages.push({ role: 'system', content: system.trim() });
  }
  
  if (user && user.trim()) {
    messages.push({ role: 'user', content: user.trim() });
  }
  
  return messages;
}
