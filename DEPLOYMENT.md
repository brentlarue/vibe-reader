# Deployment Guide: Hosting at brentlarue.me/thesignal

This guide will help you deploy your full-stack React + Node.js app to Render, then configure it to work with your domain.

## Prerequisites
- Render account (render.com) - Free tier available
- GitHub account (for connecting your repo)
- Domain access to brentlarue.me

## Deploy to Render (Recommended)

Render is excellent for full-stack Node.js apps and offers easy deployment with automatic SSL.

### Step 1: Prepare Your Code

1. **Create a production build script** (if not already done):
   ```json
   "scripts": {
     "build": "tsc && vite build",
     "start": "node server/index.js",
     "dev": "..."
   }
   ```

2. **Create a `Procfile` for Render** (create in root directory):
   ```
   web: npm start
   ```

3. **Update server/index.js** to serve static files in production:
   - Render will need your server to serve the built frontend files
   - See "Step 2: Update Server Configuration" below

### Step 2: Update Server Configuration

Your `server/index.js` needs to serve the built frontend in production:

```javascript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// ... your existing middleware and routes ...

// Serve static files from the Vite dist directory in production
if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  
  // Serve index.html for all non-API routes (SPA routing)
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Step 3: Create Render Configuration

1. **Create `render.yaml` in root directory**:
   ```yaml
   services:
     - type: web
       name: the-signal
       env: node
       buildCommand: npm ci && npm run build
       startCommand: npm start
       envVars:
         - key: NODE_ENV
           value: production
         - key: APP_PASSWORD
           sync: false
         - key: SESSION_SECRET
           generateValue: true
         - key: OPENAI_API_KEY
           sync: false
       healthCheckPath: /health
   ```

### Step 4: Set Environment Variables

In Render dashboard, add these environment variables:

1. `NODE_ENV=production`
2. `PORT=3001` (Render will auto-assign, but set as fallback)
3. `APP_PASSWORD=Octopus-salad-42!` (your password)
4. `SESSION_SECRET=<generate-random-string>` (use: `openssl rand -hex 32`)
5. `OPENAI_API_KEY=<your-openai-api-key>`
6. `APP_ENV=prod` (or leave unset, defaults to prod)

### Step 5: Deploy to Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click "New" → "Web Service"
3. Connect your GitHub account if needed
4. Select your `vibe-reader` repository
5. Render will auto-detect the `render.yaml` configuration and start building
6. Once deployed, Render will give you a URL like `your-app.onrender.com`

### Step 6: Configure Domain at Render

1. In Render dashboard, go to your service → Settings → Custom Domains
2. Click "Add Custom Domain"
3. Enter: `thesignal.brentlarue.me` (or `brentlarue.me` for root domain)
4. Render will provide DNS records to add

### Step 7: Configure DNS at NameCheap

1. Log into NameCheap
2. Go to Domain List → Manage → Advanced DNS
3. Add new record:
   - Type: `CNAME`
   - Host: `thesignal` (creates thesignal.brentlarue.me)
   - Value: `your-app.onrender.com` (Render will provide this)
   - TTL: Automatic
4. Save changes

---

## Alternative: Deploy Backend + Frontend Separately

If you want more control, deploy separately:

### Backend (Render)
- Deploy just the `server/` directory
- Set API URL: `api.thesignal.brentlarue.me`

### Frontend (Vercel/Netlify)
- Deploy the built frontend
- Set API proxy to backend URL
- Deploy to `thesignal.brentlarue.me`

---

## Recommended: Subdomain Approach

**Easiest solution**: Deploy to `thesignal.brentlarue.me` (subdomain)

1. Deploy full-stack app to Render
2. Configure DNS: CNAME `thesignal` → `your-app.onrender.com`
3. No Webflow changes needed
4. Access at: `https://thesignal.brentlarue.me`

---

## Production Checklist

- [ ] Environment variables set (APP_PASSWORD, SESSION_SECRET, OPENAI_API_KEY)
- [ ] NODE_ENV=production
- [ ] Build script creates `dist/` folder
- [ ] Server serves static files in production
- [ ] CORS configured for production domain
- [ ] HTTPS/SSL enabled (automatic on Render)
- [ ] Health check endpoint working (`/health`)
- [ ] Test login flow
- [ ] Test API endpoints
- [ ] Test RSS feed fetching
- [ ] Test AI features

---

## Troubleshooting

**Issue: Frontend not loading**
- Check that `dist/` folder exists after build
- Verify server is serving static files correctly
- Check server logs

**Issue: API calls failing**
- Verify CORS settings allow your domain
- Check API routes are accessible
- Verify environment variables are set

**Issue: Sessions not persisting**
- Check SESSION_SECRET is set
- Verify cookie settings (secure, sameSite)
- Check domain configuration

---

## Security Notes for Production

1. **Change default password**: Update `APP_PASSWORD` in production
2. **Use strong SESSION_SECRET**: Generate with `openssl rand -hex 32`
3. **Enable secure cookies**: Already handled with `isProduction` check
4. **Restrict CORS**: Update CORS settings to only allow `brentlarue.me`
5. **Rate limiting**: Consider adding rate limiting to API endpoints
6. **Keep dependencies updated**: Regularly update npm packages

