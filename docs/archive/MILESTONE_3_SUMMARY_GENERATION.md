# Milestone 3: Summary Generation & Caching

## Overview
Add OpenAI summary generation to your n8n workflow. This milestone will:
1. Generate summaries for articles that don't have them
2. Save summaries back to your database
3. Handle errors and rate limiting

## Prerequisites
- ✅ Milestone 2 complete (n8n workflows set up)
- ✅ OpenAI API key (get from https://platform.openai.com/api-keys)
- ✅ Backend endpoint exists: `POST /api/items/:itemId/summary`

## Step 1: Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Name it "n8n daily brief" (or similar)
4. **Copy the key immediately** - you won't see it again!
5. Save it securely (you'll add it to n8n in the next step)

## Step 2: Add OpenAI Node to n8n Workflow

### For Dev Workflow:

1. Open your **"Daily Brief - Data Collection (Dev)"** workflow in n8n
2. After the **"Filter Items Without Summaries"** node, add a new node:
   - Click the "+" button or drag from the node panel
   - Search for "OpenAI" or "HTTP Request"
   - We'll use **HTTP Request** node (more control, works with free n8n)

3. **Configure HTTP Request Node:**
   - **Name:** "Generate Summary"
   - **Method:** POST
   - **URL:** `https://api.openai.com/v1/chat/completions`
   - **Authentication:** Header Auth
     - **Name:** `Authorization`
     - **Value:** `Bearer {{ $env.OPENAI_API_KEY }}` 
     - ⚠️ **Note:** If you get "access to env vars denied", use a hardcoded value like in Step 3 below
   - **Headers:**
     - **Name:** `Content-Type`
     - **Value:** `application/json`
   - **Body:** JSON
     ```json
     {
       "model": "gpt-4o-mini",
       "messages": [
         {
           "role": "system",
           "content": "You are a helpful assistant that creates concise, informative summaries of articles for a daily news brief."
         },
         {
           "role": "user",
           "content": "Summarize this article in 2-3 sentences for a daily news brief. Focus on key insights and actionable information.\n\nTitle: {{ $json.title }}\nSource: {{ $json.source }}\nContent: {{ $json.contentSnippet || $json.fullContent || 'No content available' }}"
         }
       ],
       "temperature": 0.7,
       "max_tokens": 150
     }
     ```

### Alternative: Hardcode API Key (If $env doesn't work)

If you get "access to env vars denied" error:

1. In the HTTP Request node, change the Authorization header to:
   - **Value:** `Bearer YOUR_OPENAI_API_KEY_HERE` (replace with your actual key)
2. ⚠️ **Security Note:** This stores your API key in the workflow. Only do this if you're self-hosting n8n and trust your setup.

## Step 3: Process Items One at a Time (Loop)

The OpenAI node needs to process items individually. We'll use n8n's "Split In Batches" or "Loop Over Items" node.

1. **After "Filter Items Without Summaries"**, add a **"Split In Batches"** node:
   - **Name:** "Process Items One by One"
   - **Batch Size:** 1
   - **Options:** Enable "Reset"

2. **Connect:**
   - "Filter Items Without Summaries" → "Process Items One by One"
   - "Process Items One by One" → "Generate Summary"

3. **Add Delay Node** (to respect rate limits):
   - After "Generate Summary", add a **"Wait"** node
   - **Name:** "Rate Limit Delay"
   - **Wait Time:** 1 second (1000ms)
   - This prevents hitting OpenAI rate limits

## Step 4: Extract Summary from OpenAI Response

Add a **"Code"** node after "Generate Summary":

- **Name:** "Extract Summary"
- **Code:**
```javascript
// Extract summary from OpenAI response
const openaiResponse = $input.item.json;
const summary = openaiResponse.choices?.[0]?.message?.content?.trim();

if (!summary) {
  throw new Error('No summary in OpenAI response');
}

// Return original item data + summary
return {
  ...$('Process Items One by One').item.json,
  generatedSummary: summary
};
```

## Step 5: Save Summary to Database

Add an **HTTP Request** node after "Extract Summary":

- **Name:** "Save Summary"
- **Method:** POST
- **URL:** `={{ $('Set Config').item.json.apiUrl }}/api/items/{{ $json.id }}/summary`
- **Headers:**
  - **Name:** `Authorization`
  - **Value:** `Bearer {{ $('Set Config').item.json.apiKey }}`
  - **Name:** `Content-Type`
  - **Value:** `application/json`
- **Body:** JSON
  ```json
  {
    "summary": "{{ $json.generatedSummary }}"
  }
  ```

## Step 6: Handle Errors

Add error handling to prevent one failed summary from stopping the entire workflow:

1. **On "Generate Summary" node:**
   - Click the node → **"Error Trigger"** tab
   - Enable "Continue On Fail"
   - This allows the workflow to continue even if one summary fails

2. **On "Save Summary" node:**
   - Also enable "Continue On Fail"

3. **Optional: Log Errors:**
   - Add a **"Code"** node with error trigger
   - Log failed items for manual review

## Step 7: Test the Workflow

1. **Run the dev workflow:**
   - Click "Execute Workflow" in n8n
   - Watch the execution log
   - Check that summaries are being generated and saved

2. **Verify in your app:**
   - Go to `http://localhost:5173`
   - Check that articles now have summaries
   - Look in the database to confirm `ai_summary` field is populated

## Step 8: Update Production Workflow

Repeat Steps 2-7 for your **"Daily Brief - Data Collection (Production)"** workflow, using your production API URL and API key.

## Workflow Structure (Final)

```
Manual Trigger
  ↓
Set Config
  ↓
Refresh Feeds
  ↓
Get Daily Items
  ↓
Filter Items Without Summaries
  ↓
Process Items One by One (Split In Batches)
  ↓
Generate Summary (OpenAI HTTP Request)
  ↓
Extract Summary (Code)
  ↓
Save Summary (HTTP Request to your API)
  ↓
Rate Limit Delay (Wait 1 second)
  ↓
[Loop back to Process Items]
  ↓
Get Brief Metadata (parallel path)
  ↓
Set Run Status: Running
```

## Cost Estimation

- **Model:** `gpt-4o-mini` (cheapest option)
- **Input:** ~650 tokens per article (500 words)
- **Output:** ~65 tokens per summary (50 words)
- **Cost:** ~$0.0001 per article
- **20 articles/day:** ~$0.002/day = **~$0.06/month**

## Troubleshooting

### "401 Unauthorized" from OpenAI
- Check your API key is correct
- Verify the Authorization header format: `Bearer YOUR_KEY`

### "Rate limit exceeded"
- Increase the delay between requests (try 2-3 seconds)
- OpenAI free tier: 3 requests/minute
- Paid tier: Higher limits

### "No summary in response"
- Check OpenAI response structure
- Verify the model name is correct (`gpt-4o-mini`)
- Check the Code node extraction logic

### Summaries not saving
- Verify API endpoint: `POST /api/items/:itemId/summary`
- Check API key authentication
- Verify item ID is being passed correctly

## Next Steps

Once summaries are working:
- ✅ **Milestone 4:** Audio Generation with ElevenLabs
- Generate audio from summaries
- Create intro with compliment
- Store audio files

## Notes

- Summaries are cached in the database - won't regenerate if they already exist
- The "Filter Items Without Summaries" node ensures we only process new items
- Rate limiting prevents API errors
- Error handling ensures partial failures don't stop the entire workflow
