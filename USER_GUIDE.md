# VR Hotspots — User Guide

This guide is for **students, teachers, and admins** using the VR Hotspot Editor. For installation and hosting, see the [README](README.md) and [Deploy to Render](RENDER_DEPLOY.md).

---

## What you can build

The editor lets you create **interactive 360° VR stories** — like a virtual tour with clickable hotspots. You can:

- Stand inside a **360° photo or video** scene
- Add **hotspots** that show text, play audio, display images or 3D models, link to websites, or move the viewer to another scene
- Combine **multiple scenes** into one project
- **Export** a standalone project (ZIP) or **submit** it to an admin for grading

### Live examples

Browse these finished tours for inspiration:

| Tour | Description |
|------|-------------|
| [Agriquest Seeds of Story Tour #1](https://agriquest.org/tours/student5/) | Sample tour from the Agriquest Seeds of Story program. |
| [Salt City Harvest Farm](https://agriquest.org/tours/student7/) | This tour of the Salt City Harvest Farm was created by a youth participant of the NSF project this tool was initially created to support. |
| [Agriquest Seeds of Story Tour #2](https://agriquest.org/tours/student7/) | Another student's tour explaining what they did during their summer planting project. |

Works in a desktop browser, on phones and tablets, and in VR headsets that support WebXR.

---

## Opening the editor

Your instructor or admin will give you a URL. Common examples:

| Role | Page |
|------|------|
| **Student (editor)** | `/` or `/index.html` |
| **Admin (submissions)** | `/admin-dashboard.html` |
| **Admin (shared assets)** | `/admin-common-assets.html` |

If you are running locally, that is usually `http://localhost:3000`.

---

## Editor layout

- **Center:** the 360° scene you are editing or previewing
- **Top left:** **Edit Mode** panel — switch between editing and preview/navigation
- **Right side:** **Editor Tools** panel — scenes, hotspots, sounds, export, and submit
- **ℹ️ icon** next to “Hotspot Editor” — collapsible instructions that update based on your current mode

Use the chevron tabs on the left and right panels to collapse them when you need more room on screen.

---

## Edit Mode vs Navigation Mode

### Edit Mode (🛠️ ON)

Use this while **building** your project:

1. Choose a **hotspot type**
2. Fill in content (text, audio, link, etc.) Note: If the admin for your installation has uploaded common assets for you in the admin tools, you can simply select them rather than uploading yourself. Any asset you add yourself to your scene (versus what you choose from common assets) remains on your local computer or tablet unless you submit to admin.
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

1. Open **Scene Management** in the right panel.
2. Click **Add Scene** and give it a name
3. Choose a **360° image**, **360° video** (upload or URL), or pick from **Browse Shared Assets** if your class uses a shared library. Users are advised to not use very long videos, as that will greatly increase the download time and/or hosting costs for final tours created.
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
| **Image** | Shows a flat image in the scene (scale with the size slider) |
| **3D Model** | Places a GLB/GLTF model (adjust scale, rotation, and height) |

### Tips for all hotspots

- **Browse Shared Assets** (in Hotspot Properties or the Common Assets section) lets you pick files your instructor uploaded to a shared library
- You can use **uploaded files** or **URLs** for media
- After placing a hotspot, find it under **Existing Hotspots** — click to select, then **Edit** or **Delete**
- **Clear All** removes every hotspot in the current scene; **Clear Data** resets broader saved data (use carefully)

---

## Global Scene Sound

Each scene can have **ambient background audio** (birds, music, room tone):

1. Open **Global Scene Sound**
2. Turn scene audio **ON**
3. Upload a file or paste an audio URL
4. Adjust volume if needed

This is separate from **Audio** hotspots, which play only when clicked.

---

## Shared assets (Common Assets)

If your class uses the shared library:

1. Click **Browse Shared Assets** in the editor sidebar
2. Browse by category (images, audio, 360 videos, 3D, etc.)
3. **Copy** a URL or click **Use URL** to drop it into the field you are editing

Your instructor manages uploads at `/admin-common-assets.html`.

---

## Visual customization

Click **🎨 Customize Styles** to open the style editor. You can change colors, fonts, and hotspot appearance with a live preview. Save when you are happy with the look — styles are included in exported projects.

---

## Save and load your work

The editor **auto-saves** progress in your browser. For a portable backup:

### Save Template

1. Enter a **Template Name**
2. Click **Save Template**
3. Choose an export mode (see below)
4. Your browser downloads a **ZIP file** containing a complete standalone project

### Load Template

1. Click **Load Template**
2. Select a previously saved ZIP to restore the project in the editor

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
2. Enter your **Project Name** (use the name your instructor asked for — e.g. include your name or class section if required)
3. Choose **Include media** or **Keep online URLs**
4. Wait for the upload to finish — do not close the tab until you see success

The admin receives a ZIP of your full project on the dashboard.

**Note:** Submitting requires the server to be running and configured (your instructor’s hosted URL or local class server). Opening `index.html` alone from your hard drive cannot submit.

---

## Admin: review submissions

1. Open **Admin Dashboard** (`/admin-dashboard.html`)
2. Sign in if prompted
3. View the list of student submissions (name, project, date)
4. **Download** a ZIP for any submission
5. Unzip and open **`index.html`** in a browser to experience the student’s VR project

---

## Admin: shared asset library

1. Open **Common Assets** (`/admin-common-assets.html`)
2. Sign in with the admin password
3. Upload files by category (images, audio, 360 videos, 3D models, etc.)
4. **Copy URL** and share with students, or let them use **Browse Shared Assets** in the editor

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
| **Lost work** | Use **Save Template** often. Avoid **Clear Data** unless you mean to reset. |

---

## Getting help

- In-editor instructions: **ℹ️** next to “Hotspot Editor”
- Setup and deployment: [README](README.md)
- Hosting for your class: [RENDER_DEPLOY.md](RENDER_DEPLOY.md)
