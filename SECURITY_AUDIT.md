# Security Audit Plan

This document tracks the security audit and remediation work for the VR Hotspots Educational app (Express + PostgreSQL + Backblaze B2).

## Version 3.8 (security hardening)

**Branch:** `3.8` (from `3.6`)

**Purpose:** Close critical/high gaps found after 2.8/3.6 — preview sandbox escape, same-origin `/hosted` isolation, reversible password keying, DNS-rebinding on `/fetch-video`, admin attribute XSS — and document what is actually shipped.

**Deploy target for first validation:** `webxride.com` + `hosted.webxride.com`. Do **not** migrate `seedsofstory.webxride.com` until content is recovered. Guest/playground stays enabled on public webxride.

See [docs/v3.8/README.md](docs/v3.8/README.md) for the deploy checklist.

### How to test locally

```bash
cd create_hotspot_template-master
git checkout 3.8
npm install
npm run test:security
npm run build:flat-editor   # required after Preview.jsx sandbox change
npm start
```

### Changes in 3.8

| Area | Fix |
|------|-----|
| XSS / sandbox | Flat preview + Ridey preview iframes drop `allow-same-origin` (source + committed bundle) |
| Hosted isolation | Optional `HOSTED_ORIGIN` subdomain; host routing serves only `/hosted/*` on that host |
| Passwords | Production requires dedicated `STUDENT_PASSWORD_ENCRYPTION_SECRET` (fail closed) |
| SSRF | `/fetch-video` connects to DNS-pinned IP (Host/SNI keep original hostname) |
| Admin XSS | Submissions UI escapes `'` / avoids unsafe single-quoted `onclick` interpolation |
| Screenshots | Puppeteer request interception blocks private/metadata URLs; no `--disable-web-security` |
| Ridey | Strict student auth whenever AI analysis can spend |
| Tests | Extended `npm run test:security` |

### Remaining risks (accepted / follow-up)

- Guest / local-test mode remains enabled on public webxride by product choice
- Classroom installs without `HOSTED_ORIGIN` still serve `/hosted/*` on the app origin (document residual risk)
- CSRF guard still accepts `X-Requested-With: XMLHttpRequest` (mitigated when hosted is on a separate origin)
- Postgres TLS uses `rejectUnauthorized: false` for managed DB compatibility
- Zip-bomb size/ratio caps, CI security workflow, and further modularization of `simple-server.js` are not in 3.8
- `seedsofstory.webxride.com` is intentionally not on 3.8 yet

---

## Version 2.8 branch (historical)

**Branch:** `2.8`

Earlier hardening: cloud-write auth, production secret checks for admin/session secrets, hostname/IP blocklist for `/fetch-video` (without DNS pin), helmet + hosted CSP, CSRF Origin guard, ZIP validation, admin login rate limit.

**Correction:** 2.8 documentation claimed the flat preview iframe dropped `allow-same-origin`. That change was **not** present in shipped 2.8/3.6 source or `flat-editor.bundle.js`. It is fixed in **3.8**.

### Known remaining risks after 2.8 (superseded by 3.8 where noted)

- Published student pages at `/hosted/*` ran on the app origin — addressed in 3.8 via `HOSTED_ORIGIN`
- Preview sandbox escape — addressed in 3.8
- Password encryption fell back through session secrets — addressed in 3.8
- `/fetch-video` DNS rebinding TOCTOU — addressed in 3.8

---

## Current posture (baseline)

The main application lives in this folder. It is a full-stack Node.js app: [`simple-server.js`](simple-server.js), PostgreSQL ([`services/db-service.js`](services/db-service.js)), Backblaze B2, Stripe, OpenAI (Ridey).

**SQL injection:** Low risk — queries use parameterized `$1`, `$2` placeholders via `db-service.query()`. A few fixed enums are interpolated into `ORDER BY` (not user-controlled); prefer keep those enums closed.

**Students intentionally write HTML/CSS/JS** that runs on publish. Mitigation is **isolation** (separate subdomain when `HOSTED_ORIGIN` is set, teacher review), not sanitization of all student code.

---

## Phase 1 — Inventory and automated baseline

```bash
npm audit
npm audit --production
npm run test:security
rg "query\(\`[^\`]*\$\{" --glob '*.js'   # SQL anti-pattern
```

---

## Phase 2–4 — Ongoing

Use the checklists and dynamic tests from earlier audit work; re-run against staging with `HOSTED_ORIGIN` set before calling a classroom install “isolated.”

### Follow-ups (not 3.8)

- Security tests in CI
- Zip entry-count / compression-ratio caps
- Full CSRF double-submit tokens
- Point GitHub default branch at the actively deployed line
- Migrate seedsofstory (and other classroom subdomains) to `hosted.<install>.webxride.com` after content recovery
