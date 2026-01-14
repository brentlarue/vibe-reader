/**
 * Tool Initialization
 * 
 * Registers all available tools with the tool registry.
 * This should be called once when the server starts.
 */

import { registerTool } from './index.js';
import { webSearch } from './webSearch/providers/brave.js';
import { discoverFeedUrls } from './feedDiscovery/discoverFeedUrls.js';
import { validateFeed } from './feedValidation/validateFeed.js';

/**
 * Initialize and register all tools
 */
export function initializeTools() {
  // Register web search tool
  registerTool('web_search', webSearch);
  
  // Register feed discovery tool
  registerTool('discover_feed_urls', discoverFeedUrls);
  
  // Register feed validation tool
  registerTool('validate_feed', validateFeed);
  
  console.log('[Tools] Initialized tools:', ['web_search', 'discover_feed_urls', 'validate_feed'].join(', '));
}
