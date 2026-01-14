/**
 * Tool Adapter Wrapper
 * 
 * Provides a unified interface for executing tools in workflows.
 * Handles error formatting, logging, and tool routing.
 */

import { getTool } from './index.js';

/**
 * Execute a tool by name
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} params - Tool parameters
 * @returns {Promise<{success: boolean, data?: *, error?: string, metadata?: Object}>}
 */
export async function executeTool(toolName, params = {}) {
  const startTime = Date.now();
  
  try {
    const tool = getTool(toolName);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolName}`,
        metadata: {
          toolName,
          duration: Date.now() - startTime,
        },
      };
    }

    console.log(`[ToolAdapter] Executing tool: ${toolName}`, { params: JSON.stringify(params).substring(0, 200) });
    
    // Execute tool
    const result = await tool(params);
    
    const duration = Date.now() - startTime;
    
    console.log(`[ToolAdapter] Tool ${toolName} completed in ${duration}ms`);
    
    return {
      success: true,
      data: result,
      metadata: {
        toolName,
        duration,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error(`[ToolAdapter] Tool ${toolName} failed:`, error);
    
    // Format error based on type
    let errorMessage = error.message || 'Unknown error';
    let errorType = 'unknown';
    
    if (error.type) {
      errorType = error.type;
      errorMessage = error.message || errorMessage;
    } else if (error.message?.includes('API key')) {
      errorType = 'missing_api_key';
    } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      errorType = 'rate_limit';
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      errorType = 'network';
    } else if (error.message?.includes('Invalid') || error.message?.includes('required')) {
      errorType = 'invalid_input';
    }
    
    return {
      success: false,
      error: errorMessage,
      metadata: {
        toolName,
        duration,
        errorType,
        retryAfter: error.retryAfter,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
