# Milestone 4: Workflow Runner

## Overview

This milestone implements the core workflow execution engine that runs workflow steps sequentially, handles LLM calls, tool calls, and data transformations, and persists all execution data to the database.

## Files Created

### Database Layer

1. **`server/db/workflowRepository.js`**
   - Data access layer for workflows, runs, and steps
   - Functions:
     - `getWorkflows()` - Get all workflows
     - `getWorkflow(id)` - Get workflow by ID
     - `getWorkflowBySlug(slug)` - Get workflow by slug
     - `createWorkflow()` - Create new workflow
     - `updateWorkflow()` - Update workflow
     - `createWorkflowRun()` - Create workflow run
     - `getWorkflowRun(id)` - Get run by ID
     - `getWorkflowRuns(workflowId)` - Get all runs for a workflow
     - `updateWorkflowRun()` - Update run status/results
     - `createWorkflowRunStep()` - Create step record
     - `getWorkflowRunSteps(runId)` - Get all steps for a run
     - `updateWorkflowRunStep()` - Update step status/results
   - All operations are scoped by environment (dev/prod isolation)

### Workflow Engine

2. **`server/workflows/runner.js`**
   - Core workflow execution engine
   - Main function: `runWorkflow(workflow, input, userId, fromStepId)`
   - Features:
     - Sequential step execution
     - Input mapping from previous step outputs
     - Context building from step history
     - Step type handlers:
       - `llm` - Calls LLM with formatted prompts
       - `tool` - Executes tool adapters
       - `transform` - Simple data transformations
     - Error handling and status tracking
     - Cost calculation and token tracking
     - Support for rerunning from a specific step

### API Routes

3. **`server/routes/workflows.js`**
   - Workflow API endpoints:
     - `POST /api/workflows/:slug/run` - Execute workflow
     - `GET /api/workflows/:slug` - Get workflow by slug
     - `GET /api/workflows/:slug/runs` - Get workflow runs
     - `GET /api/workflows/runs/:runId` - Get run by ID
   - All endpoints require authentication

## Features

### Step Execution

- **LLM Steps**:
  - Formats system/user prompts with variable substitution
  - Calls `callLLM()` from model router
  - Supports JSON schema enforcement
  - Tracks tokens and cost

- **Tool Steps**:
  - Executes tool adapters via `runTool()`
  - Captures tool traces (args, results, duration)
  - Handles tool errors gracefully

- **Transform Steps**:
  - Simple data transformations
  - Currently passes through input (extensible)

### Input Mapping

Steps can map inputs from previous step outputs using dot notation:
```json
{
  "inputMapping": {
    "query": "steps.step1.output.query",
    "feeds": "outputs.step2"
  }
}
```

### Context Building

The runner builds a context object from previous steps:
```javascript
{
  input: { /* workflow input */ },
  steps: {
    step1: { input: {...}, output: {...}, status: "completed" },
    step2: { input: {...}, output: {...}, status: "completed" }
  },
  inputs: { step1: {...}, step2: {...} },
  outputs: { step1: {...}, step2: {...} }
}
```

### Rerunning from Step

Workflows can be rerun from a specific step:
- Loads previous step results from database
- Rebuilds context from previous steps
- Continues execution from the specified step

### Error Handling

- Failed steps stop workflow execution
- Step errors are captured and stored
- Run status updated to 'failed' on error
- All step data persisted even on failure

## Usage Examples

### Execute a Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/feed-discovery/run \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "input": {
      "interests": "AI, machine learning",
      "criteria": "thought leadership, contrarian views"
    }
  }'
```

Response:
```json
{
  "success": true,
  "run": {
    "id": "uuid",
    "workflowId": "uuid",
    "status": "completed",
    "inputJson": {...},
    "outputJson": {...},
    "actualCost": 0.0123,
    "startedAt": "2025-01-01T00:00:00Z",
    "finishedAt": "2025-01-01T00:00:15Z",
    "steps": [...]
  }
}
```

### Get Workflow Runs

```bash
curl http://localhost:3000/api/workflows/feed-discovery/runs?limit=10 \
  -H "Cookie: session=YOUR_SESSION"
```

### Get Run Details

```bash
curl http://localhost:3000/api/workflows/runs/RUN_ID \
  -H "Cookie: session=YOUR_SESSION"
```

### Rerun from Step

```bash
curl -X POST http://localhost:3000/api/workflows/feed-discovery/run \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "input": {...},
    "fromStepId": "step3"
  }'
```

## Workflow Definition Structure

A workflow definition must have this structure:

```json
{
  "id": "workflow-id",
  "name": "Workflow Name",
  "steps": [
    {
      "id": "step1",
      "name": "Step Name",
      "type": "llm",
      "model": "gpt-4o-mini",
      "promptSystem": "You are a helpful assistant.",
      "promptUser": "Generate {{input.query}}",
      "outputSchema": { "type": "object" },
      "inputMapping": {
        "query": "input.query"
      }
    },
    {
      "id": "step2",
      "name": "Tool Step",
      "type": "tool",
      "toolName": "web_search",
      "inputMapping": {
        "query": "steps.step1.output.query"
      }
    }
  ]
}
```

## Step Types

### LLM Step

```json
{
  "id": "step-id",
  "name": "LLM Step",
  "type": "llm",
  "model": "gpt-4o",
  "promptSystem": "System prompt with {{variables}}",
  "promptUser": "User prompt with {{variables}}",
  "outputSchema": { "type": "object" },
  "temperature": 0.3,
  "maxTokens": 4096,
  "inputMapping": { "var": "steps.previous.output.var" }
}
```

### Tool Step

```json
{
  "id": "step-id",
  "name": "Tool Step",
  "type": "tool",
  "toolName": "web_search",
  "inputMapping": {
    "query": "steps.previous.output.query",
    "limit": "input.limit"
  }
}
```

### Transform Step

```json
{
  "id": "step-id",
  "name": "Transform Step",
  "type": "transform",
  "inputMapping": {
    "data": "steps.previous.output"
  }
}
```

## Integration

- **Database**: Uses `workflowRepository.js` for all data operations
- **LLM**: Uses `callLLM()` from `modelRouter.js`
- **Tools**: Uses `runTool()` from `tools/adapters.js`
- **Prompts**: Uses `formatSystemPrompt()` and `formatUserPrompt()` from `prompts.js`
- **API**: Mounted at `/api/workflows` with auth middleware

## Error Handling

- **Step Failures**: Workflow stops, run marked as 'failed'
- **LLM Errors**: Caught and stored in step error_message
- **Tool Errors**: Caught and stored in step error_message
- **Database Errors**: Propagated to API response

## Cost Tracking

- Each LLM step tracks token usage and cost
- Total cost calculated across all steps
- Stored in `workflow_runs.actual_cost`
- Individual step costs in `workflow_run_steps.cost`

## Next Steps

- **Milestone 5**: Feed Discovery Workflow - Seed the first workflow definition
- **Milestone 6**: Workflow Inspector UI - Visual interface for viewing/editing workflows

## Notes

- Workflows execute synchronously (blocking). For long-running workflows, consider adding async execution in the future.
- Input mapping uses simple dot notation. For complex transformations, use transform steps.
- Step outputs are stored as JSONB in the database, allowing flexible data structures.
- Environment isolation ensures dev/prod data separation.
