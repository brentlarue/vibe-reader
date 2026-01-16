# Milestone 2: n8n Workflow - Data Collection - COMPLETE ✅

## Summary
Created n8n setup documentation and a sample workflow for collecting daily feed items.

## What Was Created

### 1. n8n Setup Guide
**File:** `docs/MILESTONE_2_N8N_SETUP.md`

Includes:
- Installation instructions (Docker, npm, Docker Compose)
- Environment variable configuration
- Authentication setup
- Workflow import instructions
- Troubleshooting guide

### 2. Sample n8n Workflow
**File:** `docs/n8n-daily-brief-data-collection.json`

Workflow nodes:
1. **Manual Trigger** - Starts workflow execution
2. **Set Date** - Sets date to today (YYYY-MM-DD format)
3. **Refresh Feeds** - Calls `POST /api/brief/refresh`
4. **Get Daily Items** - Calls `GET /api/brief/items?date={date}`
5. **Filter Items Without Summaries** - Filters items that need summaries
6. **Get Brief Metadata** - Calls `GET /api/brief/metadata?date={date}`
7. **Set Run Status: Running** - Updates brief run to "running" status

## Setup Instructions

### 1. Install n8n

**Quick start with Docker:**
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

Then open `http://localhost:5678` in your browser.

### 2. Configure Environment Variables

In n8n UI:
1. Go to **Settings** → **Environment Variables**
2. Add:
   - `VIBE_READER_API_URL` = `http://localhost:3001` (or your production URL)
   - `VIBE_READER_SESSION_COOKIE` = Your session cookie from browser

**To get session cookie:**
1. Log in to your app in browser
2. Open DevTools → Application → Cookies
3. Copy the `session` cookie value

### 3. Import Workflow

1. In n8n, click **Workflows** → **Import from File**
2. Select `docs/n8n-daily-brief-data-collection.json`
3. The workflow will be imported

### 4. Test the Workflow

1. Click **Execute Workflow** button
2. Check each node's output:
   - **Refresh Feeds** should return `{ success: true, feedsRefreshed: X, itemsAdded: Y }`
   - **Get Daily Items** should return array of items
   - **Filter Items Without Summaries** should return filtered array
   - **Get Brief Metadata** should return metadata object
   - **Set Run Status: Running** should update the run record

## Workflow Flow

```
Manual Trigger
    ↓
Set Date (today)
    ↓
Refresh Feeds
    ↓
Get Daily Items ──→ Filter Items Without Summaries
    ↓
Get Brief Metadata
    ↓
Set Run Status: Running
```

## Output Data

The workflow outputs:
- **Filtered items** (items without summaries) - Ready for Milestone 3
- **Brief metadata** - Article count, feeds, run status
- **Run status** - Updated to "running" in database

## Next Steps (Milestone 3)

The filtered items from this workflow will be:
1. Passed to OpenAI for summary generation
2. Summaries saved back to database via `POST /api/items/{itemId}/summary`
3. Run status updated to "completed" when done

## Troubleshooting

### "401 Unauthorized"
- Session cookie expired - get a new one from browser
- Update `VIBE_READER_SESSION_COOKIE` environment variable

### "Connection refused"
- Backend server not running
- Check `VIBE_READER_API_URL` is correct
- For localhost: `http://localhost:3001`

### Workflow nodes showing errors
- Check environment variables are set
- Verify backend API is accessible
- Check n8n execution logs for detailed errors

## Notes

- The workflow uses environment variables for API URL and auth
- Session cookies expire - you may need to refresh periodically
- For production, consider implementing API key authentication
- The filter node uses Code node to properly handle arrays
