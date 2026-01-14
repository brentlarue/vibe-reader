# Milestone 6: Workflow Inspector UI (Basic)

## Overview

This milestone implements a visual interface for viewing and running workflows, displaying run history, step-by-step execution details, and workflow results.

## Files Created

### API Client

1. **`src/utils/workflowApi.ts`**
   - `runWorkflow()` - Execute a workflow
   - `getWorkflow()` - Get workflow by slug
   - `getWorkflowRun()` - Get run by ID (with steps)
   - `getWorkflowRuns()` - Get all runs for a workflow
   - `getAllWorkflows()` - Get all workflows
   - `seedWorkflows()` - Seed default workflows

### Components

2. **`src/components/WorkflowInspector/WorkflowInspector.tsx`**
   - Main workflow inspector component
   - Manages state for workflow, runs, steps
   - Handles workflow loading and seeding
   - Coordinates child components

3. **`src/components/WorkflowInspector/RunPanel.tsx`**
   - Input form for running workflows
   - Fields: interests, criteria, search limit
   - Run button with status indicator
   - Displays final output (feed list)
   - Shows cost and status

4. **`src/components/WorkflowInspector/RunList.tsx`**
   - Lists all workflow runs
   - Shows status, timestamp, duration, cost
   - Filter by status (all, completed, running, failed, partial)
   - Click to view run details

5. **`src/components/WorkflowInspector/StepList.tsx`**
   - Lists all steps in workflow definition
   - Shows step status (pending, running, completed, failed)
   - Highlights current step
   - Click to view step details

6. **`src/components/WorkflowInspector/StepDetails.tsx`**
   - Displays detailed step information
   - Shows input/output JSON (collapsible)
   - Shows tool traces (if tool step)
   - Shows prompts (if LLM step)
   - Shows token count and cost (if LLM step)
   - Shows error messages (if failed)

### Integration

7. **`src/components/AppContent.tsx`** (updated)
   - Added route: `/workflows/:slug`
   - Renders `WorkflowInspector` component

8. **`src/components/Sidebar.tsx`** (updated)
   - Added "Workflows" navigation link (dev mode only)
   - Links to `/workflows/feed-discovery`

9. **`server/routes/workflows.js`** (updated)
   - Updated `GET /api/workflows/runs/:runId` to include steps
   - Returns run with all associated steps

## Features

### Run Panel
- **Input Form**: Interests (required), criteria (optional), search limit
- **Run Button**: Executes workflow with loading state
- **Status Indicator**: Shows current run status with color coding
- **Results Display**: Shows final feed list with details
- **Cost Display**: Shows total cost of workflow run

### Run List
- **Run History**: Shows all runs with status, timestamp, duration
- **Filtering**: Filter by status (all, completed, running, failed, partial)
- **Selection**: Click to view run details and steps
- **Cost Display**: Shows cost per run

### Step List
- **Step Overview**: Shows all steps in workflow definition
- **Status Indicators**: Color-coded status dots
- **Current Step**: Highlights step being executed
- **Step Info**: Shows step type and model

### Step Details
- **Input/Output**: Collapsible JSON viewers
- **Tool Traces**: Shows tool execution details
- **Prompts**: Shows system and user prompts (LLM steps)
- **Metrics**: Token count, cost, duration
- **Errors**: Displays error messages for failed steps

## UI Design

- Uses existing theme variables for consistent styling
- Responsive layout with grid system
- Color-coded status indicators:
  - Green: Completed
  - Blue: Running
  - Red: Failed
  - Orange: Partial
  - Gray: Pending
- Collapsible sections for large JSON data
- Mobile-friendly layout

## Usage

### Access Workflow Inspector

1. Navigate to `/workflows/feed-discovery` (or click "Workflows" in sidebar in dev mode)
2. Workflow will auto-seed if not found

### Run a Workflow

1. Enter interests (e.g., "AI, machine learning")
2. Optionally enter criteria (e.g., "thought leadership, contrarian views")
3. Set search limit (default: 10)
4. Click "Run Workflow"
5. Monitor progress in step list
6. View results in run panel

### View Run Details

1. Click on a run in the run list
2. View steps in step list
3. Click on a step to view details
4. Expand sections to see input/output JSON

### Filter Runs

1. Use status filter dropdown in run list
2. Filter by: All, Completed, Running, Failed, Partial

## API Integration

The UI uses the following API endpoints:
- `GET /api/workflows/:slug` - Get workflow
- `POST /api/workflows/:slug/run` - Run workflow
- `GET /api/workflows/:slug/runs` - Get runs
- `GET /api/workflows/runs/:runId` - Get run with steps
- `POST /api/workflows/seed` - Seed workflows

## Next Steps

- **Milestone 7**: Advanced UI - Prompt editing, rerun capabilities, model selection
- **Milestone 8**: Evals - Quality assurance framework

## Notes

- Workflows link only appears in dev mode (localhost)
- Workflow auto-seeds if not found in database
- Steps are loaded when a run is selected
- Real-time updates can be added with polling or websockets in the future
- Error states are clearly displayed with red styling
