# n8n Workflows Setup Guide

## Overview
Two separate workflows for dev and production environments.

## Workflows

### 1. Dev Workflow
**File:** `n8n-daily-brief-data-collection.json`
- **Name:** "Daily Brief - Data Collection (Dev)"
- **API URL:** `http://localhost:3001`
- **API Key:** Generate from `http://localhost:5173` (dev environment)

### 2. Production Workflow
**File:** `n8n-daily-brief-data-collection-prod.json`
- **Name:** "Daily Brief - Data Collection (Production)"
- **API URL:** `https://thesignal.brentlarue.me`
- **API Key:** Generate from `https://thesignal.brentlarue.me` (prod environment)

## Setup Instructions

### Step 1: Generate API Keys

**For Dev:**
1. Start your local backend: `npm run dev`
2. Open `http://localhost:5173` in browser
3. Log in
4. Open console and run:
```javascript
fetch('/api/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ name: 'n8n dev workflow' })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Dev API Key:', data.key);
  console.log('⚠️ SAVE THIS NOW!');
});
```

**For Production:**
1. Go to `https://thesignal.brentlarue.me`
2. Log in
3. Open console and run the same command
4. Save the production key

### Step 2: Import Workflows

1. **Import Dev Workflow:**
   - In n8n: Workflows → Import from File
   - Select `n8n-daily-brief-data-collection.json`
   - Open "Set Config" node
   - Replace `REPLACE_WITH_YOUR_DEV_API_KEY` with your dev API key
   - Save

2. **Import Production Workflow:**
   - In n8n: Workflows → Import from File
   - Select `n8n-daily-brief-data-collection-prod.json`
   - Open "Set Config" node
   - Replace `REPLACE_WITH_YOUR_PRODUCTION_API_KEY` with your prod API key
   - Save

### Step 3: Test

1. Run the dev workflow to test locally
2. Run the production workflow when ready for production

## Important Notes

- **API keys are environment-scoped** - Dev keys only work with dev backend, prod keys only work with prod backend
- **Keys are shown once** - Save them immediately when generated
- **Keep keys secure** - Don't commit them to git or share them
- **Different workflows** - Use dev workflow for testing, prod workflow for actual daily briefs

## Troubleshooting

### "401 Unauthorized"
- Check that the API key matches the environment (dev key for dev, prod key for prod)
- Verify the key hasn't been deleted
- Generate a new key if needed

### "Connection refused" (Dev)
- Make sure backend is running: `npm run dev`
- Check that apiUrl is `http://localhost:3001`

### "Connection timeout" (Prod)
- Verify production URL is correct
- Check that production server is running
- Verify API key is for production environment
