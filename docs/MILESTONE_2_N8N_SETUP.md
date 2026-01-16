# Milestone 2: n8n Workflow - Data Collection

## Overview
Set up self-hosted n8n and create a workflow to collect daily feed items for the brief.

## Step 1: Install n8n

### Option A: Docker (Recommended)
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e VIBE_READER_API_URL=http://localhost:3001 \
  -e VIBE_READER_API_KEY=your-api-key-here \
  n8nio/n8n
```

**Note:** The `-e` flags set environment variables that the workflow can access. Alternatively, you can hardcode values in the workflow (see Step 3).

### Option B: npm
```bash
npm install n8n -g
n8n start
```

### Option C: Docker Compose (Best for Production)
Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=your-secure-password
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
      - VIBE_READER_API_URL=http://localhost:3001
      - VIBE_READER_API_KEY=your-api-key-here
    volumes:
      - ~/.n8n:/home/node/.n8n
```

Then run:
```bash
docker-compose up -d
```

## Step 2: Access n8n

1. Open browser to `http://localhost:5678`
2. Create an account (first time only)
3. You'll see the n8n workflow editor

## Step 3: Configure API Credentials

You have two options:

### Option A: Use Environment Variables (if passed to Docker)

If you started n8n with `-e VIBE_READER_API_KEY=...`, the workflow will automatically use it via `$env.VIBE_READER_API_KEY`.

### Option B: Hardcode in Workflow (Simpler, No Docker Flags Needed)

1. Import the workflow (`docs/n8n-daily-brief-data-collection.json`)
2. Open the **"Set Config"** node (first node after trigger)
3. Edit the assignments:
   - `apiUrl` = `http://localhost:3001` (or your production URL)
   - `apiKey` = `your-api-key-here`
4. Save the workflow

This way you don't need to pass Docker environment variables or use the paid Environments feature.

## Step 4: Import the Workflow

1. In n8n, click **Workflows** → **Import from File**
2. Select `n8n-daily-brief-data-collection.json`
3. The workflow will be imported with all nodes configured

## Step 5: Test the Workflow

1. Click **Execute Workflow** button (play icon)
2. The workflow will:
   - Use today's date (or you can input a date)
   - Refresh all feeds
   - Get daily items
   - Get brief metadata
3. Check the output of each node to verify data is flowing correctly

## Workflow Structure

The workflow has these nodes:

1. **Manual Trigger** - Starts the workflow, accepts optional date input
2. **Set Config** - Sets the date and API credentials (apiUrl, apiKey)
3. **Refresh Feeds** - HTTP Request to `POST /api/brief/refresh`
4. **Get Daily Items** - HTTP Request to `GET /api/brief/items?date={date}`
5. **Filter Items Without Summaries** - Filters items that need summaries
6. **Get Brief Metadata** - HTTP Request to `GET /api/brief/metadata?date={date}`
7. **Set Run Status: Running** - Updates brief run to "running"

## Troubleshooting

### "401 Unauthorized" errors
- Check that your API key is correct in the "Set Config" node
- Verify the key hasn't been deleted or expired
- Generate a new key if needed: `POST /api/keys` with `{ name: "new key" }`

### "Connection refused" errors
- Ensure your backend server is running
- Check that `apiUrl` in "Set Config" node is correct
- For localhost, use `http://localhost:3001`

### Workflow not executing
- Check that all nodes are connected (green lines between them)
- Verify "Set Config" node has apiUrl and apiKey set
- Check n8n execution logs in the bottom panel

## Next Steps

Once this workflow is working:
1. Proceed to Milestone 3 (Summary Generation)
2. The filtered items (without summaries) will be passed to the OpenAI node
3. Summaries will be saved back to your database
