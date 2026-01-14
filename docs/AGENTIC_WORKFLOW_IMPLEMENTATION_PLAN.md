# Agentic Workflow Implementation Plan
## Feed Discovery Workflow with Reflective LLM Pattern

**Status:** Planning  
**Target:** Multi-milestone implementation for Cursor Agent  
**Estimated Total Effort:** 8 milestones, ~40-60 hours

---

## Plan Critique & Improvements

### ✅ Strengths
1. **Clear separation**: Deterministic tools vs LLM steps prevents validation hallucinations
2. **Modular design**: Workflow runner is generic, reusable for other workflows
3. **Visibility**: UI inspector enables debugging and prompt iteration
4. **Cost-conscious**: Model-per-step allows using cheaper models where appropriate
5. **Eval-ready**: Built-in eval framework enables continuous improvement

### ⚠️ Areas Requiring Attention
1. **Error handling**: Need retry logic, partial failure recovery, step rollback
2. **Rate limiting**: Web search APIs have limits; need queuing/backoff
3. **Cost tracking**: Token usage should be logged per step for cost analysis
4. **Concurrency**: Consider parallel tool execution where safe (feed validation)
5. **Caching**: Add caching layer for expensive operations (web search, feed validation)
6. **Security**: Validate all URLs before fetching, sanitize LLM outputs
7. **Observability**: Add structured logging for debugging production issues

### 🔧 Recommended Adjustments
1. **Add step retry logic** with exponential backoff
2. **Implement step checkpoints** for resume-on-failure
3. **Add workflow versioning** for prompt iteration without breaking runs
4. **Include cost estimation** before running expensive workflows
5. **Add webhook support** for async workflow completion notifications

---

## Milestone Breakdown

### Milestone 1: Database Schema & Migrations
**Goal:** Establish data model for workflows, runs, steps, and evals  
**Dependencies:** None  
**Estimated Time:** 2-3 hours

**Tasks:**
1. Create migration file: `docs/migration-add-workflow-tables.sql`
2. Define tables:
   - `workflows` (id, name, slug, definition_json, version, created_at, updated_at, env)
   - `workflow_runs` (id, workflow_id, user_id, input_json, output_json, status, cost_estimate, actual_cost, started_at, finished_at, env)
   - `workflow_run_steps` (id, run_id, step_id, step_name, step_type, model, prompt_system, prompt_user, input_json, output_json, tool_trace_json, status, error_message, token_count, cost, started_at, finished_at, env)
   - `workflow_evals` (id, workflow_id, name, cases_json, created_at, env)
   - `workflow_eval_runs` (id, eval_id, run_id, results_json, score, passed, created_at, env)
3. Add indexes for common queries (workflow_id, run_id, status)
4. Add RLS policies (if using authenticated access)
5. Create TypeScript types in `src/types.ts` matching schema
6. Test migration in local Supabase

**Acceptance Criteria:**
- [ ] All tables created with proper constraints
- [ ] Indexes added for performance
- [ ] TypeScript types match schema
- [ ] Migration can be run and rolled back safely

---

### Milestone 2: Tool Adapters (Deterministic)
**Goal:** Implement web search, feed discovery, and feed validation tools  
**Dependencies:** Milestone 1 (for types)  
**Estimated Time:** 4-5 hours

**Tasks:**
1. Create tool interface: `server/tools/index.ts`
   - Define `ToolResult<T>` type
   - Define `ToolError` type
   - Create tool registry pattern

2. Implement Brave Search provider: `server/tools/webSearch/providers/brave.ts`
   - Add `BRAVE_SEARCH_API_KEY` to env
   - Implement `webSearch({ query, limit, recencyDays })`
   - Map Brave API response to `SearchResult[]`
   - Add error handling (missing key, rate limits, invalid responses)
   - Add in-memory cache (10min TTL, keyed by query+limit)
   - Add request logging (dev only)

3. Implement feed discovery tool: `server/tools/feedDiscovery/discoverFeedUrls.ts`
   - Fetch HTML from URL
   - Parse `<link rel="alternate">` tags
   - Try common paths: `/feed`, `/rss`, `/atom.xml`, `/feed.xml`, `/index.xml`
   - Return `{ rssUrls: string[], siteUrl: string }`
   - Add timeout (5s), user-agent header
   - Validate URLs before fetching

4. Implement feed validation tool: `server/tools/feedValidation/validateFeed.ts`
   - Use existing `rss-parser` library
   - Fetch and parse RSS/Atom feed
   - Return `{ ok: boolean, title?: string, siteUrl?: string, lastPublishedAt?: Date, itemCount?: number, error?: string }`
   - Check freshness (lastPublishedAt within X days)
   - Add timeout (10s), retry once on network error

5. Create tool adapter wrapper: `server/tools/adapters.ts`
   - `executeTool(toolName, params)` function
   - Routes to correct tool implementation
   - Handles errors consistently
   - Logs tool execution (input, output, duration)

6. Add debug endpoint: `server/routes/tools.ts`
   - `GET /api/debug/web-search?q=...` (auth required)
   - `GET /api/debug/discover-feeds?url=...` (auth required)
   - `GET /api/debug/validate-feed?url=...` (auth required)
   - Return JSON results for testing

**Acceptance Criteria:**
- [ ] All three tools implemented and tested manually
- [ ] Error handling works for missing API keys, rate limits, invalid URLs
- [ ] Caching reduces duplicate API calls
- [ ] Debug endpoints return expected results
- [ ] Tools are deterministic (same input = same output)

---

### Milestone 3: LLM Interface & Model Router
**Goal:** Create flexible LLM interface supporting multiple models per step  
**Dependencies:** Milestone 2 (for error patterns)  
**Estimated Time:** 3-4 hours

**Tasks:**
1. Create model router: `server/llm/modelRouter.ts`
   - Define `ModelConfig` type (name, provider, apiKey, baseUrl, maxTokens, temperature)
   - Support OpenAI (gpt-4o, gpt-4o-mini, gpt-3.5-turbo)
   - Support Anthropic (claude-3-5-sonnet, claude-3-haiku) - optional
   - Create `callLLM({ model, system, user, jsonSchema, temperature })` function
   - Enforce JSON schema using structured outputs (OpenAI) or prompt engineering
   - Parse and validate JSON response
   - Log token usage (input_tokens, output_tokens, total_tokens)
   - Calculate cost estimate (model-specific pricing)
   - Add retry logic (3 attempts, exponential backoff)
   - Add timeout (60s)

2. Create model config: `server/config/models.ts`
   - Define default models per use case
   - Store model pricing (for cost calculation)
   - Environment-based model selection (dev vs prod)

3. Add LLM error types: `server/llm/errors.ts`
   - `LLMError`, `RateLimitError`, `InvalidJSONError`, `TimeoutError`
   - Proper error messages for debugging

4. Create prompt utilities: `server/llm/prompts.ts`
   - `formatSystemPrompt(template, vars)` helper
   - `formatUserPrompt(template, vars)` helper
   - Support for prompt templates with variable substitution

5. Add LLM debug endpoint: `server/routes/llm.ts`
   - `POST /api/debug/llm` (auth required)
   - Accept: `{ model, system, user, jsonSchema }`
   - Return: `{ output, tokens, cost, duration }`
   - For testing prompts without running full workflow

**Acceptance Criteria:**
- [ ] Can call OpenAI models with JSON schema enforcement
- [ ] Token usage and cost calculated correctly
- [ ] Retry logic handles transient errors
- [ ] JSON validation works for complex schemas
- [ ] Debug endpoint allows prompt testing

---

### Milestone 4: Workflow Runner Core
**Goal:** Build generic workflow execution engine  
**Dependencies:** Milestones 2, 3  
**Estimated Time:** 6-8 hours

**Tasks:**
1. Define workflow types: `server/workflows/types.ts`
   - `WorkflowDefinition` (id, name, steps[])
   - `StepDefinition` (id, name, type, model?, prompt_system?, prompt_user?, tool_name?, input_mapping, output_schema)
   - `StepType` enum: 'llm', 'tool', 'transform', 'gate'
   - `WorkflowRun` (id, workflow_id, status, steps[])
   - `StepRun` (id, step_id, status, input, output, error)

2. Create workflow runner: `server/workflows/runner.ts`
   - `executeWorkflow(workflowId, input, userId)` function
   - Load workflow definition from DB
   - Create workflow run record
   - Execute steps sequentially:
     - Map inputs from prior step outputs
     - Execute step (LLM, tool, or transform)
     - Validate output against schema (Zod)
     - Persist step run to DB
     - Handle errors (log, mark step failed, continue or abort)
   - Update workflow run status (running, completed, failed, partial)
   - Return final output

3. Implement step executors: `server/workflows/steps/`
   - `executeLLMStep(step, input, context)` → calls model router
   - `executeToolStep(step, input, context)` → calls tool adapter
   - `executeTransformStep(step, input, context)` → pure function transform
   - `executeGateStep(step, input, context)` → conditional branching

4. Add input/output mapping: `server/workflows/mapping.ts`
   - `mapInputs(step, priorOutputs, workflowInput)` function
   - Support JSONPath or dot notation (e.g., `"$.step1.output.feeds"`)
   - Handle array mapping (map over items)
   - Validate mapped inputs match expected schema

5. Add output validation: `server/workflows/validation.ts`
   - `validateOutput(output, schema)` function
   - Use Zod schemas from step definition
   - Return validation errors clearly
   - Log validation failures

6. Add error handling: `server/workflows/errors.ts`
   - `WorkflowError`, `StepError`, `ValidationError` types
   - Retry logic for transient errors (network, rate limits)
   - Partial failure handling (continue on non-critical step failures)
   - Error recovery strategies (skip step, use default, abort)

7. Create workflow API routes: `server/routes/workflows.ts`
   - `POST /api/workflows/:id/run` (auth required)
   - `GET /api/workflows/:id/runs/:runId` (auth required)
   - `GET /api/workflows/:id/runs` (auth required, paginated)
   - `POST /api/workflows/:id/runs/:runId/rerun-from-step` (auth required)

8. Add workflow repository: `server/db/workflowRepository.ts`
   - CRUD operations for workflows, runs, steps
   - Query helpers (get runs by status, get latest run, etc.)

**Acceptance Criteria:**
- [ ] Can execute a simple 2-step workflow (LLM → tool)
- [ ] Step outputs are correctly mapped to next step inputs
- [ ] Output validation catches schema mismatches
- [ ] Errors are logged and workflow run status updated
- [ ] Can retrieve workflow run with all step details
- [ ] Can rerun from a specific step

---

### Milestone 5: Seed Feed Discovery Workflow
**Goal:** Create the specific feed discovery workflow definition  
**Dependencies:** Milestone 4  
**Estimated Time:** 2-3 hours

**Tasks:**
1. Create workflow definition: `server/workflows/definitions/feedDiscovery.json`
   - Define all 7 steps with proper IDs, names, types
   - Set model per step (gpt-4o-mini for generation, gpt-4o for ranking)
   - Define input/output schemas (Zod) for each step
   - Map step inputs from prior outputs

2. Create prompt templates: `server/workflows/prompts/feedDiscovery/`
   - `generate_candidates.md` (system + user templates)
   - `prune_and_normalize.md`
   - `integrate_and_rank.md`
   - Use variable placeholders: `{{userIntent}}`, `{{candidateFeeds}}`, etc.

3. Create seed migration: `docs/migration-seed-feed-discovery-workflow.sql`
   - Insert workflow definition into `workflows` table
   - Use proper JSON formatting
   - Set env to 'prod' (or current env)

4. Add workflow loader: `server/workflows/loader.ts`
   - `loadWorkflowDefinition(slug)` function
   - Loads from DB, parses JSON, validates structure
   - Loads prompt templates from filesystem
   - Caches in memory (invalidate on update)

5. Test workflow end-to-end:
   - Run with sample input: "Find RSS feeds similar to Paul Graham's writing style"
   - Verify all 7 steps execute
   - Check outputs at each step
   - Verify final output is valid feed list

**Acceptance Criteria:**
- [ ] Workflow definition loads correctly
- [ ] All 7 steps execute in order
- [ ] Prompts are correctly formatted with variables
- [ ] Final output contains valid RSS feed list
- [ ] Can run workflow via API endpoint

---

### Milestone 6: Workflow Inspector UI (Basic)
**Goal:** Build UI to view workflow runs and step details  
**Dependencies:** Milestone 5  
**Estimated Time:** 5-6 hours

**Tasks:**
1. Create workflow page route: `src/components/WorkflowInspector.tsx`
   - Route: `/workflows/feed-discovery`
   - Protected route (requires auth)

2. Add workflow API client: `src/utils/workflowApi.ts`
   - `runWorkflow(workflowId, input)`
   - `getWorkflowRun(workflowId, runId)`
   - `getWorkflowRuns(workflowId)`
   - `rerunFromStep(workflowId, runId, stepId)`

3. Build run list component: `src/components/WorkflowInspector/RunList.tsx`
   - Shows recent runs (status, timestamp, duration)
   - Click to view run details
   - Filter by status (all, running, completed, failed)

4. Build step list component: `src/components/WorkflowInspector/StepList.tsx`
   - Shows all steps in workflow (ordered)
   - Highlights current step if run in progress
   - Shows step status (pending, running, completed, failed)
   - Click to view step details

5. Build step details component: `src/components/WorkflowInspector/StepDetails.tsx`
   - Shows step name, type, model
   - Displays input JSON (formatted, collapsible)
   - Displays output JSON (formatted, collapsible)
   - Shows tool traces (if tool step)
   - Shows error message (if failed)
   - Shows token count and cost (if LLM step)
   - Shows duration

6. Build run panel: `src/components/WorkflowInspector/RunPanel.tsx`
   - Input textarea for user intent
   - "Run workflow" button
   - Status indicator (idle, running, completed, error)
   - Progress indicator (X of Y steps completed)
   - Final output display (feed list)

7. Add navigation: Update `src/components/Sidebar.tsx`
   - Add "Workflows" menu item (if admin or dev mode)
   - Link to `/workflows/feed-discovery`

8. Style components:
   - Use existing theme variables
   - Match app design patterns
   - Responsive layout (mobile-friendly)

**Acceptance Criteria:**
- [ ] Can view list of workflow runs
- [ ] Can see step-by-step execution details
- [ ] Can run workflow from UI
- [ ] Can see real-time progress (polling or websocket)
- [ ] Final output displays feed list correctly
- [ ] Error states are clearly shown

---

### Milestone 7: Workflow Inspector UI (Advanced)
**Goal:** Add editing, rerun, and prompt modification capabilities  
**Dependencies:** Milestone 6  
**Estimated Time:** 4-5 hours

**Tasks:**
1. Add prompt editor: `src/components/WorkflowInspector/PromptEditor.tsx`
   - Editable system prompt (textarea)
   - Editable user prompt (textarea)
   - Variable hints/autocomplete
   - Save button (updates workflow definition in DB)
   - Preview button (shows formatted prompt with sample vars)

2. Add model selector: `src/components/WorkflowInspector/ModelSelector.tsx`
   - Dropdown per step to change model
   - Shows model cost estimate
   - Save to workflow definition

3. Add rerun functionality:
   - "Rerun from step" button in step details
   - Confirmation dialog
   - Creates new run starting from selected step
   - Uses outputs from prior steps as inputs

4. Add step output viewer enhancements:
   - JSON syntax highlighting
   - Copy to clipboard
   - Export as JSON file
   - Diff view (compare two runs)

5. Add workflow definition editor: `src/components/WorkflowInspector/WorkflowEditor.tsx`
   - View/edit full workflow JSON
   - Validate JSON structure
   - Add/remove steps (advanced)
   - Save as new version

6. Add cost tracking display:
   - Show total cost per run
   - Show cost breakdown per step
   - Show cost estimate before running
   - Cost history chart (optional)

7. Add real-time updates:
   - Poll for run status updates (every 2s while running)
   - Or implement WebSocket for live updates (optional, more complex)

**Acceptance Criteria:**
- [ ] Can edit prompts and save changes
- [ ] Can change model per step
- [ ] Can rerun from any step
- [ ] Cost tracking is accurate
- [ ] Changes persist to database

---

### Milestone 8: Evals System
**Goal:** Implement evaluation framework for workflow quality  
**Dependencies:** Milestone 7  
**Estimated Time:** 4-5 hours

**Tasks:**
1. Define eval schema: `server/evals/types.ts`
   - `EvalCase` (input, expectedOutput?, constraints)
   - `EvalConstraint` (minFeeds, maxFeeds, mustIncludeDomains, freshnessDays, etc.)
   - `EvalResult` (caseId, passed, score, errors, actualOutput)

2. Create eval runner: `server/evals/runner.ts`
   - `runEval(evalId)` function
   - Load eval cases
   - Run workflow for each case
   - Score results:
     - Deterministic checks (feed count, freshness, valid URLs)
     - Constraint validation (must include domains, etc.)
     - Optional LLM judge for subjective criteria
   - Calculate overall score
   - Save results to DB

3. Create eval cases: `server/evals/cases/feedDiscovery.json`
   - 5-10 test cases with:
     - Input prompts (various styles)
     - Expected constraints (min feeds, freshness, etc.)
     - Optional: expected domains to include

4. Add eval API routes: `server/routes/evals.ts`
   - `POST /api/evals/:id/run` (auth required)
   - `GET /api/evals/:id/results` (auth required)
   - `GET /api/evals/:id/results/:resultId` (auth required)

5. Create eval UI: `src/components/WorkflowInspector/EvalPanel.tsx`
   - "Run Evals" button
   - Results table:
     - Case name/input
     - Pass/fail status
     - Score
     - Errors/warnings
   - Overall score display
   - Export results (JSON/CSV)

6. Add eval seed migration: `docs/migration-seed-feed-discovery-eval.sql`
   - Insert eval definition into `workflow_evals` table
   - Link to feed_discovery workflow

7. Add CI integration (optional):
   - GitHub Actions workflow
   - Run evals on PR
   - Fail if score drops below threshold

**Acceptance Criteria:**
- [ ] Can run evals from UI
- [ ] Results show pass/fail per case
- [ ] Deterministic checks work correctly
- [ ] Overall score calculated
- [ ] Results persisted and viewable

---

## Implementation Order Summary

1. **Milestone 1:** Database Schema (Foundation)
2. **Milestone 2:** Tool Adapters (Deterministic building blocks)
3. **Milestone 3:** LLM Interface (AI capability)
4. **Milestone 4:** Workflow Runner (Orchestration)
5. **Milestone 5:** Feed Discovery Workflow (Use case)
6. **Milestone 6:** Basic UI (Visibility)
7. **Milestone 7:** Advanced UI (Editability)
8. **Milestone 8:** Evals (Quality assurance)

---

## Risk Mitigation

### High Risk Areas
1. **Web search API costs**: Implement caching and rate limiting early
2. **LLM token costs**: Add cost estimation and warnings before expensive runs
3. **Workflow complexity**: Start with simple 2-step workflow, iterate
4. **Error handling**: Test failure scenarios early (network errors, invalid responses)

### Dependencies to Watch
- Brave Search API availability and rate limits
- OpenAI API availability and rate limits
- Supabase connection stability
- RSS feed parsing edge cases

---

## Success Metrics

- [ ] Can discover 10+ valid RSS feeds from user intent
- [ ] Workflow completes in < 2 minutes
- [ ] Cost per run < $0.50 (with caching)
- [ ] Eval score > 80% on test cases
- [ ] UI allows non-technical users to run workflows
- [ ] Prompt editing enables iteration without code changes

---

## Notes for Cursor Agent

- Implement one milestone at a time
- Test each milestone before proceeding
- Use existing code patterns (auth, error handling, types)
- Follow existing file structure
- Add comprehensive error messages
- Log important operations for debugging
- Consider performance (caching, batching) from the start
