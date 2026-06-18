# Deploy to Render

This app runs as a single **Node.js Web Service** (`npm start` → `simple-server.js`). Express serves the editor, admin pages, and API routes on one port (Render sets `PORT` automatically).

## 1. Push to GitHub

The repo must be on GitHub before connecting Render. Do not commit `.env` — set secrets in the Render dashboard.

## 2. Create the Render service

**Option A — Blueprint (recommended)**

1. Open [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
2. Connect your GitHub repo and select this directory as the root (if the repo is only this project, use repo root)
3. Render reads `render.yaml` and creates the web service
4. When prompted, enter environment variables (see below)

**Option B — Manual Web Service**

1. **New** → **Web Service** → connect the GitHub repo
2. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/`
3. Add environment variables (see below)
4. **Create Web Service**

## 3. Required environment variables

Copy values from your local `.env` into Render → **Environment**:

| Variable | Purpose |
|----------|---------|
| `B2_KEY_ID` | Backblaze application key ID |
| `B2_APP_KEY` | Backblaze application key secret |
| `B2_BUCKET_NAME` | Private bucket (student projects) |
| `B2_BUCKET_ID` | Bucket ID from B2 console |
| `ADMIN_PASSWORD` | Admin login for dashboard & common assets |
| `ADMIN_SESSION_SECRET` | Long random string for session cookies |

Optional:

| Variable | Purpose |
|----------|---------|
| `B2_PUBLIC_BUCKET_NAME` | Public common-assets bucket (auto-created if omitted) |
| `B2_PUBLIC_BUCKET_ID` | Public bucket ID after first deploy |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth in editor |
| `GITHUB_OAUTH_CALLBACK_BASE` | `https://YOUR-SERVICE.onrender.com` |

## 4. After deploy

Your app will be at `https://YOUR-SERVICE.onrender.com`:

- **Editor:** `/index.html` or `/`
- **Admin dashboard:** `/admin-dashboard.html`
- **Common assets:** `/admin-common-assets.html`

On first deploy, check **Logs** for B2 authorization and CORS messages.

## 5. Notes

- **Free tier** services spin down after inactivity; the first request may take ~30s.
- **Ephemeral disk:** Local `submissions.json` and temp uploads reset on redeploy; student project ZIPs in B2 persist.
- **HTTPS:** Render provides TLS automatically — use `https://` URLs when sharing links.
- Update GitHub OAuth callback URL to your Render URL if you use GitHub upload.
