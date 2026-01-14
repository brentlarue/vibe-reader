# Milestone 8: Evals System

## Overview

This milestone implements a comprehensive evaluation framework for testing workflow quality, with deterministic checks, constraint validation, and scoring.

## Files Created

### Eval System

1. **`server/evals/runner.js`**
   - `runEval(evalId)` - Executes all cases in an eval
   - `validateCase()` - Validates a single case result
   - Scoring logic:
     - Feed count constraints (min/max)
     - Domain constraints (must include domains)
     - Freshness constraints (last published within X days)
     - URL validation
     - Minimum score thresholds
   - Returns overall score and pass/fail status

2. **`server/db/evalRepository.js`**
   - `getWorkflowEval()` - Get eval by ID
   - `getWorkflowEvals()` - Get all evals for a workflow
   - `createWorkflowEval()` - Create new eval
   - `createWorkflowEvalRun()` - Create eval run result
   - `getWorkflowEvalRuns()` - Get eval runs
   - `getWorkflowEvalRun()` - Get eval run by ID

3. **`server/evals/cases/feedDiscovery.json`**
   - 8 test cases covering various scenarios:
     - AI and Machine Learning
     - Startup and Entrepreneurship
     - Technology and Innovation
     - Economics and Finance
     - Product and Design
     - Specific Domain Test (Paul Graham style)
     - Minimal Input Test
     - High Quality Signal Test

### API Routes

4. **`server/routes/evals.js`**
   - `GET /api/evals/workflow/:workflowId` - Get all evals for workflow
   - `GET /api/evals/:id` - Get eval by ID
   - `POST /api/evals/:id/run` - Run evaluation
   - `GET /api/evals/:id/runs` - Get eval runs
   - `GET /api/evals/runs/:runId` - Get eval run by ID

### UI Components

5. **`src/components/WorkflowInspector/EvalPanel.tsx`**
   - Eval selector dropdown
   - "Run Evaluations" button
   - Results table showing:
     - Case name
     - Pass/fail status
     - Score
     - Errors/warnings
   - Overall score display
   - Export JSON functionality

6. **`src/utils/evalApi.ts`**
   - API client functions for evals
   - `getWorkflowEvals()`, `runEval()`, `getWorkflowEvalRuns()`, etc.

### Seeding

7. **`docs/migration-seed-feed-discovery-eval.sql`**
   - SQL migration to seed eval in database
   - Includes all 8 test cases

8. **`server/workflows/seed.js`** (updated)
   - Added `seedFeedDiscoveryEval()` function
   - Auto-seeds eval when seeding workflows

## Features

### Eval Cases

Each eval case includes:
- **Input**: Workflow input (interests, criteria, searchLimit)
- **Constraints**: Validation rules:
  - `minFeeds` - Minimum number of feeds required
  - `maxFeeds` - Maximum number of feeds allowed
  - `mustIncludeDomains` - Required domains in results
  - `freshnessDays` - Maximum age of last published item
  - `minScore` - Minimum score threshold

### Scoring System

- **Base Score**: 100 points
- **Deductions**:
  - Feed count violations: -20 points (min), -10 points (max)
  - Missing domains: -15 points per domain
  - Freshness violations: -20 points (none fresh), -5 points (some not fresh)
  - Invalid URLs: -10 points per invalid URL
- **Final Score**: Clamped to 0-100 range
- **Pass/Fail**: Based on errors and minimum score

### Validation Checks

1. **Feed Count**: Validates min/max constraints
2. **Domain Matching**: Checks if required domains are present
3. **Freshness**: Validates last published date
4. **URL Validation**: Ensures all feed URLs are valid
5. **Score Threshold**: Checks if score meets minimum

## Usage

### Run Evaluations

1. Navigate to workflow inspector
2. Scroll to "Evaluations" section
3. Select an evaluation from dropdown
4. Click "Run Evaluations"
5. Wait for all cases to complete
6. View results in table

### View Results

- **Overall Score**: Percentage score with pass/fail status
- **Case Results**: Table showing each case:
  - Case name
  - Pass/fail status (✓/✗)
  - Score percentage
  - Error messages (if any)
- **Export**: Download results as JSON

### Eval Cases

The feed discovery eval includes 8 test cases:
1. **AI and Machine Learning** - Tests technical content discovery
2. **Startup and Entrepreneurship** - Tests startup-focused feeds
3. **Technology and Innovation** - Tests tech content
4. **Economics and Finance** - Tests financial content
5. **Product and Design** - Tests product/design content
6. **Specific Domain Test** - Tests domain inclusion (paulgraham.com)
7. **Minimal Input Test** - Tests with minimal input
8. **High Quality Signal Test** - Tests high-quality content discovery

## API Endpoints

### Run Evaluation

```bash
POST /api/evals/:id/run
```

Response:
```json
{
  "success": true,
  "evalRun": {
    "id": "uuid",
    "evalId": "uuid",
    "score": 85.5,
    "passed": true,
    "resultsJson": {
      "caseResults": [...],
      "overallScore": 85.5,
      "passed": true,
      "errors": []
    }
  }
}
```

### Get Eval Runs

```bash
GET /api/evals/:id/runs?limit=10
```

## Seeding

The eval is automatically seeded when you seed the workflow:

```bash
POST /api/workflows/seed
```

Or manually via SQL:
```sql
-- Run docs/migration-seed-feed-discovery-eval.sql
```

## Scoring Details

### Feed Count Scoring
- If `minFeeds` not met: -20 points, error added
- If `maxFeeds` exceeded: -10 points, warning added

### Domain Scoring
- Each missing required domain: -15 points
- Error added listing missing domains

### Freshness Scoring
- If no feeds are fresh: -20 points, error added
- If some feeds not fresh: -5 points, warning added

### URL Validation
- Each invalid URL: -10 points
- Error added with count

### Minimum Score
- If score below `minScore`: Error added
- Does not affect pass/fail (that's based on errors)

## Next Steps

- **Future Enhancements**:
  - LLM judge for subjective criteria
  - Cost tracking per eval run
  - Eval history charts
  - CI/CD integration
  - Custom eval case creation UI
  - Eval comparison (diff between runs)

## Notes

- Eval runs execute workflows sequentially (one case at a time)
- Each case creates a full workflow run
- Results are persisted to database
- Scoring is deterministic (no randomness)
- All constraints are optional (undefined = no check)
