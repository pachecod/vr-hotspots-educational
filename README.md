# VR Hotspots Educational Edition

A comprehensive VR Hotspot Editor with built-in student submission system for educational environments. New to the tool? Start with the **[User Guide](USER_GUIDE.md)** for step-by-step instructions — and browse **[live examples of finished tours](USER_GUIDE.md#live-examples)** built by students. Teachers: see **[Documentation Plan](DOCS_PLAN.md)** for upcoming classroom guides.

## 🎓 Educational Features

### For Students:

- **Full VR Editor**: Create immersive 360° experiences with hotspots
- **Student accounts**: Class-based sign-in with teacher-managed passwords
- **Personal asset library**: Upload and tag files in **My Assets**; browse teacher **Shared Assets**
- **Easy Submission**: One-click project submission with version history and teacher notes
- **Professional Export**: Generate standalone VR experiences

### For Admins / Teachers:

- **Submissions inbox**: Filter by class, student, and notes; version history per project
- **Review in Editor**: Load a student project, edit, and **Save and Send** feedback
- **Host projects**: Publish live preview URLs for sharing
- **Online Assets library**: Upload shared media to Backblaze B2 with tags and stable URLs
- **Student Peek**: Browse a student’s uploads and submission history from Users or Assets
- **Users & Classes**: Roster management, password CSV export, reset password
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
```

### 2. Offline Support ✨

- **Complete Offline Operation**: Works without internet connection
- **Local A-Frame**: VR libraries installed locally (no CDN required)
- **Self-Contained**: All assets and dependencies included
- **Perfect for Classrooms**: No internet connectivity required after setup

### 3. Access Points

- **Students**: http://localhost:3000 or open `index.html` directly
- **Admin Submissions**: http://localhost:3000/admin-submissions.html
- **Admin Assets (Online Assets)**: http://localhost:3000/admin-common-assets.html
- **Admin Users & Classes**: http://localhost:3000/admin-users.html
- **Admin Billing** (optional): http://localhost:3000/admin-billing.html

> `/admin-dashboard.html` redirects to Submissions.

### 4. Workflow

1. Admin creates classes and students in **Users & Classes**
2. Students sign in and create VR projects in the editor
3. Students click **📤 Submit to Admin** when ready (optional note for teacher)
4. Admin reviews in **Submissions** — download, host, or **Review in Editor** → **Save and Send to Student**

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
4. Use **Peek Into Student Assets** to review individual student libraries

### Student workflow

1. In the VR editor, click **Browse Online Assets** (sidebar, hotspot fields, or Scene Manager → Edit Media)
2. Switch **My Assets** / **Shared Assets**; filter by tag chips or filename
3. **Preview**, **Copy**, or **Select** to use media in your project

Assets live under `common-assets/{category}/` in the public B2 bucket. The `/common-assets/...` app route redirects to the direct B2 URL for backward compatibility.

Direct B2 URLs look like:
`https://f005.backblazeb2.com/file/hotspot-vr/common-assets/images/photo_1234567890.jpg`

These URLs work from exported VR projects, VR headsets, and local testing — not tied to localhost.

## 📁 Project Structure

```
vr_hotspots/
├── index.html                      # Main VR editor
├── script.js                       # Editor + CommonAssetsPicker + submissions UI
├── asset-tags-ui.js / .css         # Tag chips, filter bar, Edit Tags modal
├── asset-preview-modal.js / .css   # Shared asset preview modal
├── simple-server.js                # Express backend
├── admin-submissions.html/js       # Submissions inbox (primary admin)
├── admin-common-assets.html/js     # Online Assets (admin upload + peek)
├── admin-users.html/js             # Users & classes
├── admin-user-peek.js              # Student peek (assets + versions)
├── admin-billing.html/js           # Stripe billing (optional)
├── admin-nav.js / .css             # Shared admin navigation
├── lib/asset-tags.js               # Tag normalization + DB queries
├── routes/                         # API route modules
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

### Educational Backend (2.0):

- **PostgreSQL**: Classes, students, submissions metadata, asset tags, billing
- **Student auth**: Session-based sign-in with admin-managed rosters
- **Submission versioning**: Student notes, admin returns, draft cloud saves
- **B2 storage**: Student projects (private), common assets (public or signed URLs)
- **Admin interface**: Submissions, Assets, Users, optional Billing
- **Asset tagging**: Search/filter by tags across student, shared, and peek libraries

## 🛠 Technical Details

### Frontend:

- **A-Frame VR**: WebXR-compatible VR framework (v1.7.1 - local installation)
- **A-Frame Extras**: Additional VR components (v7.6.0 - local installation)
- **Offline Ready**: No CDN dependencies, works without internet
- **Responsive Design**: Works on desktop, mobile, VR headsets
- **LocalStorage**: User preferences and temporary data
- **Export System**: Complete project bundling

### Backend:

- **Node.js/Express**: Lightweight web server
- **Multer**: File upload handling
- **JSON Logging**: Simple submission tracking
- **Static Serving**: Hosts the VR editor

## 📖 Documentation

- **[User Guide](USER_GUIDE.md)**: Editor, Online Assets, submit/review workflows
- **[Documentation Plan](DOCS_PLAN.md)**: Teacher guides and help docs to write
- **[Quick Start](#-quick-start)**: Local installation and usage
- **[Deploy to Render](RENDER_DEPLOY.md)**: Production hosting, B2, PostgreSQL, Stripe
- **[License](LICENSE.md)**: MIT license text

## 🎮 Usage Examples

### Student Workflow:

1. Open http://localhost:3000 and sign in (class → name → password)
2. Create hotspots by selecting type and clicking on the 360° scene
3. Add scenes, audio, and customize styles; use **Browse Online Assets** for shared media
4. Click **📤 Submit to Admin** with project name and optional note for your teacher

### Admin Workflow:

1. Open **Submissions** (`/admin-submissions.html`)
2. Filter by class, student, or notes
3. **Download**, **Host**, **Review in Editor**, or manage version history
4. Upload shared media and manage rosters on **Assets** and **Users** pages

## 🔧 Customization

### For Different Classes:

- Modify submission form fields in `script.js`
- Customize dashboard layout in `admin-dashboard.html`
- Add authentication or grading features
- Integrate with LMS systems

### For Production:

- Deploy with [Deploy to Render](RENDER_DEPLOY.md) (recommended)
- Set B2 and admin secrets in the host environment (never commit `.env`)

## 🆘 Troubleshooting

### Common Issues:

- **Port 3000 in use**: The server will automatically fall back to the next available port. Check the console to see which port was chosen.
- **Submissions not working**: Check server console for errors
- **Large files failing**: Increase multer file size limits
- **Dashboard not updating**: Refresh browser or check network

### Support:

1. Check [Quick Start](#-quick-start) and [Deploy to Render](RENDER_DEPLOY.md) for setup and troubleshooting
2. Monitor server console output for error messages
3. Verify all files are present and Node.js is installed
4. Test with small projects first before full deployment

## 🔮 Roadmap

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
