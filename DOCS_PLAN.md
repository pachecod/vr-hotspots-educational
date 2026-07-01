# Documentation Plan — VR Hotspots Educational

This document tracks **what is documented today**, **what was updated recently**, and **teacher-focused guides still to write**. Use it to prioritize help content for instructors and admins.

**Last reviewed:** June 2026 (aligned with **`2.8`** / `main` — Ridey 2.0, visual config editor, content hub, inclusive terminology)

---

## Currently documented

| Document | Audience | Covers |
|----------|----------|--------|
| [USER_GUIDE.md](USER_GUIDE.md) | Students, teachers, admins | 360° editor, **flat web page mode**, `config.json` visual/Code editing, content mode toggle, snippets/templates, **Ridey 1.0 vs 2.0**, Online Assets (Insert Into Page), cloud save/publish, submit & My Submissions, admin overview/content hub/submissions/assets/**editor settings/templates**/users/peek |
| [README.md](README.md) | Developers, self-hosters | Install, B2 setup, flat editor overview, Ridey 2.0, feature list, project structure, 2.8 roadmap |
| [RENDER_DEPLOY.md](RENDER_DEPLOY.md) | DevOps, admins | Render deploy, env vars (incl. OpenAI/Ridey 1.0/2.0), PostgreSQL, Stripe, post-deploy setup |
| In-editor **ℹ️** instructions | Students | Context-sensitive edit/navigation hints (in `script.js`; spherical focus) |

---

## Shipped in 2.8 (documented in USER_GUIDE + README + RENDER_DEPLOY)

- **Inclusive UI terminology** — “team or class”, “team member or student” across admin and sign-in (code identifiers unchanged)
- **Ridey 2.0 (beta)** — admin-selectable under Editor Settings; holistic multi-file editing including `config.json`; multi-file preview diffs; JSON apply guard; optional `RIDEY_STRICT_VALIDATION`
- **Ridey 1.0** remains default; rollback to 1.0 without redeploy
- **Visual config editor** — Visual/Code toggle for `config.json` when template includes `config.ui.json` schema
- **Immersive museum starter templates** — `immersive-museum`, `new-immersive-museum` with config-driven exhibits
- **Admin overview** (`/admin`) and **Review All Content** hub on Assets
- **Welcome screen** polish — sample projects grid, MIT license footer, “Password you were given” label
- **`main` branch** aligned with `2.8` for production deploys

---

## Shipped in 2.5 (documented in USER_GUIDE + README)

- Flat Web Page editor (HTML/CSS/JS tabs, live preview, split presets)
- Toolbar: Copy, Snippets, Format, Templates, Ask Ridey
- Multi-file projects (+ custom files, blocked extensions)
- Online Assets: Insert Into Page, 360° embed, saved pages
- Cloud save & publish for flat pages
- Admin Editor Settings (snippets, Ridey toggle, blocked extensions)
- Admin template gallery + full template editor with Online Assets
- Ridey 1.0 AI (server OpenAI proxy, multi-file CSS/JS routing)

---

## Recommended new documents (priority order)

### 1. Teacher Quick Start *(High — write first)*

**File:** `TEACHER_QUICKSTART.md`  
**Audience:** Classroom teacher using a hosted instance (no dev setup)  
**Length:** 2–3 pages  

**Outline:**
- What you need before class (admin URL, password, roster)
- Day-one checklist: create team or class → add team members or students → download password CSV → upload 2–3 Shared Assets → add 1–2 snippets or a flat template → share editor URL
- What students do (sign in, build 360° or flat page, submit)
- What you do (Submissions inbox, download or review)
- One screenshot callout per admin page (Overview, Submissions, Assets, Editor Settings, Templates, Users)

**Why first:** Gets a class running without reading the full user guide or README.

---

### 2. Teacher Guide: Flat Web Page Editor *(High)*

**File:** `TEACHER_GUIDE_FLAT_PAGES.md`  
**Audience:** Teachers whose students build HTML/CSS/JS pages  

**Outline:**
- When to use Flat Web Page vs Spherical Content
- File tabs (index.html, style.css, script.js, config.json on starters)
- Visual vs Code editing for `config.json`
- Snippets workflow (Editor Settings → student insert)
- Starter templates (Templates admin → student gallery; immersive museum)
- Online Assets → Insert Into Page
- Enabling Ridey — **1.0 vs 2.0**, `OPENAI_API_KEY`, Editor Settings version picker, classroom norms, rollback to 1.0
- Cloud save vs Submit vs Publish
- Embedding a student’s 360° tour in a flat page

---

### 3. Teacher Guide: Grading & Feedback *(High)*

**File:** `TEACHER_GUIDE_GRADING.md`  
**Audience:** Teachers reviewing student VR projects  

**Outline:**
- Submissions inbox filters (team or class, team member or student, notes)
- Reading student notes
- Download vs Host vs Review in Editor — when to use each
- **Save and Send to Team Member or Student** workflow and what students see
- Version history (submitted vs draft vs teacher feedback)
- Import Project ZIP (recovering lost submissions, manual uploads)
- Delete version — cautions
- Hosting caveats (ephemeral disk on Render, re-host after redeploy)

---

### 4. Teacher Guide: Online Assets & Tagging *(High)*

**File:** `TEACHER_GUIDE_ASSETS.md`  
**Audience:** Teachers curating shared media  

**Outline:**
- Shared Assets vs student My Assets (who sees what)
- Upload workflow and category/size limits
- Tagging strategy for classrooms (naming conventions, e.g. `unit-3`, `farm-audio`)
- Using the filter bar (chips, recent tags, Show All Tags)
- Preview modal and Copy URL
- Insert Into Page for flat page assignments
- **Review All Content** hub — when to use vs Assets browse
- Signed URL fallback — when links expire and how refresh works
- B2 public vs signed bucket (plain language)

---

### 5. Teacher Guide: Users & Teams/Classes *(High)*

**File:** `TEACHER_GUIDE_USERS.md`  
**Audience:** Teachers managing rosters  

**Outline:**
- Creating and naming teams or classes
- Adding team members or students one-by-one vs bulk (if bulk is added later — note current limitation)
- Password CSV export and secure handout practices
- Set Password workflow
- When to use **Peek** vs Submissions inbox
- `STUDENT_AUTH_REQUIRED` — what happens when sign-in is off vs on

---

### 6. Teacher Guide: Peek & Student Monitoring *(Medium)*

**File:** `TEACHER_GUIDE_PEEK.md`  
**Audience:** Teachers checking individual student work  

**Outline:**
- Opening Peek from Users vs Assets page
- Browsing student uploads by category
- Tag search in Peek (scoped to that student)
- Deleting inappropriate uploads
- Version table and opening Review from Peek
- Privacy/classroom norms (what admins can see)

---

### 7. Teacher Guide: Billing & Quotas *(Medium — if Stripe enabled)*

**File:** `TEACHER_GUIDE_BILLING.md`  
**Audience:** Admins on paid tiers  

**Outline:**
- When billing appears
- Class vs Pro tiers (map to your Stripe products)
- Usage limits (students, storage, hosted projects — match `admin-billing.js` display)
- Checkout and customer portal
- Webhook / env setup pointer to RENDER_DEPLOY

---

### 8. Student Handout *(Medium)*

**File:** `STUDENT_HANDOUT.md` (or PDF export)  
**Audience:** Students (printable / LMS post)  
**Length:** 1 page  

**Outline:**
- Sign-in steps (team or class → name → password you were given)
- Spherical: Edit Mode vs Navigation Mode (one sentence each)
- Flat page: file tabs, config.json visual mode, Snippets, Templates, Submit
- Browse Online Assets → Select or Insert Into Page
- Submit to Admin + optional note
- My Submissions / teacher feedback
- “Don’t use Clear Data” warning

---

### 9. FAQ *(Medium)*

**File:** `FAQ.md`  
**Audience:** Everyone  

**Suggested questions:**
- What is the difference between Spherical Content and Flat Web Page?
- Why can’t I submit from a file on my desktop?
- Why did my shared asset URL stop working?
- Why doesn’t audio autoplay?
- What’s the difference between Save Template and Submit?
- What’s the difference between Save to Cloud and Submit?
- Can students see each other’s My Assets?
- How do tags work (upload vs search bar)?
- Why is Ask Ridey missing?
- Where does Ridey put CSS and JavaScript?
- **What is the difference between Ridey 1.0 and Ridey 2.0?**
- **Why did Ridey 2.0 reject my JSON change?**
- **What is config.json and when do I use Visual vs Code mode?**

---

### 10. Admin Technical Reference *(Low — for IT)*

**File:** `ADMIN_TECH_REFERENCE.md`  
**Audience:** IT staff, advanced admins  

**Outline:**
- All admin URLs and API routes (read-only list)
- Environment variables (extend RENDER_DEPLOY — incl. `RIDEY_VERSION`, `RIDEY_STRICT_VALIDATION`)
- Database tables overview (classes, students, submissions, asset_tags, snippets, project_templates, app_settings incl. `ridey_version`)
- B2 bucket layout (common-assets, student paths)
- Flat editor build (`npm run build:flat-editor`)
- Backup and restore notes
- Local dev: `npm start`, `npm run dev`, `npm run dev:feature`

---

### 11. Video / workshop scripts *(Low)*

**Files:** `docs/workshop/` (folder, when created)  

| Script | Duration | Content |
|--------|----------|---------|
| Student intro (360°) | 5 min | Sign in, one hotspot, submit |
| Student intro (flat page) | 5 min | Switch mode, edit HTML/CSS, snippet, submit |
| Teacher admin tour | 10 min | Overview, Users, Assets, Editor Settings (Ridey version), Templates, Submissions, Peek |
| Review & feedback | 5 min | Review in Editor → Save and Send |
| Ridey 2.0 demo | 5 min | Enable 2.0, holistic edit on immersive museum template, rollback to 1.0 |

---

## Content gaps to avoid duplicating

Keep **USER_GUIDE.md** as the single comprehensive reference. Teacher guides should:

- Link back to USER_GUIDE sections instead of copying full editor tutorials
- Focus on **classroom workflow** and **decision trees** (“use Host when…”, “use Review when…”, “use Ridey 2.0 when…”)
- Include **screenshots** when written (not yet in repo)

Keep **README.md** developer-focused; don’t move teacher content there.

Keep **RENDER_DEPLOY.md** ops-focused; billing and OpenAI env vars stay there, classroom usage stays in teacher guides.

---

## Suggested writing order & effort

| # | Document | Effort | Depends on |
|---|----------|--------|------------|
| 1 | TEACHER_QUICKSTART.md | ~2 hrs | USER_GUIDE (done) |
| 2 | TEACHER_GUIDE_FLAT_PAGES.md | ~3 hrs | USER_GUIDE flat section + Ridey 2.0 |
| 3 | TEACHER_GUIDE_GRADING.md | ~3 hrs | Screenshots from Submissions |
| 4 | TEACHER_GUIDE_ASSETS.md | ~2 hrs | Screenshots from Assets + content hub |
| 5 | TEACHER_GUIDE_USERS.md | ~2 hrs | Screenshots from Users |
| 6 | STUDENT_HANDOUT.md | ~1 hr | USER_GUIDE student sections |
| 7 | FAQ.md | ~2 hrs | Support questions from classes |
| 8 | TEACHER_GUIDE_PEEK.md | ~1.5 hrs | Peek UI |
| 9 | TEACHER_GUIDE_BILLING.md | ~1.5 hrs | Stripe config |
| 10 | ADMIN_TECH_REFERENCE.md | ~4 hrs | Code audit |
| 11 | Workshop scripts | ~3 hrs | After guides stable |

**Total estimate:** ~25 hours for full teacher/help doc set.

---

## Maintenance checklist

Update docs when shipping:

- [x] New admin page or nav label (Overview, Review All Content — 2.8)
- [x] Flat page editor UX change (config.json visual editor, Ridey 2.0 — 2.8)
- [ ] Asset library UX change (filter bar, tabs, buttons)
- [ ] Submission/version workflow change
- [x] New env vars or deploy steps (`RIDEY_VERSION`, `RIDEY_STRICT_VALIDATION` — 2.8)
- [ ] Billing tier or quota change
- [x] Terminology pass (teams/classes — 2.8)

After each release, skim USER_GUIDE + TEACHER_QUICKSTART against the changelog.

---

## Links to add when guides exist

When each file is created, add to README **Documentation** section and USER_GUIDE **Getting help**:

```markdown
- **[Teacher Quick Start](TEACHER_QUICKSTART.md)** — day-one classroom setup
- **[Teacher Guide: Flat Pages](TEACHER_GUIDE_FLAT_PAGES.md)** — HTML/CSS/JS assignments
- **[Teacher Guides](DOCS_PLAN.md)** — full index of instructor docs
```
