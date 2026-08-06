# Classroom Error Interpretations Log

Operational notes while students work on **seedsofstory.webxride.com** (and related).  
Append new entries at the top of the **Entries** section (newest first).

---

## How to use

When new Error Log / Activity exports arrive, add a dated entry with:

- Source (export filename, paste, Activity snippet)
- Summary table of codes
- Interpretation / student impact
- Action (class workaround vs code fix vs ignore)

---

## Entries

### 2026-08-06 ~12:25 PM EDT — student10 black image hotspot (extensionless export)

**Source:** Classroom photo (iPad vs laptop) + `exports/0806/v009_1786032732576.zip` / Desktop unzip  
**Student:** student10 · project `8/6` · version 9 · `versionId=03922370-23cc-41fa-ba15-3eac0209d21c`

**Finding:** Picture hotspot on **Everything about Qabili polou** packaged as  
`./images/b8db0a4d-69c1-47c3-80fa-4df35caddb9e` with **no extension**. Bytes are a valid JPEG (iPad Pro); renaming to `.jpg` shows the image locally. Hotspot export used the bare IDB/UUID name and did not append an extension (scene skies already did via `sanitizeExportFileName`).

**Live editor also had** a separate Image hotspot on **Introducing** (`IMG_0123.jpeg`, pos `1.7 2.2 7.28`) showing black in the Edit dialog thumb — that one was **dropped on export** (missing media harden), so it is absent from v009.

**Action:** Export fix — hotspot image/video packaging now forces an extension from MIME/type (`.jpg` / `.mp4` fallback). Student workaround until redeploy: replace image + re-upload, or rename file + update `config.json` in the ZIP.

### 2026-08-06 ~12:01 PM EDT — Error Log export `error-log-048Z.json` (32 rows)

**Source:** `/Users/danielpacheco/Downloads/error-log-048Z.json`  
**Exported:** 2026-08-06T16:01:04.049Z

**Full export counts:**

| Code | Count | Notes |
|---|---:|---|
| `unhandled_rejection` `sceneEl.querySelectorAll` | 13 | Dominant; mostly iPad Chrome during scene load / gizmo hide |
| `session_required_mid_flow` | 8 | Stale cookie / multi-tab cloud submit |
| `scene_panorama_load_failed` | 4 | All from **Aug 5 morning** (expired B2) — none new today |
| `hotspot_video_process_failed` (.mov) | 3 | student08 again today 10:34 (hs 141); prior student08/09 on Aug 5 |
| `unhandled_error` | 2 | WebXR + `__gCrWeb` — ignore |
| `scene_video_missing_source` | 1 | student19 Aug 5 8:08 PM — 360 video scene lacks playable source |
| `video_transcode_store_original` | 1 | Aug 5 afternoon (already noted) |

**Aug 6 morning only (11 rows — actionable):**

| Time | Code | Student | Meaning |
|---|---|---|---|
| 11:57 | `session_required_mid_flow` | student07 | Submit with dead session → refresh + sign in |
| 10:24 | `session_required_mid_flow` | student17 | Same |
| 10:24–11:46 | A-Frame `querySelectorAll` | student05/09/10/12/13 (+ `8_4`) | Known race; noise unless stuck |
| 10:34 | `.mov` → MP4 failed | student08 | Export as H.264 MP4 and re-add |

**Also overnight (Aug 5 8:08 PM):** student19 `scene_video_missing_source` on a video scene (`videoStorageKey` present but not resolvable) — check that project’s Introduction/360 video media.

**Good:** Still **no** new `scene_panorama_load_failed` after the B2 proxy fix.

---

### 2026-08-05 ~3:30 PM EDT — Full Error Log export `…T19-30-34-506Z.json` (21 rows)

**Source:** `/Users/danielpacheco/Downloads/error-log-all-shown-2026-08-05T19-30-34-506Z.json`

**Counts by code (all day):**

| Code | Count | Notes |
|---|---:|---|
| `unhandled_rejection` `sceneEl.querySelectorAll` | 6 | A-Frame race; still recurring on iPad (incl. 3:09 via `_hideModelTransformGizmo`, 3:20 student14) |
| `session_required_mid_flow` | 6 | Stale-session cloud save/submit (student03/09/13/14/19); includes 1:17 student13 submit |
| `scene_panorama_load_failed` | 4 | All ≤10:59 AM — pre–B2-fix; **no new panorama failures after fix** |
| `hotspot_video_process_failed` (.mov→MP4) | 2 | student09 (11:56, hs 264), student08 (3:02, hs 130) |
| `video_transcode_store_original` | 1 | 3:00 PM server-side: MP4 named like `807646493…mp4` failed ffmpeg compress; stored original (`needsMovConversion: false`) |
| `Failed to enter VR no WebXR` | 1 | student19 iPad — ignore |
| `__gCrWeb` | 1 | Chrome iOS noise — ignore |

**Afternoon / newest (actionable):**
- 3:20 / 3:09 — A-Frame race (noise unless student stuck)
- 3:02 — student08 `.mov` conversion failed
- 3:00 — server transcode warning on an MP4 (not .mov); pipeline fell back to storing original
- 1:17 — student13 session required on submit (already discussed)

**Good:** Still no post-fix `scene_panorama_load_failed`.

---

### 2026-08-05 ~3:12 PM EDT — Two newest ZIPs in `exports/0805`

| ZIP | Verdict | Notes |
|---|---|---|
| `v006_1785950239078.zip` | **healthy** | `8_5`, 10 scenes, 28 hotspots, 73.6 MB; 0 B2 auth / missing / broken nav; flat page customized; 3 scene-field mismatches |
| `v004_1785950256593.zip` | **healthy** | `8_5`, 9 scenes, 45 hotspots, 99.4 MB; 0 B2 auth / missing / broken nav; default flat page |

---

### 2026-08-05 ~3:04 PM EDT — Batch health check `exports/0805` (18 zips)

**Source:** All ZIPs in `exports/0805/` (post–B2-fix cloud saves/submits; created ~17:19–17:36 UTC)

**Verdict:** **18/18 structurally healthy.**

- 0 expired B2 `Authorization=` / backblazeb2 URLs  
- 0 missing media file refs  
- 0 broken navigation targets  
- 0 duplicate hotspot IDs  
- All have `index.html` + `config.json` + bundled `images/`  
- Scenes 7–12, hotspots 15–70, ~75–105 MB each (avg ~88 MB)  
- Minor only: some `scene` field mismatches on hotspots; one project (`v003_1785951008842`) has **0 nav hotspots** (content gap, not corruption); several still use default flat-page starter  

Supports that post-fix bundled exports are durable and not depending on signed B2 links.

---

### 2026-08-05 1:17 PM EDT — Submit mid-flow after prior login window

**Source:** User paste (`details` only); Error Log time **1:17 PM**

| Details | Likely code | Interpretation |
|---|---|---|
| `flow: submitProject`, `kind: submitted`, `/index.html`, iPad CriOS (build 7922.25) | `session_required_mid_flow` | Submit failed auth check at **1:17 PM**. |

**Timing:** Well after the morning deploy wave and after at least one known re-login at **12:08 PM** (if same student — confirm on the Error Log row’s `userName`). So this is **not** “never signed in after deploy.” More likely: **stale iPad tab** still showing cloud UI without a valid cookie, second tab/profile, or session lost without an Activity logout.

**Action:** On that iPad: close other editor tabs → hard refresh → confirm name bar shows signed-in student → submit once. Cross-check Activity for a login between 12:08 and 1:17 (and any deploy around then).

---

### 2026-08-05 ~12:26 EDT — Submit mid-flow (iPad)

**Source:** User paste (`details` only) + Activity follow-up

| Details | Likely code | Interpretation |
|---|---|---|
| `flow: submitProject`, `kind: submitted`, `/index.html`, iPad CriOS | `session_required_mid_flow` | Submit saw `authRequired && !authenticated` on `/api/student/session`. |

**Activity note:** Student logged in **12:08:15 PM**. If the Error Log `createdAt` is **before** 12:08, this is an older failed submit (pre-relogin). If **after** 12:08, not a simple “never re-logged” case — likelier: submit from a **stale tab** that never picked up the new cookie, second browser/profile, or cookie lost again after login.

**Action:** Confirm Error Log timestamp vs 12:08. If after: close extra tabs, hard refresh once after login, submit from that tab only.

---

### 2026-08-05 ~12:21 EDT — A-Frame race + submit mid-flow (details only)

**Source:** User paste (Error Log `details` objects; codes not included in paste)

| Details | Likely code | Interpretation |
|---|---|---|
| Stack: `refreshObjects` → `refreshSceneMediaRaycasters` @ `script.js:2654/2657` → `loadCurrentScene` (iPad CriOS) | `unhandled_rejection` / `sceneEl.querySelectorAll` | Same known A-Frame init race. Ignore for class unless scene won’t load. |
| `flow: submitProject`, `kind: submitted`, path `/index.html` (iPad CriOS) | Almost certainly `session_required_mid_flow` | Tried **Submit to Admin** with dead/missing student session (post-deploy stale tab or never re-signed-in). |

**Action:** For submit: hard refresh → sign in → submit again (local work should remain). For A-Frame stack: no student action unless stuck.

---

### 2026-08-05 ~12:20 EDT — `.mov` transcode + A-Frame race

**Source:** User paste (Error Log details)

| Code / message | Student impact | Interpretation |
|---|---|---|
| QuickTime `.mov` → MP4: `ffmpeg exited with code 1: Conversion failed!` (hotspotId 264, iPad) | Video hotspot upload failed | Server FFmpeg could not convert that `.mov` (often HEVC/HDR/odd iPhone codec or bad upload). Not B2/session. |
| `unhandled_rejection` / `this.el.sceneEl.querySelectorAll` (`refreshSceneMediaRaycasters` → A-Frame `refreshObjects`) | Usually recoverable noise | Known iPad init race; line numbers shifted after B2 proxy rewrite |

**Action:** Student: convert/export clip to **MP4 H.264**, re-add. Later: null-guard raycaster refresh; optionally improve `.mov` handling / clearer UI.

---

### 2026-08-05 ~11:54 EDT — Activity log vs `session_required`

**Source:** Admin Activity paste (logins/logouts)

**Correlation:**

| Student | Session error time | Last login before error | Notes |
|---|---|---|---|
| student13 | 11:24 cloud draft | 10:54 | Pre-deploy session; no re-login in Activity list |
| student19 | 11:13 submit | 11:03 | Deploy invalidated session; re-logged 11:18 |
| student09 | 11:49 submit | 10:58 | Re-logged 11:52 after failure |
| student03 | 10:58 submit | 10:51 | Earlier wave |

**Interpretation:** Deploy kills cookies (`SESSION_BOOT_ID`); UI can still look signed in until refresh. Logout rows only appear on explicit Sign out — missing logout ≠ valid session.

**Action:** Hard refresh → sign in → retry cloud save/submit. Local work should remain in browser storage.

---

### 2026-08-05 ~11:54 EDT — Error export `error-log-all-shown-2026-08-05T15-54-48-184Z.json`

**Source:** `/Users/danielpacheco/Downloads/error-log-all-shown-2026-08-05T15-54-48-184Z.json` (12 rows)

**New after ~11:09 B2 fix deploy:**

| Time (EDT) | Code | Student | Interpretation |
|---|---|---|---|
| 11:49 | `session_required_mid_flow` (submit) | student09 | Stale session |
| 11:46 | `Failed to enter VR no WebXR` | student19 | iPad Chrome has no WebXR — ignore / expected |
| 11:24 | `session_required_mid_flow` (draft) | student13 | Stale session |
| 11:13 | `session_required_mid_flow` (submit) | student19 | Stale session (Mac Chrome) |

**Notable:** No new `scene_panorama_load_failed` after ~11:00 — B2 proxy rewrite appears to be holding. Older panorama / `__gCrWeb` / `sceneEl` rows are pre-fix leftovers.

---

### 2026-08-05 ~11:58 EDT — Cloud draft health check `exports/v002_1785944399501`

**Source:** Local export folder `exports/v002_1785944399501` (project name `8_5`, created ~15:39 UTC)

**Verdict:** Healthy bundled cloud draft (~83MB).

- 8 image scenes, 49 hotspots, no dup IDs, no broken nav targets  
- All media as local `./images/…` — **no** expired B2 `Authorization=` URLs  
- No missing files referenced by `config.json`  
- Minor: orphan `audio/music.mp3`; one hotspot `scene` field mismatch (id 53); flat page still default template  

---

### 2026-08-05 ~11:12 EDT — Error export `error-log-all-shown-2026-08-05T15-12-12-267Z.json`

**Source:** Same 8 rows as earlier morning export (all ≤ 10:59 EDT) — pre–B2-fix noise; no new post-deploy failures in that file.

---

### 2026-08-05 morning — First classroom Error Log triage (8 rows)

**Source:** User JSON paste / earlier download

| Code | Count | Interpretation |
|---|---:|---|
| `scene_panorama_load_failed` | 4 | Expired Backblaze download tokens baked into `scene.image` / common-asset URLs (~7-day `Authorization=`). Files still in B2; URLs dead. **Fixed in code** (`ac57aed`): rewrite to `/common-assets/…` proxy. |
| `session_required_mid_flow` | 1+ | Cookie invalid after Render deploy; cloud UI still visible from `window.currentStudent`. |
| `unhandled_rejection` `sceneEl.querySelectorAll` | 2 | A-Frame raycaster race on iPad. |
| `__gCrWeb` | 1 | Chrome-on-iOS injection noise — ignore. |

**Push timing note:** Prefer shipping B2 fix during class (brief re-login) over leaving broken panoramas.

---

### Background (session / deploy behavior)

- Production sessions include `SESSION_BOOT_ID`; each Render deploy invalidates student cookies.  
- Open tab: local edit + `localStorage`/IndexedDB continue; cloud APIs fail until refresh + sign-in.  
- With `STUDENT_AUTH_REQUIRED=true`, reload shows login gate (no guest). Work restores from browser storage after re-login.

---

## Code fixes shipped this session (reference)

| Commit / change | Purpose |
|---|---|
| `935afaa` | Error Log JSON download (per-row + all shown) |
| `ac57aed` | Rewrite expired B2 common-asset URLs to durable `/common-assets/…` proxies |

---

## Still open (not blocking class)

- Null-guard `refreshSceneMediaRaycasters` / A-Frame `sceneEl` race  
- Filter `__gCrWeb` and optionally “no WebXR” from Error Log noise  
- Harder `.mov` → MP4 failures (codec-specific); clearer student messaging  
- Optional: detect dead session in UI and prompt re-login before cloud buttons look enabled  
