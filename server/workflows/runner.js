/**
 * Workflow Runner
 * 
 * Executes workflow steps sequentially, handling LLM calls, tool calls,
 * and data transformations. Persists all execution data to the database.
 */

import { callLLM } from '../llm/modelRouter.js';
import { executeTool } from '../tools/adapters.js';
import { formatSystemPrompt, formatUserPrompt } from '../llm/prompts.js';
import {
  createWorkflowRun,
  updateWorkflowRun,
  createWorkflowRunStep,
  updateWorkflowRunStep,
  getWorkflowRunSteps,
  getWorkflowRun,
} from '../db/workflowRepository.js';

/**
 * Resolve input mapping from previous step outputs
 * @param {Object} inputMapping - Mapping definition (e.g., { "query": "steps.step1.output.query" })
 * @param {Object} context - Context with previous step outputs
 * @returns {Object} Resolved input object
 */
function resolveInputMapping(inputMapping, context) {
  if (!inputMapping || typeof inputMapping !== 'object') {
    return {};
  }

  const resolved = {};

  for (const [key, path] of Object.entries(inputMapping)) {
    // Support dot notation paths like "steps.step1.output.query"
    const parts = path.split('.');
    let value = context;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        value = undefined;
        break;
      }
    }

    if (value !== undefined) {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Build context from previous step outputs
 * @param {Array} previousSteps - Array of previous step results
 * @returns {Object} Context object with step outputs
 */
function buildContext(previousSteps) {
  const context = {
    steps: {},
    inputs: {},
    outputs: {},
  };

  for (const step of previousSteps) {
    context.steps[step.stepId] = {
      input: step.inputJson || {},
      output: step.outputJson || {},
      status: step.status,
    };
    context.inputs[step.stepId] = step.inputJson || {};
    context.outputs[step.stepId] = step.outputJson || {};
  }

  return context;
}

/**
 * Execute an LLM step
 * @param {Object} stepDef - Step definition
 * @param {Object} input - Step input
 * @param {Object} context - Context from previous steps
 * @returns {Promise<{output: *, tokens: Object, cost: number}>}
 */
async function executeLLMStep(stepDef, input, context) {
  // Format prompts with variables
  const systemPrompt = stepDef.promptSystem
    ? formatSystemPrompt(stepDef.promptSystem, { ...context, input, ...input })
    : '';
  
  const userPrompt = stepDef.promptUser
    ? formatUserPrompt(stepDef.promptUser, { ...context, input, ...input })
    : '';

  if (!systemPrompt && !userPrompt) {
    throw new Error('LLM step must have at least one of promptSystem or promptUser');
  }

  // Call LLM
  const result = await callLLM({
    model: stepDef.model || 'gpt-4o-mini',
    system: systemPrompt,
    user: userPrompt,
    jsonSchema: stepDef.outputSchema,
    temperature: stepDef.temperature,
    maxTokens: stepDef.maxTokens,
  });

  return {
    output: result.output,
    tokens: result.tokens,
    cost: result.cost,
  };
}

/**
 * Execute a tool step
 * @param {Object} stepDef - Step definition
 * @param {Object} input - Step input
 * @param {Object} context - Context from previous steps
 * @returns {Promise<{output: *, trace: Object}>}
 */
async function executeToolStep(stepDef, input, context) {
  if (!stepDef.toolName) {
    throw new Error('Tool step must have toolName');
  }

  // Prepare tool arguments from input
  const toolArgs = { ...input };

  // Call tool
  const startTime = Date.now();
  const toolResult = await executeTool(stepDef.toolName, toolArgs);
  
  const trace = {
    tool: stepDef.toolName,
    args: toolArgs,
    result: toolResult,
    duration: toolResult.metadata?.duration || (Date.now() - startTime),
    success: toolResult.success,
  };

  if (!toolResult.success) {
    throw new Error(toolResult.error || 'Tool execution failed');
  }

  return {
    output: toolResult.data,
    trace,
  };
}

/**
 * Execute a transform step (simple data transformation or batch tool calls)
 * @param {Object} stepDef - Step definition
 * @param {Object} input - Step input
 * @param {Object} context - Context from previous steps
 * @returns {Promise<{output: *}>}
 */
async function executeTransformStep(stepDef, input, context) {
  // Special handling for feed discovery workflow steps
  if (stepDef.id === 'resolve_rss_urls' && input.candidates && Array.isArray(input.candidates)) {
    // Batch process: call discover_feed_urls for each candidate
    const { executeTool } = await import('../tools/adapters.js');
    const results = [];
    
    for (const candidate of input.candidates) {
      if (candidate.websiteUrl) {
        try {
          const toolResult = await executeTool('discover_feed_urls', { url: candidate.websiteUrl });
          if (toolResult.success && toolResult.data) {
            results.push({
              ...candidate,
              rssUrls: toolResult.data.rssUrls || [],
              siteUrl: toolResult.data.siteUrl || candidate.websiteUrl,
            });
          } else {
            results.push({
              ...candidate,
              rssUrls: [],
              siteUrl: candidate.websiteUrl,
              error: toolResult.error,
            });
          }
        } catch (error) {
          results.push({
            ...candidate,
            rssUrls: [],
            siteUrl: candidate.websiteUrl,
            error: error.message,
          });
        }
      }
    }
    
    return {
      output: { feeds: results },
    };
  }
  
  if (stepDef.id === 'validate_rss' && input.resolvedFeeds && input.resolvedFeeds.feeds) {
    // Batch process: call validate_feed for each RSS URL
    const { executeTool } = await import('../tools/adapters.js');
    const results = [];
    
    for (const feed of input.resolvedFeeds.feeds) {
      const validations = [];
      
      if (feed.rssUrls && Array.isArray(feed.rssUrls)) {
        for (const rssUrl of feed.rssUrls) {
          try {
            const toolResult = await executeTool('validate_feed', { url: rssUrl });
            if (toolResult.success && toolResult.data) {
              validations.push({
                rssUrl,
                ...toolResult.data,
              });
            } else {
              validations.push({
                rssUrl,
                ok: false,
                error: toolResult.error,
              });
            }
          } catch (error) {
            validations.push({
              rssUrl,
              ok: false,
              error: error.message,
            });
          }
        }
      }
      
      results.push({
        ...feed,
        validations,
      });
    }
    
    return {
      output: { feeds: results },
    };
  }
  
  if (stepDef.id === 'final_validate' && input.rankedFeeds && Array.isArray(input.rankedFeeds)) {
    // Batch process: call validate_feed for each final feed
    const { executeTool } = await import('../tools/adapters.js');
    const results = [];
    
    for (const feed of input.rankedFeeds) {
      if (feed.rssUrl) {
        try {
          const toolResult = await executeTool('validate_feed', { url: feed.rssUrl });
          if (toolResult.success && toolResult.data) {
            results.push({
              ...feed,
              validation: toolResult.data,
            });
          } else {
            results.push({
              ...feed,
              validation: {
                ok: false,
                error: toolResult.error,
              },
            });
          }
        } catch (error) {
          results.push({
            ...feed,
            validation: {
              ok: false,
              error: error.message,
            },
          });
        }
      }
    }
    
    return {
      output: { feeds: results },
    };
  }

  // Default: pass through input
  if (stepDef.transformFunction) {
    console.warn('[Workflow] Transform functions not yet implemented, returning input as-is');
  }

  return {
    output: input,
  };
}

/**
 * Execute a single workflow step
 * @param {Object} stepDef - Step definition
 * @param {Object} context - Context from previous steps
 * @param {string} runId - Run UUID
 * @returns {Promise<Object>} Step result with database record
 */
async function executeStep(stepDef, context, runId) {
  // Resolve input from context
  const input = stepDef.inputMapping
    ? resolveInputMapping(stepDef.inputMapping, context)
    : context.outputs[stepDef.id] || {};

  // Create step record
  const stepRecord = await createWorkflowRunStep({
    runId,
    stepId: stepDef.id,
    stepName: stepDef.name,
    stepType: stepDef.type,
    model: stepDef.model,
    promptSystem: stepDef.promptSystem,
    promptUser: stepDef.promptUser,
    inputJson: input,
  });

  const stepId = stepRecord.id;
  const startedAt = new Date().toISOString();

  // Update step status to running
  await updateWorkflowRunStep(stepId, {
    status: 'running',
    startedAt,
  });

  try {
    let result;

    // Execute based on step type
    switch (stepDef.type) {
      case 'llm':
        result = await executeLLMStep(stepDef, input, context);
        break;
      case 'tool':
        result = await executeToolStep(stepDef, input, context);
        break;
      case 'transform':
        result = await executeTransformStep(stepDef, input, context);
        break;
      default:
        throw new Error(`Unknown step type: ${stepDef.type}`);
    }

    // Update step with results
    const finishedAt = new Date().toISOString();
    await updateWorkflowRunStep(stepId, {
      status: 'completed',
      outputJson: result.output,
      toolTraceJson: result.trace,
      tokenCount: result.tokens?.total,
      cost: result.cost,
      finishedAt,
    });

    return {
      ...stepRecord,
      status: 'completed',
      outputJson: result.output,
      toolTraceJson: result.trace,
      tokenCount: result.tokens?.total,
      cost: result.cost,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    // Update step with error
    const finishedAt = new Date().toISOString();
    await updateWorkflowRunStep(stepId, {
      status: 'failed',
      errorMessage: error.message,
      finishedAt,
    });

    throw error;
  }
}

/**
 * Run a workflow
 * @param {Object} workflow - Workflow object with definition
 * @param {Object} input - Workflow input
 * @param {string} [userId] - User ID (optional)
 * @param {string} [fromStepId] - Step ID to start from (for reruns)
 * @returns {Promise<Object>} Workflow run result
 */
export async function runWorkflow(workflow, input, userId, fromStepId) {
  const definition = workflow.definitionJson;
  if (!definition || !definition.steps || !Array.isArray(definition.steps)) {
    throw new Error('Invalid workflow definition: missing steps');
  }

  // Create workflow run
  const run = await createWorkflowRun({
    workflowId: workflow.id,
    userId,
    inputJson: input,
  });

  const runId = run.id;
  const startedAt = new Date().toISOString();

  // Update run status to running
  await updateWorkflowRun(runId, {
    status: 'running',
    startedAt,
  });

  try {
    const steps = definition.steps;
    const executedSteps = [];
    let context = { input, steps: {}, inputs: {}, outputs: {} };

    // Find starting step if fromStepId is provided
    let startIndex = 0;
    if (fromStepId) {
      startIndex = steps.findIndex(s => s.id === fromStepId);
      if (startIndex === -1) {
        throw new Error(`Step not found: ${fromStepId}`);
      }

      // Load previous steps from database
      const previousSteps = await getWorkflowRunSteps(runId);
      executedSteps.push(...previousSteps);
      context = buildContext(previousSteps);
    }

    // Execute steps sequentially
    for (let i = startIndex; i < steps.length; i++) {
      // Check if run has been cancelled
      const currentRun = await getWorkflowRun(runId);
      if (currentRun && currentRun.status === 'cancelled') {
        console.log(`[Workflow] Run ${runId} was cancelled, stopping execution`);
        const finishedAt = new Date().toISOString();
        await updateWorkflowRun(runId, {
          status: 'cancelled',
          finishedAt,
        });
        return {
          ...run,
          status: 'cancelled',
          finishedAt,
          steps: executedSteps,
        };
      }

      const stepDef = steps[i];
      console.log(`[Workflow] Executing step ${i + 1}/${steps.length}: ${stepDef.name} (${stepDef.type})`);

      const stepResult = await executeStep(stepDef, context, runId);
      executedSteps.push(stepResult);

      // Update context with step output
      context.steps[stepDef.id] = {
        input: stepResult.inputJson,
        output: stepResult.outputJson,
        status: stepResult.status,
      };
      context.inputs[stepDef.id] = stepResult.inputJson;
      context.outputs[stepDef.id] = stepResult.outputJson;

      // If step failed, stop execution
      if (stepResult.status === 'failed') {
        throw new Error(`Step ${stepDef.name} failed: ${stepResult.errorMessage}`);
      }
    }

    // Calculate total cost
    const totalCost = executedSteps.reduce((sum, step) => sum + (step.cost || 0), 0);

    // Update run with final status
    const finishedAt = new Date().toISOString();
    const finalOutput = context.outputs[steps[steps.length - 1]?.id] || {};

    await updateWorkflowRun(runId, {
      status: 'completed',
      outputJson: finalOutput,
      actualCost: totalCost,
      finishedAt,
    });

    return {
      ...run,
      status: 'completed',
      outputJson: finalOutput,
      actualCost: totalCost,
      startedAt,
      finishedAt,
      steps: executedSteps,
    };
  } catch (error) {
    // Update run with error status
    const finishedAt = new Date().toISOString();
    await updateWorkflowRun(runId, {
      status: 'failed',
      finishedAt,
    });

    console.error('[Workflow] Workflow execution failed:', error);
    throw error;
  }
}
