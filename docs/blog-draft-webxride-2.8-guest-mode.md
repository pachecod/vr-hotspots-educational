# WebXRIDE 2.8 — WordPress publish package

Use the sections below in order: **publish checklist** → **readable draft** → **screenshot shot list** → **Gutenberg blocks** (paste into WordPress Code Editor or “Convert to blocks”).

---

## WordPress publish checklist

| Field | Value |
|-------|--------|
| **Title** | WebXRIDE 2.8: Try It Yourself — Guest Mode, Smarter Templates, and Ridey 2.0 |
| **Slug** | `webxride-2-8-guest-mode-try-it-yourself` |
| **Category** | WebXRIDE |
| **Tags** | WebXRIDE, guest mode, VR education, 360 tours, open source, Ridey, immersive storytelling |
| **Excerpt** | Version 2.8 adds Guest Mode at webxride.com so anyone can try the editor without signing in — plus a visual config editor, Ridey 2.0 beta, and a polished welcome screen. |
| **Featured image** | Screenshot 1 (welcome screen) — see shot list |
| **Related post** | Link to [Introducing the Open Source 360 Hotspot Creator Tool](https://danpacheco.com/introducing-the-open-source-360-hotspot-creator-tool/) in the intro |

**Before publish:** Capture screenshots 1–6 from [webxride.com](https://webxride.com) (and screenshot 7 from admin if you have access). Upload to Media Library; replace `IMAGE_URL_*` placeholders in the Gutenberg section.

---

## Readable draft (edit here first)

### Try the editor before you commit to a class account

When I [introduced the open source 360 Hotspot Creator](https://danpacheco.com/introducing-the-open-source-360-hotspot-creator-tool/) in June, the most common reply was: *Can I just try it without setting up student accounts, storage, and deployment?*

**WebXRIDE 2.8** answers that with **Guest Mode**.

Visit **[webxride.com](https://webxride.com)**, click **Continue as Guest** or **Open sample** on a project card, and you’re in the full editor — no password, no roster, no waiting on an instructor.

That matters for the NSF classroom work behind this tool. Curiosity usually comes before credentials: a teacher wondering if VR storytelling works on school iPads, or a student who wants to know what a hotspot *is* before assignment one. Guest Mode is the front door.

> **📸 Screenshot 1 — Welcome screen**  
> **File:** `webxride-welcome-guest-and-samples.png`  
> **Caption:** The WebXRIDE welcome screen: **Continue as Guest**, sign-in, and **Try a sample project**.  
> **Capture:** Full browser at [webxride.com](https://webxride.com) — show both the guest button and at least two sample cards.

---

### Guest Mode: a real editor, not a demo

Guest Mode is not a slideshow. You get the same core tools signed-in students use for exploration and export:

- **360° VR tours** — scenes, hotspots, audio, images, 3D models, navigation
- **Flat Web Page mode** — HTML, CSS, JavaScript with live preview
- **Local files** on your device
- **Shared Online Assets** (curated media teachers use in class)
- **Templates** from the gallery
- **ZIP export** — a standalone site you can host anywhere

By design, Guest Mode does **not** cloud-save projects, submit to an admin, or accept personal server uploads. Work lives in your browser session. That keeps the public playground simple and safe.

Want cloud drafts, **My Assets**, and **Submit to Admin**? Sign in from the same welcome screen when your team or class is ready.

Opening Guest Mode or a sample project shows a short agreement: work isn’t stored on our servers, and exported content is your responsibility. See [Terms of Use](https://webxride.com/terms.html) and [Privacy Policy](https://webxride.com/privacy-policy.html).

> **📸 Screenshot 2 — Guest agreement**  
> **File:** `webxride-guest-agreement-modal.png`  
> **Caption:** Before guest mode starts, visitors confirm they understand local-only storage.  
> **Capture:** Click **Continue as Guest** or **Open sample**; capture the modal before clicking Agree.

---

### Try a sample project — no account, no setup

The welcome screen’s **Try a sample project** grid loads curated starters — **Flat page** or **360° + Web** combined projects.

On [webxride.com](https://webxride.com):

1. Open the site  
2. Pick a sample  
3. Edit immediately  
4. Export when ready  

Share direct links for workshops: `https://webxride.com/?playground=your-template-slug`

Admins curate samples under **Templates**: upload a project ZIP, add a thumbnail, enable **Show on welcome screen**. Combined bundles can pair a 360° tour with a flat landing page — like the **Newhouse 60th Anniversary** sample (four linked 360° video scenes plus a Syracuse-themed web page).

> **📸 Screenshot 3 — Sample open in editor**  
> **File:** `webxride-sample-loaded-360-editor.png`  
> **Caption:** A welcome-screen sample opens fully loaded — still in guest mode.  
> **Capture:** After **Open sample**, show the 360° scene with Editing Tools visible.

---

### Visual config editor — template settings without JSON anxiety

Flat-page starter templates (especially the new **immersive museum** starters) ship with a **`config.json`** file that drives exhibit names, 3D model URLs, positions, labels, and more.

In 2.8, templates that include a **`config.ui.json`** schema get a **Visual / Code** toggle on the `config.json` tab:

- **Visual** — form fields grouped by section (Project, Images, 3D Models, Exhibits, …). Pick asset URLs from Online Assets where the schema supports it.  
- **Code** — raw JSON for students who want full control.

Students never see `config.ui.json` itself; admins embed the schema in the template. The visual form still works in student projects.

**Why this landed in 2.8:** Museum and scrollytelling templates were powerful but intimidating. A misplaced comma in JSON shouldn’t block a 5th grader from moving an exhibit. Visual mode lowers the floor; Code mode keeps the ceiling high.

**Try it as a guest:** Open an immersive-museum sample (or load the template from the flat editor **Templates** menu), switch to **Flat Web Page**, open the `config.json` tab, and toggle **Visual**. Change a museum name or exhibit label — the live preview updates.

> **📸 Screenshot 4 — Visual config editor**  
> **File:** `webxride-config-visual-code-toggle.png`  
> **Caption:** **Visual** and **Code** modes on `config.json` — no hand-editing required for common template settings.  
> **Capture:** Flat editor, `config.json` tab, Visual mode showing form sections; include the toggle and a slice of live preview.

> **📸 Screenshot 5 — Immersive museum preview**  
> **File:** `webxride-immersive-museum-preview.png`  
> **Caption:** Config-driven immersive museum template in the flat-page live preview.  
> **Capture:** Preview pane after editing a visual field (e.g. museum name or model URL).

---

### Ridey 2.0 (beta) — AI help across the whole project

**Ridey** is WebXRIDE’s optional AI assistant — a purple car in a VR headset. **Ridey 1.0** (still the default) routes CSS to `style.css` and JavaScript to `script.js` while keeping HTML structural.

**Ridey 2.0 (beta)** is the bigger step in 2.8:

- **Holistic editing** — Ridey sees HTML, CSS, JS, *and* `config.json` together  
- **Multi-file preview diffs** — review every proposed change before applying  
- **JSON validation on apply** — invalid `config.json` edits are caught before they break the template  
- **Admin toggle** — switch **1.0** ↔ **2.0** under **Editor Settings**; no redeploy to roll back  

**Classroom framing:** Use **1.0** when you want predictable single-file routing. Try **2.0** when students work on immersive museum templates and you want Ridey to adjust exhibit config *and* page styling in one conversation.

> **Note:** Ridey requires a **signed-in** team or class account and an admin-configured `OPENAI_API_KEY`. Guest visitors won’t see **Ask Ridey** on [webxride.com](https://webxride.com) — explore in Guest Mode first, then sign in when your instructor enables AI.

> **📸 Screenshot 6 — Ridey 2.0 diff preview**  
> **File:** `webxride-ridey-2-multi-file-diff.png`  
> **Caption:** Ridey 2.0 proposes changes across multiple files; preview diffs before applying.  
> **Capture:** Signed-in session, flat editor, **Ask Ridey 2.0** open with a multi-file preview (e.g. `config.json` + `style.css`). Blur student name if visible.

> **📸 Screenshot 7 — Admin Ridey version (optional)**  
> **File:** `webxride-admin-ridey-version.png`  
> **Caption:** Admins choose Ridey 1.0 or 2.0 (beta) under Editor Settings.  
> **Capture:** `/admin-snippets.html` → Enable Ridey + version dropdown.

---

### More in 2.8 (quick hits)

- **Inclusive terminology** — “team or class” and “team member or student” across admin and sign-in (youth programs, museums, and university studios, not only K–12).  
- **Immersive museum starters** — `immersive-museum` and `new-immersive-museum` with config-driven exhibits.  
- **Admin overview** (`/admin`) — one page linking to every admin section.  
- **Review All Content** — site-wide hub on Assets for projects, uploads, tours, and orphaned files.  
- **Welcome screen polish** — sample grid, MIT license footer, clearer sign-in copy.  
- **`main` aligned with `2.8`** on GitHub for production deploys.

---

### Run Guest Mode on your own instance

Guest Mode isn’t only for [webxride.com](https://webxride.com). Clone the [MIT-licensed repo](https://github.com/pachecod/vr-hotspots-educational):

```bash
LOCAL_TEST_USER_ENABLED=true
PUBLIC_PLAYGROUND_ENABLED=true   # welcome-screen sample grid
```

On Render staging/demo, also set `LOCAL_TEST_USER_ALLOW_PRODUCTION=true`. See the [README](https://github.com/pachecod/vr-hotspots-educational/blob/main/README.md) and [Render deploy guide](https://github.com/pachecod/vr-hotspots-educational/blob/main/RENDER_DEPLOY.md). New to Node? Open the repo in [Cursor](https://cursor.com/) and ask its assistant to run `npm run dev`.

---

### Who this is for

| Audience | Start here |
|----------|------------|
| Curious visitors | [webxride.com](https://webxride.com) → Guest or sample |
| Teachers evaluating | Sample project with class before rosters |
| Workshop leads | `?playground=` link for a shared starting point |
| Self-hosters | Guest mode on local/staging without test accounts |
| Students waiting on passwords | Explore assets, templates, export — sign in later for submit & Ridey |

---

### See it in action

- **Try now:** [webxride.com](https://webxride.com)  
- **Editor walkthrough:** [YouTube](https://www.youtube.com/watch?v=Uo-bHKdDRKg)  
- **Student tour examples:** [Tour #1](https://agriquest.org/tours/student5/) · [Tour #2](https://agriquest.org/tours/student7/) · [Video example](https://www.youtube.com/watch?v=23lqPjQc_IE)  
- **Source:** [github.com/pachecod/vr-hotspots-educational](https://github.com/pachecod/vr-hotspots-educational)

---

### Thank you — and what’s next

Thanks to [Sagar Gada](https://github.com/sagargada73) and everyone in the NSF ITEST project — especially Professor Silvie Huang, co-PIs, and youth participants whose feedback shaped Guest Mode and the template work in 2.8.

Thanks to **Emerging Media Platforms** students who stress-tested earlier builds. If you tried a rougher version last year, I hope 2.8 feels closer to what you were imagining.

We’re building larger features on a **3.5** branch while **2.8** stays the stable classroom line. Tried Guest Mode? Tell me what confused you or what sample projects you’d like to see next.

*Note: Some of the work above is based upon work supported by the National Science Foundation under Award No. 2342763. Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the National Science Foundation.*

---

## Screenshot shot list (quick reference)

| # | File name | Page / action | Must show |
|---|-----------|---------------|-----------|
| 1 | `webxride-welcome-guest-and-samples.png` | [webxride.com](https://webxride.com) | Guest button, sign-in, sample grid |
| 2 | `webxride-guest-agreement-modal.png` | Click Guest or Open sample | Agreement modal + Terms/Privacy links |
| 3 | `webxride-sample-loaded-360-editor.png` | After opening a combined sample | 360 scene + Editing Tools |
| 4 | `webxride-config-visual-code-toggle.png` | Flat mode → `config.json` tab | Visual/Code toggle + form fields |
| 5 | `webxride-immersive-museum-preview.png` | After editing a config field | Live preview of museum template |
| 6 | `webxride-ridey-2-multi-file-diff.png` | Signed-in, Ask Ridey 2.0 | Multi-file diff modal |
| 7 | `webxride-admin-ridey-version.png` | Admin → Editor Settings | Ridey enable + version picker |

**Tips:** Use 1440×900 or 1280×800 browser width; hide personal bookmarks bar; dark editor UI reads well on blog white background.

---

## WordPress Gutenberg blocks (copy from here ↓)

Paste into WordPress **Code editor** (or Classic block → HTML). Replace every `IMAGE_URL_1` … `IMAGE_URL_7` after uploading screenshots.

```html
<!-- wp:paragraph -->
<p>When I <a href="https://danpacheco.com/introducing-the-open-source-360-hotspot-creator-tool/">introduced the open source 360 Hotspot Creator</a> in June, the most common reply was: <em>Can I just try it without setting up student accounts, storage, and deployment?</em></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>WebXRIDE 2.8</strong> answers that with <strong>Guest Mode</strong>. Visit <a href="https://webxride.com">webxride.com</a>, click <strong>Continue as Guest</strong> or <strong>Open sample</strong> on a project card, and you're in the full editor — no password, no roster, no waiting on an instructor.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"custom","className":"is-style-default"} -->
<figure class="wp-block-image size-large"><a href="https://webxride.com" target="_blank" rel="noreferrer noopener"><img src="IMAGE_URL_1" alt="WebXRIDE welcome screen with Continue as Guest and Try a sample project grid"/></a><figcaption class="wp-element-caption">The WebXRIDE welcome screen: guest access and curated sample projects — no sign-in required.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Guest Mode: a real editor, not a demo</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Guest Mode gives you the same core tools students use for exploration and export:</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><strong>360° VR tours</strong> — scenes, hotspots, audio, images, 3D models, navigation</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li><strong>Flat Web Page mode</strong> — HTML, CSS, JavaScript with live preview</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li><strong>Local files</strong>, <strong>Shared Online Assets</strong>, <strong>Templates</strong>, and <strong>ZIP export</strong></li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>By design, Guest Mode does <strong>not</strong> cloud-save projects, submit to an admin, or accept personal server uploads. Want <strong>My Assets</strong>, cloud save, and <strong>Submit to Admin</strong>? Sign in from the same welcome screen.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"sizeSlug":"medium"} -->
<figure class="wp-block-image size-medium"><img src="IMAGE_URL_2" alt="Guest mode agreement modal on WebXRIDE"/><figcaption class="wp-element-caption">Visitors confirm guest-mode terms before editing — work stays in the browser, not on our servers.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Try a sample project</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The <strong>Try a sample project</strong> grid on the welcome screen opens full <strong>Flat page</strong> or <strong>360° + Web</strong> starters in guest mode. Share workshop links like <code>https://webxride.com/?playground=your-template-slug</code>.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="IMAGE_URL_3" alt="WebXRIDE editor with a sample 360 tour loaded"/><figcaption class="wp-element-caption">A sample project opens fully loaded — edit scenes, hotspots, or flat-page code immediately.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Visual config editor — settings without JSON anxiety</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Immersive starter templates use a <code>config.json</code> file for exhibit names, 3D models, positions, and labels. In 2.8, templates with a <code>config.ui.json</code> schema get a <strong>Visual / Code</strong> toggle on the <code>config.json</code> tab.</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><strong>Visual</strong> — form fields (Project, Images, 3D Models, Exhibits, …)</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li><strong>Code</strong> — raw JSON for full control</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>Students don't see the schema file; admins embed it in the template. <strong>Try it as a guest:</strong> open an immersive-museum sample, switch to <strong>Flat Web Page</strong>, open <code>config.json</code>, and toggle <strong>Visual</strong>.</p>
<!-- /wp:paragraph -->

<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:image {"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="IMAGE_URL_4" alt="Visual and Code toggle on config.json in WebXRIDE flat editor"/><figcaption class="wp-element-caption">Visual mode for template settings</figcaption></figure>
<!-- /wp:image --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:image {"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="IMAGE_URL_5" alt="Immersive museum template live preview in WebXRIDE"/><figcaption class="wp-element-caption">Live preview updates from config changes</figcaption></figure>
<!-- /wp:image --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Ridey 2.0 (beta) — AI across the whole project</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Ridey</strong> is WebXRIDE's optional AI assistant. <strong>Ridey 1.0</strong> (default) routes CSS and JS into separate files. <strong>Ridey 2.0 (beta)</strong> in 2.8 adds:</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li>Holistic editing across HTML, CSS, JS, and <code>config.json</code></li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Multi-file preview diffs before you apply changes</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>JSON validation on apply</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Admin toggle between 1.0 and 2.0 — no redeploy to roll back</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p><strong>Note:</strong> Ridey requires a signed-in account and an admin-configured API key. Guest visitors explore without AI; sign in when your instructor enables Ridey.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="IMAGE_URL_6" alt="Ridey 2.0 multi-file diff preview in WebXRIDE"/><figcaption class="wp-element-caption">Ridey 2.0 shows diffs for every file it proposes to change.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:image {"sizeSlug":"medium"} -->
<figure class="wp-block-image size-medium"><img src="IMAGE_URL_7" alt="Admin Editor Settings with Ridey version 1.0 or 2.0 beta"/><figcaption class="wp-element-caption">Admins pick Ridey 1.0 or 2.0 (beta) under Editor Settings.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">More in 2.8</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li>Inclusive <strong>team or class</strong> terminology across the UI</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Immersive museum starter templates</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Admin <strong>Overview</strong> and <strong>Review All Content</strong> hub</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li><code>main</code> branch aligned with <strong>2.8</strong> on GitHub</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Self-host Guest Mode</h2>
<!-- /wp:heading -->

<!-- wp:code -->
<pre class="wp-block-code"><code>LOCAL_TEST_USER_ENABLED=true
PUBLIC_PLAYGROUND_ENABLED=true</code></pre>
<!-- /wp:code -->

<!-- wp:paragraph -->
<p>See the <a href="https://github.com/pachecod/vr-hotspots-educational/blob/main/README.md">README</a> and <a href="https://github.com/pachecod/vr-hotspots-educational/blob/main/RENDER_DEPLOY.md">Render deploy guide</a>. Repo: <a href="https://github.com/pachecod/vr-hotspots-educational">github.com/pachecod/vr-hotspots-educational</a> (MIT License).</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">See it in action</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><a href="https://webxride.com">Try webxride.com</a> — Guest or sample project</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li><a href="https://www.youtube.com/watch?v=Uo-bHKdDRKg">Editor walkthrough (YouTube)</a></li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li><a href="https://agriquest.org/tours/student5/">Agriquest tour #1</a> · <a href="https://agriquest.org/tours/student7/">Tour #2</a></li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:embed {"url":"https://www.youtube.com/watch?v=Uo-bHKdDRKg","type":"video","providerNameSlug":"youtube","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->
<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">
https://www.youtube.com/watch?v=Uo-bHKdDRKg
</div></figure>
<!-- /wp:embed -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Thank you</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Thanks to <a href="https://github.com/sagargada73">Sagar Gada</a> and the NSF ITEST team — especially Professor Silvie Huang, co-PIs, and youth participants. Thanks to <a href="https://emergingmediaplatforms.com">Emerging Media Platforms</a> students who stress-tested earlier builds.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><em>Note: Some of the work above is based upon work supported by the National Science Foundation under Award No. 2342763. Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the National Science Foundation.</em></p>
<!-- /wp:paragraph -->
```

---

*End of publish package.*
