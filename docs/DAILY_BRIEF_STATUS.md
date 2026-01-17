# Daily Brief Feature Status

## Current Status: **DEV-ONLY**

The Daily Brief feature is currently only available in **development** environment. It is **not available in production**.

## Why Dev-Only?

1. **n8n Hosting Cost**: Production deployment requires hosting n8n on Render ($7/month minimum)
2. **Feature is Experimental**: The feature was built primarily for learning and experimentation
3. **Local n8n Works Well**: For personal use, running n8n locally (`localhost:5678`) is sufficient

## How It Works

### Development (localhost)
- ✅ Daily Brief appears in sidebar navigation
- ✅ Full functionality: generate briefs, play audio, delete briefs
- ✅ Requires local n8n instance running at `localhost:5678`
- ✅ Uses local backend API at `http://localhost:3001`

### Production (thesignal.brentlarue.me)
- ❌ Daily Brief is **hidden** from sidebar navigation
- ❌ `/brief` route is disabled
- ❌ Feature is not accessible to production users

## Code Implementation

### Frontend Detection
The app detects environment using `window.location.hostname`:
- **Dev**: `localhost`, `127.0.0.1`, `.local`, or contains `dev`
- **Prod**: Everything else (e.g., `thesignal.brentlarue.me`)

### Files Modified
- `src/components/Sidebar.tsx`: Conditional nav item (`isDev ? [{ path: '/brief', ... }] : []`)
- `src/components/AppContent.tsx`: Conditional route (`{isDev && <Route path="/brief" ... />}`)

## Future Production Deployment

If you want to enable Daily Brief in production:

1. **Deploy n8n to Render** (see `docs/N8N_PRODUCTION_MIGRATION.md`)
2. **Update frontend** to remove `isDev` checks in `Sidebar.tsx` and `AppContent.tsx`
3. **Set production environment variables** (n8n webhook URL, etc.)
4. **Test end-to-end** in production

## Benefits of Current Approach

- ✅ No additional hosting costs
- ✅ Feature available for personal development use
- ✅ Full learning experience without production constraints
- ✅ Can test thoroughly in dev before considering production
- ✅ Codebase remains clean and documented for future use
