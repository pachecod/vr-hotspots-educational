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
| `DATABASE_URL` | PostgreSQL connection (auto-set when using `render.yaml` blueprint) |
| `B2_KEY_ID` | Backblaze application key ID |
| `B2_APP_KEY` | Backblaze application key secret |
| `B2_BUCKET_NAME` | Private bucket (student projects) |
| `B2_BUCKET_ID` | Bucket ID from B2 console |
| `ADMIN_PASSWORD` | Admin login for dashboard & common assets |
| `ADMIN_SESSION_SECRET` | Long random string for admin session cookies |
| `STUDENT_SESSION_SECRET` | Long random string for student session cookies |
| `STUDENT_AUTH_REQUIRED` | Set `true` in production to require student sign-in |

Optional:

| Variable | Purpose |
|----------|---------|
| `B2_PUBLIC_BUCKET_NAME` | Public common-assets bucket (auto-created if omitted) |
| `B2_PUBLIC_BUCKET_ID` | Public bucket ID after first deploy |
| `STRIPE_ENABLED` | Set `true` to enable class billing upgrades |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_PRICE_CLASS` | Stripe Price ID for Class tier |
| `STRIPE_PRICE_PRO` | Stripe Price ID for Pro tier |
| `STRIPE_ALLOW_STUDENT_UPGRADES` | Set `true` to allow per-student upgrades |

## 4. After deploy

Your app will be at `https://YOUR-SERVICE.onrender.com`:

- **Editor:** `/index.html` or `/`
- **Admin submissions:** `/admin-submissions.html` (primary admin inbox)
- **Admin assets (Online Assets):** `/admin-common-assets.html`
- **Users & classes:** `/admin-users.html`
- **Billing (if Stripe enabled):** `/admin-billing.html`

> `/admin-dashboard.html` redirects to Submissions.

On first deploy, check **Logs** for PostgreSQL migration, B2 authorization, and CORS messages.

### Student & class setup

1. Sign in to **Users & Classes** (`/admin-users.html`) as admin
2. Create classes and add students (passwords are shown once — use **Download All Passwords (CSV)**)
3. Students sign in at the editor: choose class → name → password
4. Upload shared media on **Assets** (`/admin-common-assets.html`); optional tags help students find files

For classroom workflows (grading, peek, asset tagging), see [USER_GUIDE.md](USER_GUIDE.md). Planned teacher-specific guides are listed in [DOCS_PLAN.md](DOCS_PLAN.md).

### Stripe billing (optional)

1. Create Products/Prices in [Stripe Dashboard](https://dashboard.stripe.com/)
2. Set `STRIPE_ENABLED=true` and add keys in Render env
3. Add webhook endpoint: `https://YOUR-SERVICE.onrender.com/api/stripe/webhook`
4. For local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

## 5. Notes

- **Free tier** services spin down after inactivity; the first request may take ~30s.
- **PostgreSQL** stores classes, students, submissions metadata, and billing — survives redeploys.
- **Ephemeral disk:** Local `hosted-projects/` resets on redeploy; **re-host** student projects from Submissions after redeploy if you use **Host**. Student ZIPs in B2 and PostgreSQL data persist.
- **HTTPS:** Render provides TLS automatically — use `https://` URLs when sharing links.
