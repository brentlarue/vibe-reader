# Debugging API Key Authentication

## Quick Checks

### 1. Is your backend running?
Make sure you have `npm run dev` running in a terminal. Check the terminal output for any errors.

### 2. Check backend logs
When you run the workflow, check the terminal where `npm run dev` is running. You should see logs like:
```
[AUTH] requireAuth called for: POST /api/brief/refresh
[AUTH] Invalid or expired API key
```
or
```
[AUTH] API key verified: n8n dev workflow
```

### 3. Verify API key exists and is correct

**Option A: Check in your app's console**
1. Go to `http://localhost:5173` in your browser
2. Log in
3. Open browser console (F12 or Cmd+Option+I)
4. Run this to list your API keys:
```javascript
fetch('/api/keys', {
  credentials: 'include'
})
.then(r => r.json())
.then(keys => {
  console.log('Your API keys:', keys);
  console.log('Check the "name" and "env" fields');
});
```

**Option B: Generate a new key**
If you're not sure about your current key, generate a fresh one:
```javascript
fetch('/api/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ name: 'n8n dev workflow' })
})
.then(r => r.json())
.then(data => {
  console.log('✅ NEW API Key:', data.key);
  console.log('⚠️ COPY THIS NOW - you won\'t see it again!');
  console.log('Key ID:', data.id);
  console.log('Environment:', data.env || 'dev');
});
```

### 4. Update n8n workflow
Once you have the correct API key:
1. Open your n8n workflow
2. Click "Set Config" node
3. Replace `REPLACE_WITH_YOUR_DEV_API_KEY` with your actual key
4. Save

### 5. Common Issues

**Issue: "Invalid or expired API key"**
- The key might be for the wrong environment (prod vs dev)
- The key might have been deleted
- Generate a new key

**Issue: "Key found but env mismatch"**
- You're using a prod key with a dev backend (or vice versa)
- Make sure the key's `env` matches your backend's environment
- Check your `.env` file for `APP_ENV` (should be `dev` for local)

**Issue: Backend can't connect to database**
- Check that Supabase credentials are in your `.env` file
- Check backend logs for database connection errors

## Testing the API Key Directly

You can test if your API key works by running this in your terminal:

```bash
curl -X POST http://localhost:3001/api/brief/refresh \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json"
```

If it works, you'll get a JSON response. If it fails, you'll get `{"error":"Unauthorized"}`.
