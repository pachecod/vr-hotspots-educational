# VR Hotspots Educational Edition

A comprehensive VR Hotspot Editor with built-in student submission system for educational environments. Students and team members can build **interactive 360° VR tours** and **flat web pages** in one project. New to the tool? Start with the **[User Guide](USER_GUIDE.md)** for step-by-step instructions, watch this **[editing tool walkthrough](https://www.youtube.com/watch?v=Uo-bHKdDRKg)**, browse **[live examples of finished tours](USER_GUIDE.md#live-examples)** built by students, or watch this **[video example of a finished 360 tour](https://www.youtube.com/watch?v=23lqPjQc_IE)**. Teachers: see **[Documentation Plan](DOCS_PLAN.md)** for upcoming classroom guides.

**Current release:** `2.8` (`main` and `2.8` branches on GitHub are aligned).

## 🎓 Educational Features

### For Students:

- **Full VR Editor**: Create immersive 360° experiences with hotspots
- **Flat Web Page Editor**: Build HTML/CSS/JS pages with live preview, code snippets, templates, and optional AI help
- **Student accounts**: Team or class sign-in with admin-managed passwords
- **Personal asset library**: Upload and tag files in **My Assets**; browse teacher **Shared Assets**
- **Easy Submission**: One-click project submission with version history and teacher notes
- **Professional Export**: Generate standalone VR experiences and hosted flat pages

### For Admins / Teachers:

- **Submissions inbox**: Filter by team or class, team member or student, and notes; version history per project
- **Review in Editor**: Load a project, edit, and **Save and Send to Team Member or Student**
- **Host projects**: Publish live preview URLs for sharing
- **Online Assets library**: Upload shared media to Backblaze B2 with tags and stable URLs
- **Editor Settings**: Manage code snippets, enable Ridey AI (**1.0** or **2.0 beta**), and block risky file extensions
- **Starter templates**: Create and publish flat-page templates (including immersive museum starters with visual **config.json** editing)
- **Team member or student Peek**: Browse uploads and submission history from Users or Assets
- **Users & Teams/Classes**: Roster management, password CSV export, reset password
- **Review All Content**: Site-wide content hub for projects, uploads, tours, and orphaned files
- **Optional Stripe billing**: Class plan upgrades with usage quotas (when enabled)

## 🚀 Quick Start

### 1. Setup (One Time)

```bash
# Install dependencies (includes A-Frame for offline support)
npm install

# Start the server (production-style)
npm start

# Local development with hot reload (Vite on :5174, API on :3000)
npm run dev

# Parallel feature branch dev (API :3001, Vite :5174)
npm run dev:feature

# Rebuild the flat page editor bundle after changing flat-editor/ sources
npm run build:flat-editor
```

### 2. Offline Support ✨

- **Complete Offline Operation**: Works without internet connection
- **Local A-Frame**: VR libraries installed locally (no CDN required)
- **Self-Contained**: All assets and dependencies included
- **Perfect for Classrooms**: No internet connectivity required after setup

### 3. Access Points

- **Students / team members**: http://localhost:3000 or open `index.html` directly
- **Admin overview**: http://localhost:3000/admin
- **Admin Submissions**: http://localhost:3000/admin-submissions.html
- **Admin Assets (Online Assets)**: http://localhost:3000/admin-common-assets.html
- **Admin Editor Settings**: http://localhost:3000/admin-snippets.html
- **Admin Templates**: http://localhost:3000/admin-templates.html
- **Admin Users & Classes**: http://localhost:3000/admin-users.html
- **Admin Billing** (optional): http://localhost:3000/admin-billing.html

> `/admin-dashboard.html` redirects to Submissions.

### Local Test User (dev only)

For local demos without student accounts, enable **Test User** mode in `.env`:

```bash
LOCAL_TEST_USER_ENABLED=true
```

Then run `npm run dev` and open the editor. You will see an entry gate:

- **Continue as Guest** — build 360° tours and flat pages locally, pick **local files** (preview + ZIP export), browse **Shared Online Assets**, load a ZIP template, and **Save Template**. No cloud save or submit to admin.
- **Sign in to a team or class account** — full student features if you have a password from your team leader or teacher.

Test User mode is off on production by default. For a **demo/staging** deploy on Render, set both:

```bash
LOCAL_TEST_USER_ENABLED=true
LOCAL_TEST_USER_ALLOW_PRODUCTION=true
```

Guest mode still blocks cloud save, submit, and server uploads.

### Welcome-screen sample projects

Set `PUBLIC_PLAYGROUND_ENABLED=true` (with guest mode and `DATABASE_URL`) to show a **Try a sample project** grid on the welcome screen. Admins curate samples under **Templates** (`/admin-templates.html`):

1. Export a full project ZIP from the main editor (bundle mode)
2. Create a **combined playground sample**, upload the ZIP, enable **Show on welcome screen**, and add a thumbnail URL
3. Flat templates can also appear on the welcome screen when marked playground (no ZIP required)

Direct link: `/?playground=your-template-slug`

### 4. Workflow

1. Admin creates teams or classes and team members or students in **Users**
2. Students sign in and create VR projects or flat web pages in the editor
3. Students click **📤 Submit to Admin** when ready (optional note for teacher)
4. Admin reviews in **Submissions** — download, host, or **Review in Editor** → **Save and Send to Team Member or Student**

## Flat Web Page Editor (2.5+)

Students switch **Editing Tools → 📄 Flat Web Page** to open a full code editor alongside the 360° editor. Spherical and flat content live in the same project — switching modes does not erase the other.

### Student tools

| Feature | Description |
|---------|-------------|
| **Multi-file tabs** | `index.html`, `style.css`, `script.js`, `config.json` (on starter templates), plus optional custom files |
| **Visual / Code config** | When a template includes a config schema, edit `config.json` in a visual form or raw JSON (Code mode) |
| **Live preview** | Split view with **Editor**, **50/50**, and **Preview** layout presets; optional auto-reload (off by default) |
| **Copy / Format** | Copy the active file; auto-format HTML, CSS, or JavaScript |
| **Snippets** | Insert admin-curated code blocks at the cursor |
| **Templates** | Load public starter templates from the gallery (e.g. immersive museum) |
| **Online Assets** | Browse shared or personal media; **Insert Into Page** at the cursor |
| **360° embed** | Generate and embed a hosted copy of the student’s VR tour in flat HTML |
| **Saved pages** | Reload cloud-saved flat pages from **My Assets** |
| **Cloud save & publish** | Save drafts or publish a hosted flat page URL (when signed in) |
| **Ask Ridey / Ask Ridey 2.0** | Optional AI assistant — **1.0** (default) or **2.0 beta** (holistic multi-file editing incl. `config.json`) |

See **[USER_GUIDE.md — Flat Web Page mode](USER_GUIDE.md#flat-web-page-mode)** for the full walkthrough.

### Admin tools

| Page | Purpose |
|------|---------|
| **Editor Settings** | CRUD for snippets; enable Ridey and choose **1.0** or **2.0 (beta)**; manage blocked upload extensions |
| **Templates** | List, create, and edit public/default flat-page starter templates with full editor, Online Assets, and visual **config.json** editing |
| **Overview** (`/admin`) | Links to all admin sections including **Review All Content** |

Requires **PostgreSQL** (`DATABASE_URL`) for snippets, templates, and editor settings persistence on hosted deployments.

## Common Assets (B2 + Render)

Admins can upload shared media to Backblaze B2 and give students stable copy-paste URLs.

### Setup

Add to your `.env`:

```bash
B2_KEY_ID=your_key_id
B2_APP_KEY=your_app_key
B2_BUCKET_NAME=your_bucket_name

# Admin authentication (required for dashboard + asset uploads)
ADMIN_PASSWORD=your_secure_password
ADMIN_SESSION_SECRET=random_long_secret_string

# Optional Ridey AI (flat page editor)
# OPENAI_API_KEY=sk-...
# RIDEY_ENABLED=true
# RIDEY_VERSION=1.0          # or 2.0 for holistic multi-file editing (beta)
# RIDEY_STRICT_VALIDATION=false  # when true + Ridey 2.0, reject invalid JSON server-side

# Optional: public bucket for common assets (auto-created as {B2_BUCKET_NAME}-public)
# B2_PUBLIC_BUCKET_NAME=your-bucket-public
# B2_PUBLIC_BUCKET_ID=
```

Common assets are stored in a **separate public B2 bucket** when your Backblaze account supports it (auto-created as `{B2_BUCKET_NAME}-public`). CORS is applied automatically so browsers can load assets from VR projects and exported scenes.

If Backblaze blocks public buckets (e.g. no payment history on the account), the app falls back to **signed Backblaze download URLs** (7-day expiry, refreshed when you open the asset library). Student project ZIPs always stay in the private bucket.

Run `npm run setup-b2-cors` manually if you need to refresh CORS rules.

### Admin workflow

1. Open `/admin-common-assets.html` and sign in with `ADMIN_PASSWORD`
2. Click **Upload Online Assets**, choose category, optionally add tags, and upload
3. Use the tag filter bar to find assets; **Preview**, **Copy URL**, or **Edit Tags**
4. Use **Peek Into Team Member or Student Assets** to review individual libraries
5. Open **Review & Manage All Content** for a site-wide view of projects, uploads, and orphaned files

### Student workflow

1. In the VR editor, click **Browse Online Assets** (sidebar, hotspot fields, Scene Manager → Edit Media, or flat page **Editing Tools**)
2. Switch **My Assets** / **Shared Assets**; filter by tag chips or filename
3. **Preview**, **Copy**, **Select** (VR hotspots), or **Insert Into Page** (flat web page mode)

Assets live under `common-assets/{category}/` in the public B2 bucket. The `/common-assets/...` app route redirects to the direct B2 URL for backward compatibility.

Direct B2 URLs look like:
`https://f005.backblazeb2.com/file/hotspot-vr/common-assets/images/photo_1234567890.jpg`

These URLs work from exported VR projects, VR headsets, and local testing — not tied to localhost.

## 📁 Project Structure

```
vr_hotspots/
├── index.html                      # Main editor (360° + flat page modes)
├── script.js                       # Spherical editor + CommonAssetsPicker + submissions UI
├── flat-editor/                    # Flat page editor source (React + CodeMirror)
├── flat-editor/configForm/         # Visual config.json editor (ConfigFormPanel, schema helpers)
├── starter-templates/              # Disk-based starter templates (immersive museum, scrollytelling, …)
├── flat-editor.bundle.js           # Built flat editor bundle (commit after npm run build:flat-editor)
├── vr-hotspots-educational.css     # Flat editor styles (built)
├── asset-tags-ui.js / .css         # Tag chips, filter bar, Edit Tags modal
├── asset-preview-modal.js / .css   # Shared asset preview modal
├── admin.html                    # Admin overview (entry hub)
├── admin-submissions.html/js       # Submissions inbox (primary admin)
├── admin-common-assets.html/js     # Online Assets (admin upload + peek + content hub)
├── admin-content-hub.js            # Review All Content (embedded in Assets)
├── admin-snippets.html/js          # Editor Settings (snippets, Ridey, blocked extensions)
├── admin-templates.html/js         # Flat page template list
├── admin-template-editor.html/js   # Full template editor for admins
├── admin-flat-editing-tools.js     # Online Assets sidebar for admin template editor
├── admin-users.html/js             # Users & classes
├── admin-user-peek.js              # Student peek (assets + versions)
├── admin-billing.html/js           # Stripe billing (optional)
├── admin-nav.js / .css             # Shared admin navigation
├── lib/                            # DB helpers (snippets, templates, app settings, …)
├── routes/                         # API route modules (snippets, ridey, templates, …)
├── services/ridey-service.js         # Server-side OpenAI proxy for Ridey
├── RENDER_DEPLOY.md                # Production deployment
├── USER_GUIDE.md                   # End-user guide (students & admins)
├── DOCS_PLAN.md                    # Plan for teacher guides & help docs
├── render.yaml                     # Render blueprint
└── student-projects/               # Local submission storage (dev)
```

## 🎯 Core Features

### VR Editor:

- **Scene Management**: Multiple 360° environments
- **Hotspot Types**: Text, Audio, Text+Audio, Navigation, Weblink Portal (external URL)
- **Style Customization**: Visual theme editor
- **Export System**: Standalone project generation

### Flat Web Page Editor:

- **Dual content modes**: Spherical 360° and flat HTML in one project
- **CodeMirror editing** with syntax highlighting for HTML, CSS, and JavaScript
- **Snippets, templates, formatting, and clipboard tools**
- **Asset insertion** from Online Assets directly into page markup
- **Optional Ridey AI** — admin selects **1.0** (default) or **2.0 beta** (holistic HTML/CSS/JS/`config.json` editing)
- **Visual config editor** for template `config.json` when `config.ui.json` schema is present
- **Admin-managed** snippets, templates, blocked extensions, and Ridey version

### Educational Backend (2.0+):

- **PostgreSQL**: Classes, students, submissions metadata, asset tags, billing, snippets, templates, editor settings
- **Student auth**: Session-based sign-in with admin-managed rosters
- **Submission versioning**: Student notes, admin returns, draft cloud saves
- **B2 storage**: Student projects (private), common assets (public or signed URLs)
- **Admin interface**: Submissions, Assets, Editor Settings, Templates, Users, optional Billing
- **Asset tagging**: Search/filter by tags across student, shared, and peek libraries

## 🛠 Technical Details

### Frontend:

- **A-Frame VR**: WebXR-compatible VR framework (v1.7.1 - local installation)
- **A-Frame Extras**: Additional VR components (v7.6.0 - local installation)
- **Flat editor**: React + CodeMirror bundle (`flat-editor.bundle.js`)
- **Offline Ready**: No CDN dependencies, works without internet
- **Responsive Design**: Works on desktop, mobile, VR headsets
- **LocalStorage**: User preferences and temporary data
- **Export System**: Complete project bundling

### Backend:

- **Node.js/Express**: Lightweight web server
- **PostgreSQL**: Optional but recommended on Render for snippets, templates, and settings
- **OpenAI proxy**: Ridey AI requests (API key server-side only)
- **Multer**: File upload handling
- **JSON Logging**: Simple submission tracking
- **Static Serving**: Hosts the VR editor

## 📖 Documentation

- **[User Guide](USER_GUIDE.md)**: 360° editor, flat web pages, Online Assets, submit/review workflows
- **[Documentation Plan](DOCS_PLAN.md)**: Teacher guides and help docs to write
- **[Quick Start](#-quick-start)**: Local installation and usage
- **[Deploy to Render](RENDER_DEPLOY.md)**: Production hosting, B2, PostgreSQL, Stripe, Ridey
- **[License](LICENSE.md)**: MIT license text

## 🎮 Usage Examples

### Student Workflow:

1. Open http://localhost:3000 and sign in (team or class → name → password)
2. Build a **360° tour** (hotspots, scenes, audio) or switch to **Flat Web Page** for HTML/CSS/JS
3. Use **Browse Online Assets** for shared media; use **Snippets** or **Templates** to get started on flat pages
4. Click **📤 Submit to Admin** with project name and optional note for your teacher

### Admin Workflow:

1. Open **Submissions** (`/admin-submissions.html`)
2. Filter by team or class, team member or student, or notes
3. **Download**, **Host**, **Review in Editor**, or manage version history
4. Upload shared media on **Assets**, manage rosters on **Users**, configure **Editor Settings** and **Templates**

## 🔧 Customization

### For Different Classes:

- Modify submission form fields in `script.js`
- Customize dashboard layout in `admin-dashboard.html`
- Add authentication or grading features
- Integrate with LMS systems
- Create flat-page starter templates under **Templates**

### For Production:

- Deploy with [Deploy to Render](RENDER_DEPLOY.md) (recommended)
- Set B2, admin, database, and optional OpenAI secrets in the host environment (never commit `.env`)

## 🆘 Troubleshooting

### Common Issues:

- **Port 3000 in use**: The server will automatically fall back to the next available port. Check the console to see which port was chosen.
- **Submissions not working**: Check server console for errors
- **Large files failing**: Increase multer file size limits
- **Dashboard not updating**: Refresh browser or check network
- **Ask Ridey missing**: Admin must enable Ridey, set `OPENAI_API_KEY`, and choose version under **Editor Settings** (see [RENDER_DEPLOY.md](RENDER_DEPLOY.md))
- **Ridey 2.0 issues**: Switch back to **Ridey 1.0** in **Editor Settings** for legacy behavior
- **Snippets/templates empty on Render**: Run database migration (`npm run db:migrate`) and ensure `DATABASE_URL` is set

### Support:

1. Check [Quick Start](#-quick-start) and [Deploy to Render](RENDER_DEPLOY.md) for setup and troubleshooting
2. Monitor server console output for error messages
3. Verify all files are present and Node.js is installed
4. Test with small projects first before full deployment

## 🔮 Roadmap

### Shipped in 2.8

- **Inclusive UI terminology** — teams or classes; team members or students (throughout admin and sign-in)
- **Ridey 2.0 (beta)** — admin-selectable; holistic multi-file editing including `config.json`, multi-file preview diffs, JSON apply validation
- **Visual config editor** — Visual/Code toggle for `config.json` on templates with `config.ui.json` schema; live preview updates for transforms
- **Immersive museum starter templates** — `immersive-museum` and `new-immersive-museum` with config-driven exhibits
- **Admin overview** (`/admin`) and **Review All Content** hub on Assets
- **Welcome screen** polish — sample projects grid, MIT license footer, sign-in copy updates
- **`main` branch** aligned with `2.8` for production deploys

### Shipped in 2.5

- **Flat Web Page editor** with live preview and multi-file tabs (HTML, CSS, JS + custom files)
- **Editor toolbar**: Copy, Snippets, Format, Templates, split presets
- **Online Assets → Insert Into Page** in flat mode; 360° tour embed and saved pages in asset library
- **Cloud save & publish** for student flat pages
- **Admin Editor Settings**: Snippets CRUD, Ridey toggle, blocked file extensions
- **Admin template gallery**: Create/edit public starter templates with full editor + Online Assets
- **Ridey 1.0 AI assistant** (optional OpenAI) with multi-file CSS/JS routing

### Shipped in 2.0

- Student accounts and personal **My Assets** library
- PostgreSQL on Render (classes, submissions, tags, billing metadata)
- Submission versioning with student notes and admin review returns
- Online Assets library with tagging and chip-based filter search
- Admin **Peek** (student assets + version history)
- Optional Stripe class billing
- Unified asset preview modal

### Planned

- **Auto-hosting**: Streamlined deploy of student projects to live URLs
- **Grading interface**: Built-in rubrics and scoring
- **Analytics**: Usage tracking and engagement metrics
- **Teacher quick-start guide**: See [DOCS_PLAN.md](DOCS_PLAN.md)

## 🙏 Acknowledgements

Special thanks to Syracuse University graduate [Sagar Gada](https://github.com/sagargada73), who created the first version of this application as a graduate student assistant for Professor Daniel Pacheco, and later as a part-time employee under the National Science Foundation grant for the Innovative Technology Experiences for Students and Teachers (ITEST) project. ([Learn more about that grant here.](https://soe.syr.edu/professor-huangs-nsf-grant/)). Special shoutout of thanks to Syracuse University School of Education Professor Silvie Huang (PI); and co-PIs Professor Sharon Dotger, of the School of Education; Professor Brice Nordquist of the College of Arts and Sciences; Professors Nicholas Bowman and Daniel Pacheco of the S.I. Newhouse School of Public Communications; and Professors Matthew Potteiger and Stewart Diemontof the SUNY College of Environmental Science and Forestry. Finally, thanks to all participants in that project, especially other faculty, students, community volunteers, and especially the youth who used the early tools and provided feedback.

## 📜 License

MIT License

Copyright 2026 Dan Pacheco <https://danpacheco.com/>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

See [LICENSE.md](LICENSE.md) for the canonical license file.

---

**Ready to start?** Use [Quick Start](#-quick-start) for local setup, or follow the [Render Deploy Guide](RENDER_DEPLOY.md) for production deployment.
