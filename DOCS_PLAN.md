# Documentation Plan — VR Hotspots Educational

This document tracks **what is documented today**, **what was updated recently**, and **teacher-focused guides still to write**. Use it to prioritize help content for instructors and admins.

**Last reviewed:** June 2026 (aligned with `2.0` branch features)

---

## Currently documented

| Document | Audience | Covers |
|----------|----------|--------|
| [USER_GUIDE.md](USER_GUIDE.md) | Students, teachers, admins | Editor basics, sign-in, Online Assets library, tagging/filter search, submit & My Submissions, admin submissions/assets/users/peek |
| [README.md](README.md) | Developers, self-hosters | Install, B2 setup, feature overview, project structure |
| [RENDER_DEPLOY.md](RENDER_DEPLOY.md) | DevOps, admins | Render deploy, env vars, PostgreSQL, Stripe, post-deploy setup |
| In-editor **ℹ️** instructions | Students | Context-sensitive edit/navigation hints (in `script.js`) |

---

## Recommended new documents (priority order)

### 1. Teacher Quick Start *(High — write first)*

**File:** `TEACHER_QUICKSTART.md`  
**Audience:** Classroom teacher using a hosted instance (no dev setup)  
**Length:** 2–3 pages  

**Outline:**
- What you need before class (admin URL, password, student list)
- Day-one checklist: create class → add students → download password CSV → upload 2–3 Shared Assets → share editor URL
- What students do (sign in, build, submit)
- What you do (Submissions inbox, download or review)
- One screenshot callout per admin page (Submissions, Assets, Users)

**Why first:** Gets a class running without reading the full user guide or README.

---

### 2. Teacher Guide: Users & Classes *(High)*

**File:** `TEACHER_GUIDE_USERS.md`  
**Audience:** Teachers managing rosters  

**Outline:**
- Creating and naming classes
- Adding students one-by-one vs bulk (if bulk is added later — note current limitation)
- Password CSV export and secure handout practices
- Reset Password workflow
- When to use **Peek** vs Submissions inbox
- `STUDENT_AUTH_REQUIRED` — what happens when sign-in is off vs on

---

### 3. Teacher Guide: Online Assets & Tagging *(High)*

**File:** `TEACHER_GUIDE_ASSETS.md`  
**Audience:** Teachers curating shared media  

**Outline:**
- Shared Assets vs student My Assets (who sees what)
- Upload workflow and category/size limits
- Tagging strategy for classrooms (naming conventions, e.g. `unit-3`, `farm-audio`)
- Using the filter bar (chips, recent tags, Show All Tags)
- Preview modal and Copy URL
- Signed URL fallback — when links expire and how refresh works
- B2 public vs signed bucket (plain language)

---

### 4. Teacher Guide: Grading & Feedback *(High)*

**File:** `TEACHER_GUIDE_GRADING.md`  
**Audience:** Teachers reviewing student VR projects  

**Outline:**
- Submissions inbox filters (class, student, notes)
- Reading student notes
- Download vs Host vs Review in Editor — when to use each
- **Save and Send to Student** workflow and what students see
- Version history (submitted vs draft vs teacher feedback)
- Import Project ZIP (recovering lost submissions, manual uploads)
- Delete version — cautions
- Hosting caveats (ephemeral disk on Render, re-host after redeploy)

---

### 5. Teacher Guide: Peek & Student Monitoring *(Medium)*

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

### 6. Teacher Guide: Billing & Quotas *(Medium — if Stripe enabled)*

**File:** `TEACHER_GUIDE_BILLING.md`  
**Audience:** Admins on paid tiers  

**Outline:**
- When billing appears
- Class vs Pro tiers (map to your Stripe products)
- Usage limits (students, storage, hosted projects — match `admin-billing.js` display)
- Checkout and customer portal
- Webhook / env setup pointer to RENDER_DEPLOY

---

### 7. Student Handout *(Medium)*

**File:** `STUDENT_HANDOUT.md` (or PDF export)  
**Audience:** Students (printable / LMS post)  
**Length:** 1 page  

**Outline:**
- Sign-in steps
- Edit Mode vs Navigation Mode (one sentence each)
- How to add a hotspot
- Browse Online Assets → Select
- Submit to Admin + optional note
- My Submissions / teacher feedback
- “Don’t use Clear Data” warning

---

### 8. FAQ *(Medium)*

**File:** `FAQ.md`  
**Audience:** Everyone  

**Suggested questions:**
- Why can’t I submit from a file on my desktop?
- Why did my shared asset URL stop working?
- Why doesn’t audio autoplay?
- What’s the difference between Save Template and Submit?
- What’s the difference between Save to Cloud and Submit?
- Can students see each other’s My Assets?
- How do tags work (upload vs search bar)?

---

### 9. Admin Technical Reference *(Low — for IT)*

**File:** `ADMIN_TECH_REFERENCE.md`  
**Audience:** IT staff, advanced admins  

**Outline:**
- All admin URLs and API routes (read-only list)
- Environment variables (extend RENDER_DEPLOY)
- Database tables overview (classes, students, submissions, asset_tags)
- B2 bucket layout (common-assets, student paths)
- Backup and restore notes
- Local dev: `npm start`, `npm run dev`, `npm run dev:feature`

---

### 10. Video / workshop scripts *(Low)*

**Files:** `docs/workshop/` (folder, when created)  

| Script | Duration | Content |
|--------|----------|---------|
| Student intro | 5 min | Sign in, one hotspot, submit |
| Teacher admin tour | 10 min | Users, Assets, Submissions, Peek |
| Review & feedback | 5 min | Review in Editor → Save and Send |

---

## Content gaps to avoid duplicating

Keep **USER_GUIDE.md** as the single comprehensive reference. Teacher guides should:

- Link back to USER_GUIDE sections instead of copying full editor tutorials
- Focus on **classroom workflow** and **decision trees** (“use Host when…”, “use Review when…”)
- Include **screenshots** when written (not yet in repo)

Keep **README.md** developer-focused; don’t move teacher content there.

Keep **RENDER_DEPLOY.md** ops-focused; billing env vars stay there, classroom usage stays in TEACHER_GUIDE_BILLING.

---

## Suggested writing order & effort

| # | Document | Effort | Depends on |
|---|----------|--------|------------|
| 1 | TEACHER_QUICKSTART.md | ~2 hrs | USER_GUIDE (done) |
| 2 | TEACHER_GUIDE_GRADING.md | ~3 hrs | Screenshots from Submissions |
| 3 | TEACHER_GUIDE_ASSETS.md | ~2 hrs | Screenshots from Assets |
| 4 | TEACHER_GUIDE_USERS.md | ~2 hrs | Screenshots from Users |
| 5 | STUDENT_HANDOUT.md | ~1 hr | USER_GUIDE student sections |
| 6 | FAQ.md | ~2 hrs | Support questions from classes |
| 7 | TEACHER_GUIDE_PEEK.md | ~1.5 hrs | Peek UI |
| 8 | TEACHER_GUIDE_BILLING.md | ~1.5 hrs | Stripe config |
| 9 | ADMIN_TECH_REFERENCE.md | ~4 hrs | Code audit |
| 10 | Workshop scripts | ~3 hrs | After guides stable |

**Total estimate:** ~22 hours for full teacher/help doc set.

---

## Maintenance checklist

Update docs when shipping:

- [ ] New admin page or nav label
- [ ] Asset library UX change (filter bar, tabs, buttons)
- [ ] Submission/version workflow change
- [ ] New env vars or deploy steps
- [ ] Billing tier or quota change

After each release, skim USER_GUIDE + TEACHER_QUICKSTART against the changelog.

---

## Links to add when guides exist

When each file is created, add to README **Documentation** section and USER_GUIDE **Getting help**:

```markdown
- **[Teacher Quick Start](TEACHER_QUICKSTART.md)** — day-one classroom setup
- **[Teacher Guides](DOCS_PLAN.md)** — full index of instructor docs
```
