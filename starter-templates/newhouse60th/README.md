# Newhouse 60th Anniversary — Combined Playground Sample

360° **video** tour (4 scenes) plus a flat landing page. Use this as a **Combined** playground template for guest mode on the welcome screen.

## What's inside

| Path | Purpose |
|------|---------|
| `config.json` | Scenes, hotspots, flat page snapshot, styles |
| `index.html`, `script.js`, `style.css` | A-Frame 360° viewer (Spherical editor) |
| `images/` | Panorama poster, hotspot image, UI icons |
| `videos/` | 360° video for each scene (~44 MB total) |
| `audio/` | Optional background audio |
| `flat-pages/main/` | Flat web page (Web editor) |

**Spherical content:** four linked 360° video scenes with navigation hotspots and a photo/text hotspot on the patio scene.

**Flat content:** Syracuse-themed landing page with a featured photo and embedded 360° viewer.

## Before you zip

1. If you edit files under `flat-pages/main/`, sync them into `config.json`:

   ```bash
   node sync-flat-pages-into-config.js
   ```

2. Build the ZIP from **inside** this folder (so `config.json` is at the zip root):

   ```bash
   ./package-playground-bundle.sh
   ```

   This runs sync + validation (fails if any `/hosted/` or absolute tour URLs are present), then zips the package.

   Or manually:

   ```bash
   node sync-flat-pages-into-config.js
   node validate-playground-bundle.js
   zip -r newhouse60th-playground-bundle.zip . \
     -x "*.DS_Store" -x "README.md" -x "sync-*" -x "package-*" -x "validate-*"
   ```

## Upload to Admin → Templates

1. **Create Combined Playground Sample** — title e.g. `Newhouse 60th Anniversary`
2. Enable **Public** and **Show on welcome screen**
3. **Upload bundle ZIP** on that template row (expect ~55–60 MB)
4. **Upload a thumbnail** or click **Regenerate thumbnail** (uses the first scene image/video)
5. Reorder on the Templates list if needed

Guests opening the sample from the welcome screen get guest mode with the full combined project loaded.

## Notes

- All asset paths are **relative** (`./videos/...`, `./images/...`) — no hosted URLs required.
- The flat page embed uses `../../index.html` so the 360° tour works inside the package.
- Bundle upload limit on the server is 120 MB.
