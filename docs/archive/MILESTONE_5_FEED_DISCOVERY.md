# Milestone 5: Feed Discovery Workflow

## Overview

This milestone creates and seeds the Feed Discovery workflow definition, which uses a reflective LLM pattern with external tool use (web search) to discover high-quality RSS feeds based on user interests and criteria.

## Files Created

### Workflow Definition

1. **`server/workflows/definitions/feedDiscovery.json`**
   - Complete workflow definition with 7 steps
   - Steps:
     1. **generate_candidates** (LLM) - Generate candidate feeds from user input
     2. **resolve_rss_urls** (Transform) - Discover RSS URLs for each candidate
     3. **validate_rss** (Transform) - Validate discovered RSS feeds
     4. **prune_and_normalize** (LLM) - Remove invalid/duplicate feeds
     5. **web_refine** (Tool) - Web search for additional context
     6. **integrate_and_rank** (LLM) - Final ranking and curation
     7. **final_validate** (Transform) - Final validation pass
   - Uses gpt-4o-mini for generation, gpt-4o for ranking
   - Includes JSON schemas for structured outputs

### Seeding

2. **`server/workflows/seed.js`**
   - `seedFeedDiscoveryWorkflow()` - Seeds workflow into database
   - `seedAllWorkflows()` - Seeds all workflows
   - Checks for existing workflows to avoid duplicates

### API Updates

3. **`server/routes/workflows.js`** (updated)
   - Added `GET /api/workflows` - List all workflows
   - Added `POST /api/workflows/seed` - Seed default workflows

### Runner Updates

4. **`server/workflows/runner.js`** (updated)
   - Enhanced transform step handler to support batch processing
   - Handles array inputs for feed discovery and validation
   - Calls tools for each item in arrays

## Workflow Steps

### Step 1: Generate Candidates (LLM)
- **Model**: gpt-4o-mini
- **Input**: User interests and criteria
- **Output**: Array of candidate feeds with website URLs
- **Purpose**: Broad recall of potential feeds

### Step 2: Resolve RSS URLs (Transform)
- **Type**: Transform (batch tool calls)
- **Input**: Candidate feeds with website URLs
- **Output**: Feeds with discovered RSS URLs
- **Purpose**: Find actual RSS feed URLs for each candidate

### Step 3: Validate RSS Feeds (Transform)
- **Type**: Transform (batch tool calls)
- **Input**: Feeds with RSS URLs
- **Output**: Feeds with validation results
- **Purpose**: Check if feeds are valid, active, and fresh

### Step 4: Prune and Normalize (LLM)
- **Model**: gpt-4o-mini
- **Input**: Validated feeds and user criteria
- **Output**: Normalized list of high-quality feeds
- **Purpose**: Remove duplicates, invalid feeds, low-signal feeds

### Step 5: Web Search Refinement (Tool)
- **Tool**: web_search
- **Input**: User interests (query)
- **Output**: Web search results
- **Purpose**: Find additional context and peer reviews

### Step 6: Integrate and Rank (LLM)
- **Model**: gpt-4o
- **Input**: Normalized feeds and web search results
- **Output**: Final ranked list of feeds
- **Purpose**: Create final curated list with rankings

### Step 7: Final Validation (Transform)
- **Type**: Transform (batch tool calls)
- **Input**: Ranked feeds
- **Output**: Final validated feeds
- **Purpose**: Final sanity check on all feeds

## Usage

### Seed the Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/seed \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION"
```

### Run the Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/feed-discovery/run \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "input": {
      "interests": "AI, machine learning, thought leadership",
      "criteria": "contrarian views, original content, high signal",
      "searchLimit": 10
    }
  }'
```

### Expected Input Format

```json
{
  "interests": "User interests (e.g., 'AI, machine learning')",
  "criteria": "Selection criteria (e.g., 'thought leadership, contrarian views')",
  "searchLimit": 10
}
```

### Expected Output Format

```json
{
  "feeds": [
    {
      "authorOrBrand": "Author Name",
      "description": "Feed description",
      "rssUrl": "https://example.com/feed.xml",
      "siteUrl": "https://example.com",
      "activity": "high",
      "whyItMatchesCriteria": "Explanation",
      "rank": 1,
      "validation": {
        "ok": true,
        "title": "Feed Title",
        "itemCount": 50,
        "isFresh": true
      }
    }
  ]
}
```

## Implementation Details

### Batch Processing

The workflow runner now supports batch processing in transform steps:
- **resolve_rss_urls**: Calls `discover_feed_urls` for each candidate website
- **validate_rss**: Calls `validate_feed` for each discovered RSS URL
- **final_validate**: Calls `validate_feed` for each final feed

### Error Handling

- Failed tool calls are captured but don't stop the workflow
- Invalid feeds are marked with error messages
- LLM steps handle JSON parsing errors gracefully

### Cost Optimization

- Uses gpt-4o-mini for generation steps (cheaper)
- Uses gpt-4o only for final ranking (better quality)
- Web search results are cached (10min TTL)

## Testing

1. **Seed the workflow**:
   ```bash
   curl -X POST http://localhost:3000/api/workflows/seed \
     -H "Cookie: session=YOUR_SESSION"
   ```

2. **Run a test execution**:
   ```bash
   curl -X POST http://localhost:3000/api/workflows/feed-discovery/run \
     -H "Content-Type: application/json" \
     -H "Cookie: session=YOUR_SESSION" \
     -d '{
       "input": {
         "interests": "Find RSS feeds similar to Paul Graham",
         "criteria": "thought leadership, original content"
       }
     }'
   ```

3. **Check the run status**:
   ```bash
   curl http://localhost:3000/api/workflows/feed-discovery/runs?limit=1 \
     -H "Cookie: session=YOUR_SESSION"
   ```

## Next Steps

- **Milestone 6**: Workflow Inspector UI - Visual interface for viewing/editing workflows
- **Milestone 7**: Advanced UI - Prompt editing, rerun capabilities
- **Milestone 8**: Evals - Quality assurance framework

## Notes

- The workflow is designed to be extensible - new steps can be added easily
- Transform steps can be enhanced to support more complex transformations
- Batch processing can be optimized with parallel execution in the future
- Cost tracking is built-in at each LLM step
