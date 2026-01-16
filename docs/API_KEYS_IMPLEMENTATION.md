# API Keys Implementation - Complete ✅

## Summary
Added API key authentication for automated access (n8n, scripts, etc.) as a secure alternative to session cookies.

## What Was Implemented

### 1. Database Migration
**File:** `docs/migration-add-api-keys.sql`

- Created `api_keys` table
- Stores keys as SHA-256 hashes (never plain text)
- Tracks usage with `last_used_at`
- Supports optional expiration
- Environment-scoped (dev/prod)

### 2. API Key Repository
**File:** `server/db/apiKeyRepository.js`

Functions:
- `createApiKey(name, expiresAt)` - Generate new key
- `verifyApiKey(plainKey)` - Verify and track usage
- `listApiKeys()` - List all keys (without plain keys)
- `deleteApiKey(keyId)` - Revoke a key

### 3. Updated Authentication Middleware
**File:** `server/index.js`

- `requireAuth()` now accepts:
  - **API Key**: `Authorization: Bearer <key>` header
  - **Session Cookie**: `Cookie: session=<token>` (existing)
- Tries API key first, falls back to session cookie
- Logs authentication method for debugging

### 4. API Key Management Endpoints
**File:** `server/index.js`

- `POST /api/keys` - Create new API key
  - Body: `{ name: string, expiresInDays?: number }`
  - Returns: `{ key: string, id: string, ... }` (key shown once!)
  
- `GET /api/keys` - List all keys (without plain keys)
  - Returns: Array of key metadata
  
- `DELETE /api/keys/:keyId` - Delete/revoke a key

### 5. Updated Documentation
- `docs/API_KEYS_GUIDE.md` - Complete guide
- `docs/MILESTONE_2_N8N_SETUP.md` - Updated to use API keys
- `docs/n8n-daily-brief-data-collection.json` - Updated workflow

## How to Use

### Step 1: Run Database Migration

In Supabase SQL Editor, run:
```sql
-- Copy contents of docs/migration-add-api-keys.sql
```

### Step 2: Generate an API Key

**Browser Console Method:**
```javascript
fetch('/api/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ name: 'n8n daily brief' })
})
.then(r => r.json())
.then(data => {
  console.log('API Key:', data.key);
  console.log('⚠️ SAVE THIS NOW - IT WON\'T BE SHOWN AGAIN!');
});
```

### Step 3: Use in n8n

1. Set environment variable: `VIBE_READER_API_KEY=your-key-here`
2. Workflow already configured to use: `Authorization: Bearer {{ $env.VIBE_READER_API_KEY }}`

### Step 4: Use in curl/scripts

```bash
curl http://localhost:3001/api/brief/items?date=2026-01-15 \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
```

## Security Features

1. **Keys are hashed** - Stored as SHA-256, never plain text
2. **One-time display** - Plain key only shown when created
3. **Environment scoping** - Dev keys don't work in prod and vice versa
4. **Optional expiration** - Set `expiresInDays` when creating
5. **Usage tracking** - `last_used_at` updated on each use
6. **Instant revocation** - Delete key to revoke immediately

## Benefits Over Session Cookies

✅ **No expiration issues** - Keys don't expire unless you set it  
✅ **Perfect for automation** - No manual cookie copying  
✅ **Better security** - Can revoke instantly, track usage  
✅ **Multiple keys** - Different key per tool/service  
✅ **Environment isolation** - Dev/prod keys are separate  

## Testing

### Test API Key Creation
```bash
# Get session cookie first by logging in, then:
curl -X POST http://localhost:3001/api/keys \
  -H "Cookie: session=YOUR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"name": "test key"}'
```

### Test API Key Usage
```bash
# Use the key from above:
curl http://localhost:3001/api/brief/items?date=2026-01-15 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Test Key Listing
```bash
curl http://localhost:3001/api/keys \
  -H "Cookie: session=YOUR_SESSION"
```

## Next Steps

1. Run the database migration
2. Generate an API key for n8n
3. Update n8n environment variables
4. Test the workflow with the new authentication

The n8n workflow JSON has already been updated to use API keys instead of session cookies!
