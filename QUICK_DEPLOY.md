# Quick Deployment Guide to brentlarue.me

## Recommended: Use Railway with Subdomain (Easiest)

Deploy to `thesignal.brentlarue.me` - this is the simplest approach.

### Step 1: Push Code to GitHub

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 2: Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Connect GitHub and select your `vibe-reader` repository
4. Railway will automatically detect and start building

### Step 3: Set Environment Variables

In Railway dashboard → Your Project → Variables:

Add these variables:
- `NODE_ENV` = `production`
- `APP_PASSWORD` = `Octopus-salad-42!` (or your chosen password)
- `SESSION_SECRET` = (generate with: `openssl rand -hex 32`)
- `OPENAI_API_KEY` = (your OpenAI API key)

### Step 4: Configure Custom Domain

1. Railway dashboard → Settings → **Domains**
2. Click **"Custom Domain"**
3. Enter: `thesignal.brentlarue.me`
4. Railway will show you DNS records to add

### Step 5: Configure DNS at NameCheap

1. Log into NameCheap
2. Domain List → **brentlarue.me** → **Manage** → **Advanced DNS**
3. Add new record:
   - **Type**: `CNAME Record`
   - **Host**: `thesignal`
   - **Value**: `your-app.up.railway.app` (Railway will provide this)
   - **TTL**: Automatic
4. Save changes

### Step 6: Wait for DNS Propagation

- Can take 5 minutes to 48 hours (usually 15-30 minutes)
- Check status in Railway dashboard

### Step 7: Access Your App

Once DNS propagates, visit: **https://thesignal.brentlarue.me**

---

## Alternative: Deploy to Render

Same process, but using Render.com:

1. Go to [render.com](https://render.com)
2. New → **Web Service**
3. Connect GitHub repo
4. Render auto-detects configuration
5. Set environment variables
6. Add custom domain: `thesignal.brentlarue.me`
7. Configure DNS at NameCheap (same as Railway)

---

## Files Already Created

✅ `server/index.js` - Updated to serve static files in production
✅ `package.json` - Added `start` script
✅ `Procfile` - For Railway/Render
✅ `railway.json` - Railway configuration
✅ `render.yaml` - Render configuration
✅ `DEPLOYMENT.md` - Detailed deployment guide

---

## Troubleshooting

**Build fails?**
- Check Railway/Render logs
- Ensure all dependencies are in `package.json`
- Verify build script works locally: `npm run build`

**App not loading?**
- Check environment variables are set
- Verify DNS has propagated: `nslookup thesignal.brentlarue.me`
- Check Railway/Render logs for errors

**API calls failing?**
- Check CORS settings in `server/index.js`
- Verify domain is in allowed origins
- Check browser console for CORS errors

---

## Testing Locally (Production Build)

Test production build locally before deploying:

```bash
# Build the frontend
npm run build

# Set environment variables
export NODE_ENV=production
export APP_PASSWORD=Octopus-salad-42!
export SESSION_SECRET=$(openssl rand -hex 32)
export OPENAI_API_KEY=your-key-here

# Start server
npm start

# Visit http://localhost:3001
```

