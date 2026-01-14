# Milestone 7: Workflow Inspector UI (Advanced)

## Overview

This milestone adds advanced editing capabilities to the Workflow Inspector, including prompt editing, model selection, rerun functionality, and real-time progress updates.

## Files Created

### Components

1. **`src/components/WorkflowInspector/PromptEditor.tsx`**
   - Editable system and user prompts
   - Variable hints with click-to-insert
   - Save button with status feedback
   - Monospace font for code editing

2. **`src/components/WorkflowInspector/ModelSelector.tsx`**
   - Dropdown to change model per LLM step
   - Shows model pricing information
   - Save button (disabled if unchanged)
   - Only visible for LLM steps

### Updates

3. **`src/utils/workflowApi.ts`** (updated)
   - Added `updateWorkflowDefinition()` - Update workflow definition
   - Added `rerunFromStep()` - Rerun workflow from a specific step

4. **`server/routes/workflows.js`** (updated)
   - Added `PUT /api/workflows/:slug` - Update workflow definition
   - Updated `POST /api/workflows/:slug/run` - Support rerun from step with original input

5. **`src/components/WorkflowInspector/StepDetails.tsx`** (updated)
   - Added "Rerun from this step" button
   - Added "Copy Output" button
   - Added "Export JSON" button
   - Shows rerun button only for completed runs

6. **`src/components/WorkflowInspector/WorkflowInspector.tsx`** (updated)
   - Integrated PromptEditor and ModelSelector
   - Added `handleUpdateWorkflow()` function
   - Shows editing components when LLM step is selected

7. **`src/components/WorkflowInspector/RunPanel.tsx`** (updated)
   - Added real-time polling for running workflows
   - Polls every 2 seconds while workflow is running
   - Automatically stops polling when completed/failed

## Features

### Prompt Editing

- **System Prompt Editor**: Editable textarea for system prompts
- **User Prompt Editor**: Editable textarea for user prompts
- **Variable Hints**: Click-to-insert variable placeholders:
  - `{{input.interests}}`
  - `{{input.criteria}}`
  - `{{input.searchLimit}}`
  - `{{steps.stepId.output.field}}`
  - `{{steps.stepId.input.field}}`
- **Save Functionality**: Saves changes to workflow definition in database
- **Status Feedback**: Shows success/error messages after save

### Model Selection

- **Model Dropdown**: Select from available models:
  - GPT-4o ($2.50/$10 per 1M tokens)
  - GPT-4o Mini ($0.15/$0.60 per 1M tokens)
  - GPT-4 Turbo ($10/$30 per 1M tokens)
  - GPT-3.5 Turbo ($0.50/$1.50 per 1M tokens)
- **Cost Display**: Shows pricing for selected model
- **Save Button**: Only enabled when model changes
- **LLM Steps Only**: Only visible for steps with type 'llm'

### Rerun Functionality

- **Rerun Button**: Available in step details for completed runs
- **Confirmation Dialog**: Asks for confirmation before rerunning
- **Uses Original Input**: Preserves original workflow input
- **Creates New Run**: Starts a new workflow run from selected step
- **Step Selection**: Can rerun from any completed step

### Output Viewer Enhancements

- **Copy to Clipboard**: One-click copy of step output JSON
- **Export JSON**: Download step output as JSON file
- **Collapsible Sections**: Input, output, tool traces, prompts
- **Formatted JSON**: Pretty-printed with syntax highlighting

### Real-Time Updates

- **Polling**: Automatically polls running workflows every 2 seconds
- **Status Updates**: Updates run status and steps in real-time
- **Auto-Stop**: Stops polling when workflow completes or fails
- **Progress Tracking**: See step-by-step progress as it happens

## Usage

### Edit Prompts

1. Select an LLM step from the step list
2. Prompt editor appears above step details
3. Edit system or user prompts
4. Click variable hints to insert placeholders
5. Click "Save Prompts" to persist changes

### Change Model

1. Select an LLM step from the step list
2. Model selector appears above step details
3. Select a different model from dropdown
4. View cost information
5. Click "Save" to update workflow definition

### Rerun from Step

1. Select a completed run from run list
2. Click on a completed step
3. Click "Rerun from this step" button
4. Confirm in dialog
5. New run starts from selected step

### Copy/Export Output

1. Select a step with output
2. Click "Copy Output" to copy JSON to clipboard
3. Click "Export JSON" to download as file

### Real-Time Progress

1. Run a workflow
2. Watch status update in real-time (every 2 seconds)
3. See steps complete one by one
4. Polling stops automatically when done

## API Endpoints

### Update Workflow Definition

```bash
PUT /api/workflows/:slug
Body: { definitionJson: {...} }
```

### Rerun from Step

```bash
POST /api/workflows/:slug/run
Body: { input: {...}, fromStepId: "step-id", originalRunId: "run-id" }
```

## Implementation Details

### Workflow Definition Updates

- Changes are saved to `workflows.definition_json` in database
- Workflow version could be incremented (future enhancement)
- Changes take effect on next workflow run

### Rerun Logic

- Uses original run's input JSON
- Loads previous step outputs from database
- Continues execution from selected step
- Creates new run record

### Polling Strategy

- Polls every 2 seconds while status is 'running' or 'pending'
- Stops when status is 'completed' or 'failed'
- Cleans up interval on component unmount
- Updates both run and step data

## Next Steps

- **Milestone 8**: Evals System - Quality assurance framework
- **Future Enhancements**:
  - Workflow versioning
  - Prompt templates library
  - Cost estimation before running
  - WebSocket support for real-time updates
  - JSON diff view for comparing runs

## Notes

- Prompt and model changes are saved immediately
- Rerun creates a new run (doesn't modify existing runs)
- Polling adds minimal server load (2-second intervals)
- All changes persist to database
- Editing is only available for LLM steps
