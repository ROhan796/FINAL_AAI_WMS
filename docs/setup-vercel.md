# Setup Guide: Portal on Vercel

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- GitHub repo connected to Vercel
- Repository contains `aai-unified-portal` folder with Next.js app

## Step 1: Import Project

1. Log in to Vercel Dashboard
2. Click **Add New Project**
3. Select **Import Git Repository**
4. Select your GitHub repository
5. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `aai-unified-portal`
   - **Build Command**: (auto-detected)
   - **Output Directory**: (auto-detected)
   - **Install Command**: (auto-detected)

## Step 2: Build Settings

Vercel automatically detects Next.js projects. The default settings should work:

- **Framework**: Next.js
- **Build Command**: `npm run build` or `next build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

No changes needed unless your project has custom build requirements.

## Step 3: Environment Variables

Copy all variables from `aai-unified-portal/.env2` and configure:

### App URLs
```bash
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
DA_ENGINE_URL=https://your-da-engine.onrender.com
NEXT_PUBLIC_DA_ENGINE_URL=https://your-da-engine.onrender.com
WMS_BACKEND_URL=https://your-wms-backend.onrender.com
NEXT_PUBLIC_WMS_API_URL=https://your-wms-backend.onrender.com
```

### Clerk Authentication
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/api/auth/redirect
```

### Upstash Redis
```bash
UPSTASH_REDIS_REST_URL="https://ready-monkey-212683.upstash.io"
UPSTASH_REDIS_REST_TOKEN="gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ"
```

### Database (NeonDB)
```bash
DATABASE_URL=postgresql://neondb_owner:npg_...@ep-.../neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_...@ep-.../neondb?sslmode=require
```

## Step 4: Deploy

1. Click **Deploy** button
2. Wait for the build to complete (usually 1-2 minutes)
3. Once deployed, Vercel provides a URL: `https://your-app.vercel.app`

### Auto-Deploy

Vercel automatically deploys on every push to the main branch. To deploy manually:

```bash
# Using Vercel CLI
cd aai-unified-portal
npx vercel --prod
```

## Step 5: Post-Deploy Configuration

### Update CORS on Render Services

After getting your Vercel URL, update the CORS settings on both Render services:

**WMS Backend (Render):**
```bash
CORS_ALLOW_ORIGINS=https://your-app.vercel.app
CORS_ORIGINS=https://your-app.vercel.app
```

**DA Engine (Render):**
```bash
CORS_ALLOW_ORIGIN=https://your-app.vercel.app
CORS_ORIGINS=https://your-app.vercel.app
```

### Configure Clerk Webhook

1. Go to Clerk Dashboard → Webhooks
2. Add endpoint: `https://your-app.vercel.app/api/webhook/clerk`
3. Select events:
   - `user.created`
   - `user.updated`
   - `user.deleted`

### Run Database Migrations

```bash
# Using Vercel CLI
cd aai-unified-portal
npx drizzle-kit push
```

## Important Notes

### server.ts Custom Server

Vercel runs Next.js in serverless mode. The custom `server.ts` file **will not work** on Vercel. Ensure your app uses standard Next.js patterns:

- Use `next.config.js` instead of custom server
- Use API routes (`pages/api/` or `app/api/`) for server-side logic
- Avoid Express.js or other custom servers

### Serverless Considerations

- Cold starts may add latency on first request
- WebSocket connections need special handling on Vercel
- Use Vercel's built-in analytics for monitoring

### Environment Variable Scope

- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser
- All other variables are only available server-side
- Sensitive keys should never use `NEXT_PUBLIC_` prefix
