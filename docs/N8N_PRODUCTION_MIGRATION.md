# n8n Production Migration Guide

**⚠️ NOTE: Daily Brief is currently DEV-ONLY**

Daily Brief is only available in development (localhost). It requires a local n8n instance and is not deployed to production to avoid additional hosting costs. This guide documents the implementation for reference and future production deployment if needed.

**Current Status:**
- ✅ **Dev**: Daily Brief is fully functional (requires local n8n at `localhost:5678`)
- ❌ **Prod**: Daily Brief is hidden/disabled (not deployed to production)

---

**Original Guide (for reference/future production deployment):**

---

## Prerequisites

Before starting, ensure you have:
- ✅ Production backend URL: `https://thesignal.brentlarue.me` (deployed on Render)
- ✅ Production n8n instance running on Render (publicly accessible) - **See Step 5.5 if not yet deployed**
- ✅ Production API key (for backend API access) - **Generate in Step 1**

**Note:** If you're using the **same Supabase, OpenAI, and ElevenLabs keys** for dev and prod, you don't need to update those - they can stay the same.

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

### Update "Set Config" Node (Only Backend API Values)

Since your keys are set directly on HTTP Request nodes (not in Set Config), you **only need to update Set Config with backend API values**.

### Open the "Set Config (manual)" node:

**Required Fields** (these are the only ones that need to be in Set Config):

1. **`apiUrl`**
   - **Dev**: `http://localhost:3001`
   - **Production**: `https://thesignal.brentlarue.me`
   - **Value**: `https://thesignal.brentlarue.me`

2. **`apiKey`**
   - **Dev**: (your dev API key)
   - **Production**: (the API key you generated in Step 1)
   - **Value**: `YOUR_PRODUCTION_API_KEY_HERE` (the Bearer token, without "Bearer " prefix)

**That's it!** The other keys (OpenAI, ElevenLabs, Supabase) are updated directly on their HTTP Request nodes in **Step 4**.

---

## Step 4: Verify HTTP Request Nodes (Likely No Changes Needed!)

If your HTTP Request nodes already use expressions like `{{ $('Set Config').item.json.apiKey }}` or `{{ $json.apiKey }}`, then **no changes are needed** - they'll automatically use the values you updated in Set Config!

### Quick Check:

Look at a few HTTP Request nodes (like "Refresh Feeds", "Get Daily Items") and check their **Authorization headers**:

- ✅ **If header uses**: `{{ $json.apiKey }}` or `{{ $('Set Config').item.json.apiKey }}` → **No change needed!** (Already pulling from Set Config)
- ❌ **If header is hardcoded**: `Bearer sk-...` → Update to use Set Config expression

### Nodes That Should Use Set Config Values:

1. **"Refresh Feeds" Node**
   - URL: `{{ $json.apiUrl }}/api/brief/refresh`
   - Authorization: `Bearer {{ $json.apiKey }}` (from Set Config)

2. **"Get Daily Items" Node**
   - URL: `{{ $json.apiUrl }}/api/brief/items?date={{ $json.date }}`
   - Authorization: `Bearer {{ $json.apiKey }}` (from Set Config)

3. **"Save Summary" Node** (inside loop)
   - URL: `{{ $('Set Config').first().json.apiUrl }}/api/items/{{ $json.itemId }}/summary`
   - Authorization: `Bearer {{ $('Set Config').first().json.apiKey }}` (from Set Config)

### D. "Get Brief Metadata" Node

- **URL**: Uses `{{ $json.apiUrl }}` (from Set Config)
- **Authorization**: Uses `{{ $json.apiKey }}` (from Set Config)
- **No change needed** if already using these expressions!

### E. "Generate Summary" Node (OpenAI)

- **Method**: `POST`
- **URL**: `https://api.openai.com/v1/chat/completions`
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: 
    - **No change needed** if using same OpenAI key for dev/prod
    - Verify the key is correct (same as dev)

### F. "Call OpenAI for Compliment" Node

- **Method**: `POST`
- **URL**: `https://api.openai.com/v1/chat/completions`
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: 
    - **No change needed** if using same OpenAI key for dev/prod
    - Verify the key is correct (same as dev)

### G. "Generate Audio" Node (ElevenLabs) ⚠️ CRITICAL

This node previously failed in dev. Double-check all settings:

- **Method**: `POST`
- **URL**: 
  - Keep same as dev (voice ID doesn't change)
  - **Example**: `https://api.elevenlabs.io/v1/text-to-speech/YOUR_VOICE_ID`
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `xi-api-key` ⚠️ **Note: `xi-api-key`, not `Authorization`!**
  - **Header Value**: 
    - **No change needed** if using same ElevenLabs key for dev/prod
    - Verify the key is correct (same as dev)
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
- **URL**: 
  - **No change needed** if using same Supabase project for dev/prod
  - If using different projects: Replace dev project ID with production project ID
  - Keep `{{ $json.date }}` or `{{ $('Prepare Audio Script').item.json.date }}` part as expression
- **Authentication**: 
  - Uses n8n's "Header Auth" credential for Supabase API Key (handles `apikey` header automatically)
  - **No change needed** if using same Supabase keys for dev/prod
- **Header Parameters** (if not using Header Auth, add these manually):
  - **If you see only `Content-Type` in Header Parameters**: Your setup uses n8n's Header Auth credential (recommended)
  - **Optional: Add `x-upsert` header** (recommended to handle duplicate files):
    - **Header Name**: `x-upsert`
    - **Header Value**: `true`
    - **Why**: Prevents errors when uploading a file with the same date/title (same filename)
  - **Optional: Add `Authorization` header** (if Header Auth doesn't set it):
    - **Header Name**: `Authorization`
    - **Header Value**: `Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY`
- **Body**: (Binary data from "Generate Audio" response)

**Note**: If your dev workflow works without `x-upsert` and `Authorization` headers, you don't need to add them. However, `x-upsert: true` is recommended to handle duplicate uploads gracefully.

### I. "Set Run Status: Complete" Node

- **Method**: `POST`
- **URL**: Uses `{{ $('Set Config').first().json.apiUrl }}` (from Set Config)
- **Authentication**: `Generic Credential Type`
  - **Header Name**: `Authorization`
  - **Header Value**: Uses `{{ $('Set Config').first().json.apiKey }}` (from Set Config)
  - **No change needed** if already using this expression!
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

## Step 5.5: Deploy n8n on Render (If Not Already Done)

Your production n8n instance must be publicly accessible (not `localhost`). If you haven't deployed n8n to Render yet:

### ⚠️ IMPORTANT: Export Your Workflow First!

**Before deploying**, export your production workflow from local n8n:

1. **In your local n8n** (`localhost:5678`):
   - Open your production workflow: **"Daily Brief - With Summaries (Production)"**
   - Click **"..." menu** (top right) → **"Download"**
   - Save the JSON file (e.g., `daily-brief-production.json`)

**This way you can import it into the new Render n8n instance - you won't have to recreate it!**

### Option A: Deploy n8n Using Docker (Recommended - No Repository Needed)

**You don't need to connect any repository!** n8n can be deployed directly using Docker.

1. **In Render Dashboard:**
   - Click **"New +"** → **"Web Service"**
   - Select the **"Existing Image"** tab
   - **Image URL field**: Replace the placeholder with `n8nio/n8n`
   - **Credential (Optional)**: Leave as "No credential" (n8n image is public)
   - Click **"Connect"**

2. **Configure n8n Service:**
   - **Name**: `n8n-production` (or similar)
   - **Region**: Choose closest to your backend
   - **Branch**: (N/A for Docker image deployment)
   - **Instance Type**: Starter ($7/month) should be fine for n8n
   - Click **"Create Web Service"**

3. **Set Environment Variables in Render:**
   - Go to your n8n service → **Environment** tab
   - Add these variables:
     - `N8N_BASIC_AUTH_ACTIVE=true`
     - `N8N_BASIC_AUTH_USER=your_username` (choose a username)
     - `N8N_BASIC_AUTH_PASSWORD=your_secure_password` (choose a secure password)
     - `N8N_HOST=your-n8n-service.onrender.com` (will be set automatically after first deploy)
     - `N8N_PROTOCOL=https`
     - `PORT=5678` (or use `$PORT` if Render auto-sets it)

4. **Deploy:**
   - Click **"Create Web Service"**
   - Wait for deployment to complete
   - Your n8n will be available at: `https://your-n8n-service.onrender.com`

5. **Access n8n and import workflow:**
   - Visit `https://your-n8n-service.onrender.com`
   - Log in with the username/password you set above
   - Click **"..." menu** (top right) → **"Import from File"**
   - Upload the JSON file you exported earlier (`daily-brief-production.json`)
   - Your production workflow will be restored! ✅

**Note:** If you need to export from dev n8n, do it before deploying to Render.

### Option B: Use a Simple Repository (Alternative)

If Render requires a repository connection:

1. **Create a minimal repo** (or use existing n8n config repo if you have one)
   - Create a new GitHub repo (separate from vibe-reader)
   - Add a simple `Dockerfile`:
     ```dockerfile
     FROM n8nio/n8n
     ```
   - Push to GitHub

2. **Connect this minimal repo to Render** (not your vibe-reader repo!)

3. **Follow steps 3-5 from Option A above**

**Note:** Your **vibe-reader repo is NOT needed** for hosting n8n. n8n is a completely separate service.

**After deployment, proceed to Step 6 to get your webhook URL.**

---

## Step 6: Get Production Webhook URL

1. **In your production n8n** (deployed on Render):
   - Open your production workflow: **"Daily Brief - With Summaries (Production)"**
   - **Click the "Webhook" node** (bottom left)

2. **Copy the Production Webhook URL:**
   - In the "Webhook URLs" section, **"Production URL"** tab
   - Copy the URL (should be something like: `https://your-n8n-service.onrender.com/webhook/601b1290-bff0-4d56-835a-dd5ff30c45b4`)
   - ⚠️ **IMPORTANT**: This must be a `https://` URL, NOT `localhost`!

3. **Set this URL in your production backend (Render):**
   - Go to Render Dashboard → Your Backend Service → **Environment** tab
   - Add/Update environment variable:
     - **Variable**: `N8N_WEBHOOK_URL`
     - **Value**: `https://your-n8n-service.onrender.com/webhook/XXXXX` (the URL you copied)
   - **Click "Save Changes"**

4. **Restart your production backend:**
   - Render will automatically restart after saving environment variables
   - **OR** manually restart: Render Dashboard → Your Service → **Manual Deploy** → **Clear build cache & deploy**

5. **Verify it's loaded:**
   - Check backend logs in Render Dashboard
   - Look for: `[ENV] ✓ N8N_WEBHOOK_URL is set`
   - Should show your Render n8n URL (not localhost!)

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
- **Check**: `N8N_WEBHOOK_URL` is set in production backend environment variables (Render Dashboard → Environment)
- **Check**: URL is a **public Render URL** (like `https://your-n8n.onrender.com/webhook/...`), NOT `localhost:5678`
- **Check**: Backend was restarted after setting the variable (Render auto-restarts, but verify in logs)
- **Check**: n8n is deployed and running on Render (not just running locally)
- **Check backend logs**: Look for `[ENV] ✓ N8N_WEBHOOK_URL is set` - should show your Render URL

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
- n8n execution logs (in n8n UI on Render)
- Production backend logs (Render Dashboard → Your Service → Logs)
- Browser console (for frontend errors)
