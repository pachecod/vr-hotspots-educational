# VR Hotspots — User Guide

This guide is for **students, teachers, and admins** using the VR Hotspot Editor. For installation and hosting, see the [README](README.md) and [Deploy to Render](RENDER_DEPLOY.md).

Teachers looking for classroom setup, grading workflows, and admin how-tos should also see the **[Documentation Plan](DOCS_PLAN.md)** — dedicated teacher guides are listed there and will be added over time.

---

## What you can build

The editor lets you create **interactive 360° VR stories** and **flat web pages** in the same project — like a virtual tour with clickable hotspots, or a standalone HTML/CSS/JS page with live preview. You can:

- Stand inside a **360° photo or video** scene and add **hotspots** (text, audio, images, 3D models, links, navigation)
- Switch to **Flat Web Page** mode and code **HTML, CSS, and JavaScript** with a live preview, snippets, templates, and optional AI help
- Combine **multiple scenes** into one VR project, or **embed your 360° tour** inside a flat page
- **Export** a standalone project (ZIP) or **submit** it to an admin for grading

### Live examples

Browse these finished tours for inspiration:

| Tour | Description |
|------|-------------|
| [Agriquest Seeds of Story Tour #1](https://agriquest.org/tours/student5/) | Sample tour from the Agriquest Seeds of Story program that this tool was originally created to support. The tour was built by a youth participant of project. |
| [Agriquest Seeds of Story Tour #2](https://agriquest.org/tours/student7/) | Another student tour of the Salt City Harvest Farm project. |
| [Video example of a finished 360 tour](https://www.youtube.com/watch?v=23lqPjQc_IE) | YouTube walkthrough showing what a completed 360 tour experience can look like. |

Works in a desktop browser, on phones and tablets, and in VR headsets that support WebXR.

---

## Opening the editor

Your instructor or admin will give you a URL. Common examples:

| Role | Page |
|------|------|
| **Student (editor)** | `/` or `/index.html` |
| **Admin (submissions)** | `/admin-submissions.html` |
| **Admin (online assets)** | `/admin-common-assets.html` |
| **Admin (editor settings)** | `/admin-snippets.html` |
| **Admin (flat page templates)** | `/admin-templates.html` |
| **Admin (users & classes)** | `/admin-users.html` |
| **Admin (billing)** | `/admin-billing.html` (when Stripe is enabled) |

All admin pages share a top nav: **Overview · Submissions · Assets · Editor Settings · Templates · Users · Logout** (Billing appears when Stripe is enabled).

If you are running locally, that is usually `http://localhost:3000` (or `http://localhost:5174` when using the Vite dev server with `npm run dev`).

> **Note:** `/admin-dashboard.html` redirects to the Submissions page.

---

## Signing in as a student

When your instructor has enabled student accounts:

1. Open the editor — a sign-in screen appears
2. **Choose your class** from the list
3. **Choose your name** from that class
4. Enter the **password** your teacher gave you

After sign-in, a **session bar** at the top of the editor tools panel shows your name and class, with **Logout** and **My Submissions**.

You can:

- Use **My Assets** in the Asset Library to upload files, add tags, and reuse your own media
- **Submit** projects tied to your account (not just a free-text project name)
- Open **My Submissions** to see version history, teacher feedback, and unread return badges
- **Save to Cloud** drafts without notifying the teacher (submit when ready)

Ask your teacher to reset your password from **Users & Classes** if you forget it.

---

## Editor layout

- **Center:** the 360° scene (spherical mode) or the flat page code editor with live preview (flat mode)
- **Top left:** **Edit Mode** panel — switch between editing and preview/navigation (spherical mode only)
- **Right side:** **Editing Tools** panel — content mode toggle, scenes, hotspots, Online Assets, export, and submit
- **ℹ️ icon** next to “Hotspot Editor” — collapsible instructions that update based on your current mode

In **Flat Web Page** mode, spherical-only sections hide automatically. The flat editor fills the main area; **Editing Tools** stays open for Online Assets and related actions.

Use the chevron tabs on the left and right panels to collapse them when you need more room on screen.

### Content mode (Spherical vs Flat)

At the top of **Editing Tools**, choose:

| Mode | Use for |
|------|---------|
| **🌐 Spherical Content** | 360° scenes, hotspots, navigation portals |
| **📄 Flat Web Page** | HTML/CSS/JS coding with live preview |

Both modes share the same project. Switching modes does **not** delete your work in the other mode.

---

## Edit Mode vs Navigation Mode

### Edit Mode (🛠️ ON)

Use this while **building** your project:

1. Choose a **hotspot type**
2. Fill in content (text, audio, link, etc.). If your teacher uploaded **Online Assets**, you can pick those instead of uploading yourself. Files you add only on your device stay local until you submit to admin.
3. Click **Add Hotspot**, then **click on the scene** where it should appear
4. Use **Edit** (📝) or **Move** (📍) on existing hotspots in the list

### Navigation Mode (🧭 ON)

Use this to **preview** what viewers will experience:

- Look around with mouse, touch, or a VR headset
- Click **navigation portals** (🚪) to jump between scenes
- Click text, audio, image, and weblink hotspots as a viewer would

Switch modes with the toggle in the **top-left Edit Mode** panel.

---

## Scenes

A **scene** is one 360° environment — either a **photo** or a **360° video**.

### Add or change a scene

1. Open **Scene Management** in the right panel and click **Manage** to open the **Scene Manager**.
2. Click **Add Scene** and give it a name.
3. Choose a **360° image**, **360° video** (upload or URL), or click **Edit Media** → **Browse Online Assets** to pick from your library. Avoid very long videos — they increase download time and hosting cost.
4. Use the **Current Scene** dropdown to switch between scenes while editing.

### Starting view

- **Set Starting Point** saves where the viewer looks when the scene loads (rotate the view first, then click the button)
- **Clear Starting Point** removes a custom start
- The **first scene in your project** is the starting scene when you export or submit

### 360° video scenes

When a scene uses video, playback controls appear at the bottom of the screen. On some mobile devices you may need to tap the page once to start video/audio.

---

## Hotspot types

Select a type under **Hotspot Type**, fill in the fields that appear, then **Add Hotspot** and click the scene to place it.

| Type | What it does |
|------|----------------|
| **Text** | Popup with readable text |
| **Audio** | Plays a sound when clicked (upload a file or paste a URL) |
| **Text + Audio** | Popup text and audio together |
| **Navigation** | Portal to **another scene** in your project (you need at least two scenes) |
| **Weblink Portal** | Opens an external website (optional preview image inside the ring) |
| **Image / Video** | Shows a flat photo or video billboard in the scene (scale with the size slider) |
| **3D Model** | Places a GLB/GLTF model (adjust scale, rotation, and height) |

### Tips for all hotspots

- **Browse Online Assets** appears in Hotspot Properties, Global Scene Sound, the **Online Assets** section, and **Scene Manager → Edit Media**
- When opened from a media field, the library auto-selects a sensible category (e.g. audio for Audio hotspots)
- After choosing **Select**, the editor may prompt you to click the scene to place the hotspot
- You can use **uploaded files** or **URLs** for media
- After placing a hotspot, find it under **Existing Hotspots** — click to select, then **Edit** or **Delete**
- **Clear All** removes every hotspot in the current scene; **Clear Data** resets broader saved data (use carefully)

---

## Global Scene Sound

Each scene can have **ambient background audio** (birds, music, room tone):

1. Open **Global Scene Sound**
2. Turn scene audio **ON**
3. Upload a file or paste an audio URL (or use **Browse Online Assets**)
4. Adjust volume if needed

This is separate from **Audio** hotspots, which play only when clicked.

---

## Flat Web Page mode

Switch to **📄 Flat Web Page** in **Editing Tools** to open the code editor. You get a **multi-file project** with a **live preview** pane.

### File tabs

Every flat page includes three core files:

| Tab | Purpose |
|-----|---------|
| **index.html** | Page structure and content |
| **style.css** | Styles (linked from HTML) |
| **script.js** | JavaScript (linked from HTML) |

Click **+** to add custom files (for example `extra.css` or `utils.js`). Core files cannot be removed. Your instructor may block certain file extensions (such as `.exe`) from uploads and custom files.

### Editor toolbar (per file)

Above the code area:

| Button | What it does |
|--------|----------------|
| **Copy** | Copy the active file to the clipboard |
| **Snippets** | Open the snippet library and insert code at the cursor |
| **Format** | Auto-format the active HTML, CSS, or JavaScript file |
| **Templates** | Browse and load admin-published starter templates |
| **Ask Ridey** | Open the AI assistant (only when enabled by your instructor) |

### Live preview layout

The preview pane shows your page as you edit. Use the layout buttons:

| Preset | Layout |
|--------|--------|
| **Editor** | Mostly code, small preview |
| **50/50** | Balanced split (default) |
| **Preview** | Mostly preview, small code |

Click **↻ Refresh** if the preview looks out of date.

### Snippets

1. Click **Snippets** in the toolbar
2. Browse snippets grouped by language (HTML, CSS, JavaScript)
3. Click a snippet to **insert it at your cursor** in the active file

Snippets are managed by your instructor on **Editor Settings**.

### Templates

1. Click **Templates** in the toolbar
2. Browse public starter templates (title and description)
3. Load one to replace your current flat page files with the template contents

Templates are created by admins on the **Templates** admin page.

### Online Assets in flat mode

In **Editing Tools → Online Assets**, click **Browse Online Assets**. In flat mode you also get:

| Tab / action | What it does |
|--------------|----------------|
| **360 VR Tour** | Generate a hosted copy of your spherical project and embed it in HTML |
| **My Saved Pages** | Reload flat pages you saved to the cloud |
| Category tabs | Images, video, audio, 3D, etc. |
| **Insert Into Page** | Insert markup for the selected asset at the cursor (flat mode only) |

CSS and JS from Ridey or manual edits should go in **style.css** and **script.js**, not inline in HTML.

### Cloud save and publish

When signed in, the flat toolbar shows:

| Button | What it does |
|--------|----------------|
| **☁️ Save to Cloud** | Save a draft flat page to your account (does not notify your teacher) |
| **🌐 Publish** | Publish a hosted URL for your flat page |

Saved pages appear under **My Assets → My Saved Pages** in the asset library.

### Ask Ridey (AI assistant)

When your instructor enables Ridey and the server is configured:

1. Click **Ask Ridey** in the toolbar
2. Type a question or use a quick prompt (**Find bugs**, **Optimize**, **Add features**, **Improve quality**)
3. Review Ridey’s explanation and **Preview Changes**
4. **Apply Changes** to update your project files

Ridey sees your **full project** (HTML, CSS, and JS). Styling changes go into **style.css**; script changes go into **script.js**; HTML stays structural. You must be **signed in** as a student to use Ridey. Requests are rate-limited per hour.

If **Ask Ridey** does not appear, your instructor has not enabled it or the server API key is not configured.

---

## Online Assets (Asset Library)

Open the library from **Browse Online Assets** in the editor sidebar, hotspot media fields, **Scene Manager → Edit Media**, or while editing a **Flat Web Page**.

### My Assets vs Shared Assets

| Tab | Who uploads | Tags |
|-----|-------------|------|
| **My Assets** | You (when signed in) | Add on upload or via **Edit Tags** |
| **Shared Assets** | Your teacher/admin | Managed on the admin Assets page |

### Finding files

1. Pick a **category tab** (Flat Images, 360 Photos, 360 Videos, Audio, 3D, Other — plus **360 VR Tour** and **My Saved Pages** when signed in during flat page editing).
2. Use the **filter bar** at the top:
   - Type a **filename** in the input to filter by name
   - Press **Enter** or **comma** to add **tag chips** (tags filter assets — any matching tag counts)
   - Click **Recent** tag pills or **Show All Tags** to add tags as chips
   - Remove a chip with **×**; **Backspace** in an empty input removes the last chip
3. Browse the grid below.

### Actions on each asset

| Button | What it does |
|--------|----------------|
| **Preview** | Full-size preview; prev/next through filtered list; 3D models support orbit/pan controls |
| **Copy** | Copy the asset URL to the clipboard |
| **Select** | Fill the field you opened the library from; you may be prompted to click the scene to place a hotspot |
| **Insert Into Page** | *(Flat Web Page mode)* Insert asset markup at the cursor in your HTML |
| **Edit Tags** | (My Assets only) Change tags on your file |
| **Delete** | (My Assets only) Remove your upload |

### Uploading to My Assets

When signed in, the **Upload to My Assets** section lets you choose a file and optional **comma-separated tags**, then upload. Tags help you find files later with the filter bar.

Your instructor manages **Shared Assets** at `/admin-common-assets.html`.

---

## Visual customization

Click **🎨 Customize Styles** to open the style editor. You can change colors, fonts, and hotspot appearance with a live preview. Save when you are happy with the look — styles are included in exported projects.

---

## Save and load your work

The editor **auto-saves** progress in your browser (both spherical and flat content). For a portable backup:

### Save Template (360° export ZIP)

1. Enter a **Template Name** in **Editing Tools**
2. Click **Save Template**
3. Choose an export mode (see below)
4. Your browser downloads a **ZIP file** containing a complete standalone project

This ZIP includes both your 360° scenes and flat page files when present.

### Load Template (360° export ZIP)

1. Click **Load Template**
2. Select a previously saved ZIP to restore the project in the editor

For flat page **starter templates** published by your instructor, use **Templates** in the flat editor toolbar instead.

---

## Export modes (Save Template & Submit)

When you save or submit, you choose how media is packaged:

| Option | Best for |
|--------|----------|
| **Include media in the package** | Offline viewing, sharing a USB drive, or when URLs might expire. Downloads images, audio, video, and models into the ZIP. **Larger file.** |
| **Keep online URLs** | Smaller ZIP when media already lives online (shared library, hosted links). Viewers need **internet** when opening the project. |

Files you uploaded only in your browser are **always included** so the export does not break.

---

## Submit to Admin (students)

When your project is ready:

1. Click **📤 Submit to Admin**
2. Enter your **Project Name** (use the name your instructor asked for)
3. Optionally add a **note for your teacher** (questions, context, or what you want feedback on)
4. Choose **Include media** or **Keep online URLs**
5. Wait for the upload to finish — do not close the tab until you see success

Each submit creates a **new version**. You can keep editing and submit again; earlier versions stay on the server.

### My Submissions

Open **My Submissions** from the session bar to:

- See all projects and version history (Submitted, Draft, Teacher feedback)
- Download any version
- **Open in Editor** — including teacher-returned versions with feedback
- Read teacher notes; an **unread badge** appears when new feedback arrives

**Save to Cloud** (under Template) saves a draft to your account without appearing in the teacher inbox until you submit.

**Note:** Submitting requires the server to be running and configured (your instructor’s hosted URL or local class server). Opening `index.html` alone from your hard drive cannot submit.

---

## Admin: review submissions

Sign in at `/admin-submissions.html` (or any admin page — same password).

### Submissions inbox

1. Filter by **class**, **student**, or whether the student left a **note**
2. For each submission:
   - **Download** — get the ZIP
   - **🌐 Host** — publish a live preview URL (re-host after server redeploy if using ephemeral disk — see [RENDER_DEPLOY.md](RENDER_DEPLOY.md))
   - **✏️ Review in Editor** — load the project in the editor with an **Admin Review** bar
   - **Version history** — expand to see all versions; download, review, or delete individual versions
   - **🗑️ Delete** — remove a specific version

### Import project ZIP

Use **Import Project ZIP** at the top to upload a backup or locally exported project into the submissions system.

### Review in Editor and return feedback

1. Click **Review in Editor** (from Submissions or from **Peek** — see below)
2. The student’s project loads; an **Admin Review** bar shows student info and any student note
3. Make edits as needed
4. Click **Save and Send to Student**, add an optional feedback note, and confirm

This creates a new **admin return** version. The student’s original ZIP is never overwritten. The student sees the feedback in **My Submissions** and can open your returned version in the editor.

---

## Admin: online assets

Open **Assets** (`/admin-common-assets.html`).

1. Sign in with the admin password
2. Click **Upload Online Assets** to expand the upload zone (drag-and-drop or browse)
3. Choose the active **category tab**, optionally add **comma-separated tags**, and upload

Upload limits: Flat images 10MB, 360 photos 50MB, 360 videos 200MB, Audio 50MB, 3D 100MB, Other 25MB.

### Managing assets

- **Preview** — full-size preview with navigation between assets in the current filter
- **Copy URL** — direct link for sharing or testing
- **Edit Tags** — update tags on shared assets
- **Delete** — remove the file

### Finding assets

Use the same **tag filter bar** as students: filename text, tag chips, **Recent** pills, and **Show All Tags**.

### Peek into a student’s library

Use the **Peek Into Student Assets and Submissions** dropdown to open a student’s assets, submissions, and version history without leaving the Assets page. **Back to Online Assets** returns you here; from **Users**, peek opens with **Back to Users**.

---

## Admin: editor settings

Open **Editor Settings** (`/admin-snippets.html`).

### Ridey AI assistant

1. Ensure `OPENAI_API_KEY` is set in your server environment (see [RENDER_DEPLOY.md](RENDER_DEPLOY.md))
2. Toggle **Enable Ridey for students**
3. Students see **Ask Ridey** in the flat page toolbar when enabled and the API key is present

Optional environment variables: `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_TEMPERATURE`, `RIDEY_RATE_LIMIT_PER_HOUR`, `RIDEY_PERSONA`.

### Blocked file extensions

Add extensions (without the dot) that students cannot upload or add as custom flat-page files — for example `exe`, `bat`, `sh`. Click **Save Blocked Extensions**.

### Code snippets

1. Enter a **Title**, **Language** (html, css, javascript), and **Code**
2. Click **Add Snippet**
3. Edit or delete existing snippets from the list below

Snippets appear in the student flat editor **Snippets** modal. Requires PostgreSQL on hosted deployments.

---

## Admin: flat page templates

Open **Templates** (`/admin-templates.html`).

1. Click **+ Create with Editor** or **Edit in Editor** on an existing template
2. Use the full flat page editor (HTML/CSS/JS tabs, live preview, **Editing Tools → Browse Online Assets**)
3. Set **title**, **description**, **Public**, and optional **Default starter**
4. Click **Save Template**

Students load public templates from **Templates** in the flat editor toolbar. Mark one template as **Default starter** for new empty projects when configured.

Requires PostgreSQL (`DATABASE_URL`) on hosted deployments.

---

## Admin: users & classes

Open **Users** (`/admin-users.html`).

1. Create **classes** and add **students** (username and password are generated)
2. **Download All Passwords (CSV)** — passwords are stored on the server for later export
3. **Reset Password** — for individual students
4. **Peek** — view that student’s assets and submission history

When Stripe billing is enabled, a link to **Class billing & usage** appears on this page.

---

## Admin: student Peek

From **Users → Peek** or **Assets → student dropdown**, you can:

- Browse the student’s uploaded assets by category (with tag/filename search)
- **Preview**, **Copy URL**, or **Delete** student files
- View **Projects & saves** — version table with Submitted / Draft / Teacher feedback badges
- **Download** or **Review** any version in the editor

---

## Viewing a finished project

Whether you exported a ZIP yourself or downloaded a submission:

1. Unzip the folder
2. Open **`index.html`** in Chrome, Edge, Safari, or Firefox
3. Look around and click hotspots
4. For VR headsets, use the browser’s **Enter VR** button if available

If media was exported as **online URLs**, stay connected to the internet. If media was **bundled**, the project works offline.

---

## Quick troubleshooting

| Problem | Things to try |
|---------|----------------|
| **Can’t place hotspots** | Turn **Edit Mode ON** (top left). Select a hotspot type and click **Add Hotspot** first. |
| **Navigation portal doesn’t work** | Add at least one other scene and set the portal’s target scene. Preview in **Navigation Mode**. |
| **Audio doesn’t play** | Click the hotspot (browsers often block autoplay). Check that the file is not empty and the URL still works. |
| **360° video won’t start (phone/tablet)** | Tap the page once after load; check Wi‑Fi if using a URL. |
| **Submit failed** | Confirm you are on the instructor’s server URL, not a local file. Retry; ask admin to check the server. |
| **Shared asset URL broken** | Ask admin to re-open the asset library (signed links may expire after several days). Re-export with **Include media in the package** for long-term archives. |
| **Can’t find an asset** | Add tag chips or type part of the filename in the filter bar; try **Show All Tags**. |
| **Hosted project link dead after redeploy** | Admin must **Host** again — hosted URLs on ephemeral disk do not survive redeploy. |
| **Lost work** | Use **Save Template** often. Avoid **Clear Data** unless you mean to reset. |
| **Ask Ridey missing** | Instructor must enable Ridey under **Editor Settings** and set `OPENAI_API_KEY` on the server. |
| **Ridey put CSS inline** | Update to latest version — Ridey routes CSS to `style.css` and JS to `script.js`. |
| **Snippets or templates empty** | Admin needs PostgreSQL and `npm run db:migrate` on the server. |

---

## Getting help

- In-editor instructions: **ℹ️** next to “Hotspot Editor”
- Setup and deployment: [README](README.md)
- Hosting for your class: [RENDER_DEPLOY.md](RENDER_DEPLOY.md)
- Planned teacher guides and help docs: [DOCS_PLAN.md](DOCS_PLAN.md)
