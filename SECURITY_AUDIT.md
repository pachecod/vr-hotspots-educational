# Security Audit Plan

This document tracks the security audit and remediation work for the VR Hotspots Educational app (Express + PostgreSQL + Backblaze B2).

## Version 2.8 branch (security hardening)

**Branch:** `2.8` (local only — do not push until explicitly approved)

**Purpose:** Apply P0/P1/P2 fixes from the audit before wider release.

### How to test locally

```bash
cd create_hotspot_template-master
git checkout 2.8
npm install
npm run test:security          # regression tests for redirect/SSRF/auth flags
npm run build:flat-editor      # required after Preview.jsx sandbox change
npm start                      # or npm run dev
```

Open http://localhost:3000 and verify:

1. Student login still works; unauthenticated `/api/b2-upload-url` returns 401 when `DATABASE_URL` or B2 is configured
2. Admin login rate-limits after 5 failed attempts per minute
3. Flat page preview still renders (sandbox no longer has `allow-same-origin`)
4. Remote video fetch via `/fetch-video` requires student session when DB/B2/production is active
5. GitHub OAuth `returnTo=https://evil.com` redirects to `/` only

### Production deploy checklist (before pushing 2.8)

Set these env vars on Render (see `render.yaml`):

- `NODE_ENV=production`
- `ADMIN_PASSWORD` — strong, not `admin123`
- `ADMIN_SESSION_SECRET` — random 32+ bytes
- `STUDENT_SESSION_SECRET` — random 32+ bytes
- `STUDENT_AUTH_REQUIRED=true`
- `DATABASE_URL`, B2 credentials

Server **exits on startup** in production if weak/default secrets are detected.

### Changes in 2.8

| Area | Fix |
|------|-----|
| Auth | `requireAuthForCloudWrites` on `/submit-project`, `/api/b2-upload-url`, `/api/submit-project-meta` |
| Secrets | Production startup validation (`lib/security/production-secrets.js`) |
| SSRF | DNS-resolved IP blocklist on `/fetch-video`; no redirects; stream size cap |
| XSS | Flat preview iframe drops `allow-same-origin`; escaped error `innerHTML` in editor/admin |
| GitHub OAuth | Per-browser session cookie; `returnTo` allowlist |
| Compression | Student auth + job ownership when DB enabled |
| Ridey | Strict student auth when DB or `STUDENT_AUTH_REQUIRED` |
| Admin | Login rate limiting (5/min) |
| Headers | `helmet` (CSP disabled globally; basic CSP on `/hosted/*`) |
| CSRF | Origin/Referer/`X-Requested-With` guard on mutating requests (strict in production) |
| ZIP | `assertValidZipFile` on legacy `/submit-project` |
| Tests | `npm run test:security` |

### Known remaining risks (post-2.8)

- Published student pages at `/hosted/*` intentionally run arbitrary JS (educational feature)
- Weblink hotspots can load arbitrary external URLs in VR tours
- Postgres TLS uses `rejectUnauthorized: false` for managed DB compatibility
- Full CSRF double-submit tokens not yet implemented (partial mitigation via Origin check)

---

## Current posture (baseline)

The main application lives in this folder. It is a full-stack Node.js app: [`simple-server.js`](simple-server.js), PostgreSQL ([`services/db-service.js`](services/db-service.js)), Backblaze B2, Stripe, OpenAI (Ridey).

**SQL injection:** Low risk — all queries use parameterized `$1`, `$2` placeholders via `db-service.query()`.

**Higher-risk areas (addressed in 2.8 where noted):** optional auth on writes, SSRF proxy, student HTML execution, default secrets, missing CSP/CSRF/helmet.

---

## Phase 1 — Inventory and automated baseline

### Endpoint auth matrix

Build by grepping `app.(get|post|put|delete|use)` in `simple-server.js` and `routes/*`. Distinguish `requireStudent` (skips when auth off) vs `requireStudentStrict` (always required).

### Automated scans

```bash
npm audit
npm audit --production
npm run test:security
rg "query\(\`[^\`]*\$\{" --glob '*.js'   # SQL anti-pattern
```

---

## Phase 2 — Category audit checklists

### SQL injection (OWASP A03)

- Enforce parameterized queries only
- No user input in dynamic column/table names

### Authentication (OWASP A01, A07)

- No default passwords in production (enforced in 2.8)
- All B2/DB writes require student session (2.8)
- Admin login rate limited (2.8)

### SSRF (OWASP A10)

- `/fetch-video`: auth + DNS IP validation (2.8)
- Block metadata IPs, private ranges, redirects

### XSS (OWASP A03)

- Escape dynamic `innerHTML` (partial 2.8)
- Preview iframe isolation (2.8)
- `/hosted/*` remains user-controlled JS by design

### CSRF (OWASP A01)

- Origin/Referer guard (2.8)
- Consider double-submit tokens in a future release

### File uploads (OWASP A04, A08)

- ZIP path traversal blocked in `extractZipToDirSafe`
- `assertValidZipFile` on all upload paths (2.8 for legacy submit)

---

## Phase 3 — Dynamic testing

Run against staging with production-like env:

1. Unauthenticated B2 upload → 401
2. SSRF to `169.254.169.254` → blocked
3. GitHub `returnTo` open redirect → blocked
4. Admin brute force → rate limited
5. Cross-student asset access → 403

---

## Phase 4 — Remediation priority

### P0 — Done in 2.8

- Auth-gate cloud writes
- Production secret validation
- SSRF hardening on `/fetch-video`
- Preview sandbox isolation

### P1 — Done in 2.8

- GitHub per-session tokens + safe redirect
- Compression job auth
- Admin rate limit
- Key innerHTML escapes

### P2 — Partial in 2.8

- helmet + hosted CSP
- CSRF Origin guard
- ZIP validation on legacy submit

### P3 — Ongoing

- Security tests in CI
- npm audit on PRs
- Document student-authored JS threat model for teachers

---

## Architectural note

Students intentionally write HTML/CSS/JS that runs on publish. Mitigation is **isolation** (separate subdomain, teacher review), not sanitization of all student code.
