# API Keys Guide

## Overview
API keys provide secure, automated access to your RSS reader API without needing session cookies. Perfect for n8n workflows, scripts, and other automated tools.

## Creating an API Key

### Method 1: Browser Console (Easiest)

1. Log in to your app in a browser
2. Open DevTools (F12) → Console
3. Run this command:

```javascript
fetch('/api/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ 
    name: 'n8n daily brief',
    expiresInDays: null  // null = never expires, or set number of days
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ API Key Created!');
  console.log('Key:', data.key);
  console.log('ID:', data.id);
  console.log('⚠️ SAVE THIS KEY NOW - IT WON\'T BE SHOWN AGAIN!');
});
```

4. **IMPORTANT:** Copy the `key` value immediately - it's only shown once!

### Method 2: curl

```bash
# First, get a session cookie by logging in
# Then use it to create an API key:

curl -X POST http://localhost:3001/api/keys \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"name": "n8n daily brief"}'
```

## Using an API Key

### In HTTP Requests

Add this header to all API requests:
```
Authorization: Bearer YOUR_API_KEY_HERE
```

### Example: curl

```bash
curl http://localhost:3001/api/brief/items?date=2026-01-15 \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
```

### Example: n8n

In n8n HTTP Request nodes, add header:
- Name: `Authorization`
- Value: `Bearer {{ $env.VIBE_READER_API_KEY }}`

## Managing API Keys

### List All Keys

```javascript
fetch('/api/keys', {
  credentials: 'include'
})
.then(r => r.json())
.then(keys => console.log(keys));
```

Returns array of keys (without plain keys):
```json
[
  {
    "id": "uuid",
    "name": "n8n daily brief",
    "env": "prod",
    "lastUsedAt": "2026-01-15T10:30:00Z",
    "createdAt": "2026-01-15T09:00:00Z",
    "expiresAt": null,
    "isExpired": false
  }
]
```

### Delete a Key

```javascript
fetch('/api/keys/KEY_ID_HERE', {
  method: 'DELETE',
  credentials: 'include'
})
.then(r => r.json())
.then(result => console.log(result));
```

## Security Best Practices

1. **Never commit API keys to git** - Use environment variables
2. **Use different keys for different tools** - Easier to revoke if compromised
3. **Set expiration dates** - For temporary access, set `expiresInDays`
4. **Rotate keys periodically** - Delete old keys and create new ones
5. **Monitor usage** - Check `lastUsedAt` to see if keys are being used

## Key Expiration

When creating a key, you can set an expiration:

```javascript
fetch('/api/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ 
    name: 'temporary script',
    expiresInDays: 30  // Expires in 30 days
  })
})
```

- `expiresInDays: null` = Never expires (default)
- `expiresInDays: 30` = Expires in 30 days
- Expired keys are automatically rejected

## Environment Scoping

API keys are scoped by environment:
- Keys created in `dev` environment only work with `APP_ENV=dev`
- Keys created in `prod` environment only work with `APP_ENV=prod` (or unset)

This prevents accidental cross-environment access.

## Troubleshooting

### "401 Unauthorized" with API key
- Check the key is correct (no extra spaces)
- Verify the key hasn't been deleted
- Check if the key has expired
- Ensure you're using `Bearer ` prefix: `Authorization: Bearer YOUR_KEY`

### "Key not found"
- Key might be for a different environment
- Key might have been deleted
- Generate a new key

### "Key expired"
- Create a new key
- Or extend expiration when creating: `expiresInDays: null`

## Comparison: API Keys vs Session Cookies

| Feature | API Keys | Session Cookies |
|---------|----------|-----------------|
| Expiration | Optional, configurable | 1-90 days |
| Security | SHA-256 hashed | JWT signed |
| Automation | ✅ Perfect for scripts | ❌ Manual refresh needed |
| Revocation | ✅ Instant (delete key) | ❌ Wait for expiration |
| Usage tracking | ✅ `lastUsedAt` | ❌ No tracking |

**Recommendation:** Use API keys for all automated access (n8n, scripts, etc.)
