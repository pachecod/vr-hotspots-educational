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
   - **Build command:** `npm install` (or `npm install && npm run build:flat-editor` if you change flat-editor sources without committing the bundle)
   - **Start command:** `npm start`
   - **Health check path:** `/`
3. Add environment variables (see below)
4. **Create Web Service**

## 3. Required environment variables

Copy values from your local `.env` into Render → **Environment**:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (auto-set when using `render.yaml` blueprint). Required for snippets, templates, and editor settings. |
| `B2_KEY_ID` | Backblaze application key ID |
| `B2_APP_KEY` | Backblaze application key secret |
| `B2_BUCKET_NAME` | Private bucket (student projects) |
| `B2_BUCKET_ID` | Bucket ID from B2 console |
| `ADMIN_PASSWORD` | Admin login for dashboard & common assets |
| `ADMIN_SESSION_SECRET` | Long random string for admin session cookies |
| `STUDENT_SESSION_SECRET` | Long random string for student session cookies |
| `STUDENT_AUTH_REQUIRED` | Set `true` in production to require student sign-in |
| `LOCAL_TEST_USER_ENABLED` | Set `true` to offer **Continue as Guest** on the welcome screen |
| `LOCAL_TEST_USER_ALLOW_PRODUCTION` | Required with guest mode on Render (`NODE_ENV=production`) |
| `PUBLIC_PLAYGROUND_ENABLED` | Set `true` to show **Try a sample project** grid on the welcome screen |

Optional:

| Variable | Purpose |
|----------|---------|
| `B2_PUBLIC_BUCKET_NAME` | Public common-assets bucket (auto-created if omitted) |
| `B2_PUBLIC_BUCKET_ID` | Public bucket ID after first deploy |
| `OPENAI_API_KEY` | OpenAI secret key for **Ridey** AI in the flat page editor |
| `RIDEY_ENABLED` | Set `true` to enable Ridey by default (admin can override in Editor Settings when DB is available) |
| `OPENAI_MODEL` | Model for Ridey (default `gpt-4o-mini`) |
| `OPENAI_MAX_TOKENS` | Max tokens per Ridey response (default `1500`) |
| `OPENAI_TEMPERATURE` | Ridey temperature (default `0.2`) |
| `RIDEY_RATE_LIMIT_PER_HOUR` | Per-student/IP hourly limit (default `20`) |
| `RIDEY_PERSONA` | Optional extra system prompt text for Ridey |
| `STRIPE_ENABLED` | Set `true` to enable class billing upgrades |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_PRICE_CLASS` | Stripe Price ID for Class tier |
| `STRIPE_PRICE_PRO` | Stripe Price ID for Pro tier |
| `STRIPE_ALLOW_STUDENT_UPGRADES` | Set `true` to allow per-student upgrades |

### Ridey quick setup

Minimum to enable AI help in the flat page editor:

```bash
OPENAI_API_KEY=sk-your-key-here
RIDEY_ENABLED=true
```

Mark `OPENAI_API_KEY` as a **Secret** in Render. After deploy, confirm in **Editor Settings** that Ridey is enabled. Students must be signed in to use **Ask Ridey**.

## 4. After deploy

Your app will be at `https://YOUR-SERVICE.onrender.com`:

- **Editor:** `/index.html` or `/`
- **Admin submissions:** `/admin-submissions.html` (primary admin inbox)
- **Admin assets (Online Assets):** `/admin-common-assets.html`
- **Admin editor settings:** `/admin-snippets.html` (snippets, Ridey, blocked extensions)
- **Admin templates:** `/admin-templates.html` (flat page starter templates)
- **Users & classes:** `/admin-users.html`
- **Billing (if Stripe enabled):** `/admin-billing.html`

> `/admin-dashboard.html` redirects to Submissions.

On first deploy, check **Logs** for PostgreSQL migration, B2 authorization, and CORS messages. If logs show `Database schema already applied`, run migrations locally against the Render database or trigger a deploy after ensuring `db/migrate.js` includes the latest migrations (`editor_features_v1` for snippets, templates, and app settings).

### Student & class setup

1. Sign in to **Users & Classes** (`/admin-users.html`) as admin
2. Create classes and add students (passwords are shown once — use **Download All Passwords (CSV)**)
3. Students sign in at the editor: choose class → name → password
4. Upload shared media on **Assets** (`/admin-common-assets.html`); optional tags help students find files
5. Optional: add **code snippets** and **flat page templates** under **Editor Settings** and **Templates**
6. Optional: set `OPENAI_API_KEY` and enable **Ridey** under **Editor Settings**

### Welcome-screen sample projects (optional)

When `PUBLIC_PLAYGROUND_ENABLED=true` and guest mode is enabled, visitors see curated sample projects on the editor welcome screen.

1. Build a showcase project in the main editor → **Save Template** → choose **bundle** export mode
2. Open **Templates** (`/admin-templates.html`) → **Create combined playground sample** (or edit a flat template)
3. Enable **Show on welcome screen**, set a thumbnail URL, and **Upload bundle** (combined samples)
4. Set on Render: `PUBLIC_PLAYGROUND_ENABLED=true`, `LOCAL_TEST_USER_ENABLED=true`, `LOCAL_TEST_USER_ALLOW_PRODUCTION=true`

Share a direct link: `https://YOUR-SERVICE.onrender.com/?playground=your-template-slug`

For classroom workflows (grading, peek, asset tagging, flat page editor), see [USER_GUIDE.md](USER_GUIDE.md). Planned teacher-specific guides are listed in [DOCS_PLAN.md](DOCS_PLAN.md).

### Stripe billing (optional)

1. Create Products/Prices in [Stripe Dashboard](https://dashboard.stripe.com/)
2. Set `STRIPE_ENABLED=true` and add keys in Render env
3. Add webhook endpoint: `https://YOUR-SERVICE.onrender.com/api/stripe/webhook`
4. For local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

## 5. Notes

- **Free tier** services spin down after inactivity; the first request may take ~30s.
- **PostgreSQL** stores classes, students, submissions metadata, billing, snippets, templates, and editor settings — survives redeploys.
- **Ephemeral disk:** Local `hosted-projects/` resets on redeploy; **re-host** student projects from Submissions after redeploy if you use **Host**. Student ZIPs in B2 and PostgreSQL data persist.
- **Flat editor bundle:** `flat-editor.bundle.js` is committed to the repo. Rebuild with `npm run build:flat-editor` after editing `flat-editor/` sources.
- **HTTPS:** Render provides TLS automatically — use `https://` URLs when sharing links.
