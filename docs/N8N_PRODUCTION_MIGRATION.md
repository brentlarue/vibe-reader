# n8n Production Migration Guide

**Complete step-by-step guide for migrating your Daily Brief workflow from Dev to Production**

---

## Prerequisites

Before starting, ensure you have:
- ✅ Production backend URL: `https://thesignal.brentlarue.me`
- ✅ Production Supabase project (same as dev or separate?)
- ✅ Production n8n instance running (publicly accessible)
- ✅ Production API keys:
  - OpenAI API Key (production)
  - ElevenLabs API Key (production)
  - Supabase Service Role Key (production)
  - Supabase Anon Key (production)
  - Supabase Project ID (for storage URLs)

---

## Step 1: Generate Production API Key

Your backend requires a Bearer token for authentication. Generate one for production:

### Method: Browser Console (Easiest)

1. **Log into production app**: `https://thesignal.brentlarue.me`
2. **Open DevTools** (F12) → **Console tab**
3. **Run this code**:

```javascript
// Generate production API key for n8n
fetch('/api/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ 
    name: 'n8n Production Workflow',
    expiresInDays: null  // null = never expires
  })
})
.then(r => r.json())
.then(data => {
  if (data.error) {
    console.error('❌ Error:', data.error);
    return;
  }
  console.log('✅ PRODUCTION API KEY CREATED!');
  console.log('');
  console.log('KEY:', data.key);
  console.log('ID:', data.id);
  console.log('Name:', data.name);
  console.log('Created:', data.createdAt);
  console.log('');
  console.log('⚠️ COPY THE KEY ABOVE NOW - YOU WON\'T SEE IT AGAIN!');
  console.log('');
  console.log('Next step: Copy this key into n8n "Set Config" node → apiKey field');
});
```

4. **IMPORTANT:** Copy the `key` value immediately from the console output - it's only shown once!

**Save this key securely** - you'll use it in **Step 3: Set Config Node**.

---

## Step 2: Clone or Create Production Workflow

### Option A: Clone Dev Workflow (Recommended)
1. In n8n, open your **"Daily Brief - With Summaries (Dev)"** workflow
2. Click **"..." menu** (top right) → **"Duplicate"**
3. Rename the duplicate to: **"Daily Brief - With Summaries (Production)"**

### Option B: Start Fresh
1. Create a new workflow named: **"Daily Brief - With Summaries (Production)"**
2. Copy all nodes from dev workflow manually

---

## Step 3: Update "Set Config" Node

This is the **most critical node**. It contains all environment-specific values.

### Open the "Set Config (manual)" node:

Update **ALL** of these fields (Expression Mode: **OFF** for values, unless noted):

#### Required Fields:

1. **`apiUrl`**
   - **Dev**: `http://localhost:3001`
   - **Production**: `https://thesignal.brentlarue.me`
   - **Value**: `https://thesignal.brentlarue.me`

2. **`apiKey`**
   - **Dev**: (your dev API key)
   - **Production**: (the API key you generated in Step 1)
   - **Value**: `YOUR_PRODUCTION_API_KEY_HERE` (the Bearer token, without "Bearer " prefix)

3. **`supabaseUrl`**
   - **Dev**: (your dev Supabase URL, e.g., `https://xxxxx.supabase.co`)
   - **Production**: (your production Supabase URL)
   - **Value**: `https://YOUR_PROJECT_REF.supabase.co`

4. **`supabaseServiceRoleKey`**
   - **Dev**: (your dev service role key)
   - **Production**: (your production service role key)
   - **Value**: `YOUR_PRODUCTION_SERVICE_ROLE_KEY`

5. **`supabaseAnonKey`**
   - **Dev**: (your dev anon key)
   - **Production**: (your production anon key)
   - **Value**: `YOUR_PRODUCTION_ANON_KEY`

6. **`supabaseProjectId`**
   - **Dev**: (your dev project ref)
   - **Production**: (your production project ref)
   - **Value**: `YOUR_PRODUCTION_PROJECT_REF` (the part before `.supabase.co`)

7. **`openaiApiKey`**
   - **Dev**: (your dev OpenAI key)
   - **Production**: (your production OpenAI key)
   - **Value**: `YOUR_PRODUCTION_OPENAI_KEY`

8. **`elevenlabsApiKey`**
   - **Dev**: (your dev ElevenLabs key)
   - **Production**: (your production ElevenLabs key)
   - **Value**: `YOUR_PRODUCTION_ELEVENLABS_KEY`

9. **`voiceId`**
   - **Keep the same** as dev (unless you want a different voice)
   - **Value**: (your ElevenLabs voice ID, e.g., `pNInz6obpgDQGcFmaJgB`)

---

## Step 4: Update All HTTP Request Nodes

### A. "Refresh Feeds" Node

- **Method**: `POST`
- **URL**: (Expression Mode: **ON**)
  ```javascript
  {{ $json.apiUrl }}/api/brief/refresh
  ```
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    Bearer {{ $json.apiKey }}
    ```

### B. "Get Daily Items" Node

- **Method**: `GET`
- **URL**: (Expression Mode: **ON**)
  ```javascript
  {{ $json.apiUrl }}/api/brief/items?date={{ $json.date }}
  ```
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    Bearer {{ $json.apiKey }}
    ```

### C. "Save Summary" Node (inside loop)

- **Method**: `POST`
- **URL**: (Expression Mode: **ON**)
  ```javascript
  {{ $('Set Config').first().json.apiUrl }}/api/items/{{ $json.itemId }}/summary
  ```
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    Bearer {{ $('Set Config').first().json.apiKey }}
    ```

### D. "Get Brief Metadata" Node

- **Method**: `GET`
- **URL**: (Expression Mode: **ON**)
  ```javascript
  {{ $json.apiUrl }}/api/brief/metadata?date={{ $json.date }}
  ```
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    Bearer {{ $json.apiKey }}
    ```

### E. "Generate Summary" Node (OpenAI)

- **Method**: `POST`
- **URL**: `https://api.openai.com/v1/chat/completions`
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    Bearer {{ $('Set Config').first().json.openaiApiKey }}
    ```

### F. "Call OpenAI for Compliment" Node

- **Method**: `POST`
- **URL**: `https://api.openai.com/v1/chat/completions`
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    Bearer {{ $('Set Config').first().json.openaiApiKey }}
    ```

### G. "Generate Audio" Node (ElevenLabs) ⚠️ CRITICAL

This node previously failed in dev. Double-check all settings:

- **Method**: `POST`
- **URL**: (Expression Mode: **ON**)
  ```javascript
  https://api.elevenlabs.io/v1/text-to-speech/{{ $('Set Config').first().json.voiceId }}
  ```
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `xi-api-key`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    {{ $('Set Config').first().json.elevenlabsApiKey }}
    ```
- **Body**: (JSON mode, Expression Mode: **ON**)
  ```javascript
  {
    "text": {{ $json.script }},
    "model_id": "eleven_turbo_v2_5",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75
    }
  }
  ```
  ⚠️ **IMPORTANT**: Ensure `model_id` is `"eleven_turbo_v2_5"` (not `eleven_monolingual_v1`) to save credits!

### H. "Upload to Supabase Storage" Node

- **Method**: `POST`
- **URL**: (Expression Mode: **ON**)
  ```javascript
  https://{{ $('Set Config').first().json.supabaseProjectId }}.supabase.co/storage/v1/object/audio-briefs/{{ $json.date }}.mp3
  ```
- **Authentication**: `Generic Credential Type` (set **TWO headers**):
  1. **Header Name**: `Authorization`
     - **Header Value**: (Expression Mode: **ON**)
       ```javascript
       Bearer {{ $('Set Config').first().json.supabaseServiceRoleKey }}
       ```
  2. **Header Name**: `apikey`
     - **Header Value**: (Expression Mode: **ON**)
       ```javascript
       {{ $('Set Config').first().json.supabaseServiceRoleKey }}
       ```
  3. **Header Name**: `x-upsert`
     - **Header Value**: `true`
     - **Note**: This handles duplicate file names (same date/title)
- **Body**: (Binary data from "Generate Audio" response)

### I. "Set Run Status: Complete" Node

- **Method**: `POST`
- **URL**: (Expression Mode: **ON**)
  ```javascript
  {{ $('Set Config').first().json.apiUrl }}/api/brief/runs
  ```
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: (Expression Mode: **ON**)
    ```javascript
    Bearer {{ $('Set Config').first().json.apiKey }}
    ```
- **Body**: (JSON mode, Expression Mode: **ON**)
  ```javascript
  {
    "date": {{ $json.date }},
    "status": "completed",
    "metadata": {
      "articleCount": {{ $json.articleCount }},
      "totalDuration": {{ $json.totalDuration }},
      "compliment": {{ $json.compliment }}
    }
  }
  ```

---

## Step 5: Update Code Nodes (if needed)

### "Set Config Date" Code Node

If you have a node that sets the date dynamically, ensure it works for both webhook and manual trigger:

```javascript
// If date comes from webhook, use it; otherwise use yesterday
const date = $input.item.json.date || (() => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
})();

return {
  date: date
};
```

---

## Step 6: Verify Webhook URL

1. **In n8n**, open your production workflow
2. **Click the "Webhook" node** (bottom left)
3. **Copy the webhook URL** (should be something like: `https://YOUR_N8N_INSTANCE.com/webhook/XXXXX`)
4. **Set this URL in your production backend environment variable**:
   - Variable: `N8N_WEBHOOK_URL`
   - Value: `https://YOUR_N8N_INSTANCE.com/webhook/XXXXX`
5. **Restart your production backend** to pick up the new webhook URL

---

## Step 7: Publish and Test

1. **Save the workflow** in n8n
2. **Click "Publish"** to activate it
3. **Test with manual trigger**:
   - Click "When clicking 'Test workflow'"
   - Execute the workflow
   - Check logs for errors
4. **Test from production app**:
   - Go to `https://thesignal.brentlarue.me/brief`
   - Click "Generate yesterday's brief"
   - Monitor n8n execution logs

---

## Step 8: Verify Production Environment

### Check Backend Environment Variables

Your production backend (`thesignal.brentlarue.me`) needs:

```env
APP_ENV=prod  # or leave unset (defaults to prod)
N8N_WEBHOOK_URL=https://YOUR_N8N_INSTANCE.com/webhook/XXXXX
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRODUCTION_SERVICE_ROLE_KEY
OPENAI_API_KEY=YOUR_PRODUCTION_OPENAI_KEY
# ... other env vars
```

---

## Common Issues & Solutions

### ❌ "Authorization failed"
- **Check**: API key is correct and not expired
- **Check**: Authorization header format: `Bearer YOUR_KEY` (with space)
- **Check**: API key was generated from production app (not dev)

### ❌ "n8n webhook URL not configured"
- **Check**: `N8N_WEBHOOK_URL` is set in production backend `.env`
- **Check**: Backend was restarted after setting the variable

### ❌ "ElevenLabs Authorization failed"
- **Check**: `xi-api-key` header (not `Authorization`)
- **Check**: ElevenLabs API key is correct
- **Check**: You're not over your free tier limit

### ❌ "Supabase Storage upload failed"
- **Check**: Both `Authorization` and `apikey` headers are set
- **Check**: Using `service_role_key` (not `anon_key`)
- **Check**: Project ID in URL matches production Supabase project

### ❌ "Wrong project ID in storage URL"
- **Check**: `supabaseProjectId` in "Set Config" matches production
- **Check**: Storage bucket `audio-briefs` exists in production Supabase

---

## Checklist

Before going live, verify:

- [ ] All URLs in "Set Config" point to production
- [ ] All API keys in "Set Config" are production keys
- [ ] `eleven_turbo_v2_5` model is set (to save credits)
- [ ] All HTTP Request nodes use `{{ $json.apiUrl }}` or `{{ $('Set Config').first().json.apiUrl }}`
- [ ] All Authorization headers use `Bearer {{ $json.apiKey }}` or similar
- [ ] Webhook URL is set in production backend environment
- [ ] Production backend environment variables are configured
- [ ] Workflow is published in n8n
- [ ] Manual test execution succeeds
- [ ] Test from production app succeeds

---

## Final Notes

1. **Keep dev and prod workflows separate** - never overwrite dev with prod config
2. **Use the same Supabase project** OR ensure both projects have identical schema
3. **Monitor credit usage** - ElevenLabs credits can add up quickly
4. **Set up alerts** - Monitor n8n execution logs for failures
5. **Backup your workflow** - Export as JSON before major changes

---

**Questions? Check the logs:**
- n8n execution logs (in n8n UI)
- Production backend logs (Render dashboard or wherever hosted)
- Browser console (for frontend errors)
