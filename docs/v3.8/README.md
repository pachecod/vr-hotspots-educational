# WebXRIDE 3.8 — Security Hardening

Branch `3.8` hardens preview isolation, student-hosted page origins, password encryption, SSRF, and admin XSS. Created from `3.6`.

## Validate on webxride.com only

Deploy and exercise 3.8 on **webxride.com** (+ `hosted.webxride.com`).

**Do not deploy 3.8 to `seedsofstory.webxride.com` yet.** That service is a frozen content source until student work is exported. No DNS, env, or branch changes there until that recovery is done.

## Guest / playground

Public guest mode stays on for webxride (`LOCAL_TEST_USER_ENABLED` / `LOCAL_TEST_USER_ALLOW_PRODUCTION` / playground flags). Residual risk of guest mode in production is accepted and documented in `SECURITY_AUDIT.md`.

## Hosted subdomain (webxride)

Same Render web service, second hostname:

1. DNS: CNAME `hosted` → same Render target as `webxride.com`.
2. Render → that service → Custom Domains → add `hosted.webxride.com`; wait for TLS.
3. Env on that service:
   - `SERVER_BASE_URL=https://webxride.com`
   - `HOSTED_ORIGIN=https://hosted.webxride.com`

Path shape stays `/hosted/<project>/...` on the subdomain. When `HOSTED_ORIGIN` is unset (local / classroom installs without a split), hosted pages stay on the app origin; the app also strips session cookies on `/hosted/*` as defense-in-depth. Cookie `Path` stays `/` because admin/student HTML and APIs live at the site root (Path cannot exclude `/hosted` while still covering those pages).

**Production (webxride):** `HOSTED_ORIGIN=https://hosted.webxride.com` **is configured** on the Render service, with DNS CNAME `hosted` → the same Render target. Session cookies set on `webxride.com` are not sent to `hosted.webxride.com`.

### URL backfill (webxride DB)

Relative `/hosted/...` rows are fine. Absolute rows that still point at the app host should be rewritten once after cutover, e.g.:

```sql
-- Review counts first; adjust table/column names to match your schema.
-- Example pattern for text URL columns that store absolute hosted tour URLs:
-- UPDATE ... SET url = REPLACE(url, 'https://webxride.com/hosted/', 'https://hosted.webxride.com/hosted/')
--   WHERE url LIKE 'https://webxride.com/hosted/%';
```

Prefer a reviewed one-off script over blind mass updates.

## Password encryption secret

Production **requires** `STUDENT_PASSWORD_ENCRYPTION_SECRET` (dedicated secret; not the session secret).

1. Generate a strong random value before deploying 3.8 to webxride.
2. Set it in Render (`sync: false` in `render.yaml`).
3. Existing `password_encrypted` values encrypted under a previous fallback key (session secret) will not decrypt under the new key. For those roster rows: set a new password in Admin (re-encrypts) or use “reset password” / CSV regenerate flows. New passwords encrypt with the dedicated secret only.

## Implementation status

Code for 3.8 is on branch `3.8`. **webxride.com production already has** `hosted.webxride.com` DNS + `HOSTED_ORIGIN` / `SERVER_BASE_URL` set. Leave `seedsofstory.webxride.com` on its current deploy until content is recovered.

## Smoke checklist (after webxride deploy)

1. Flat-page live preview still renders; normal edit sandbox keeps `allow-same-origin` (needed for nested VR embeds); `?adminReview=1` drops it.
2. Open a published tour on `https://hosted.webxride.com/hosted/...` while logged into admin on `webxride.com` — hosted page JS must not receive admin cookies / must not successfully mutate `/admin` APIs.
3. `/fetch-video` still works for a public HTTPS video URL; private/metadata hosts still blocked.
4. Guest playground / Continue as Guest still works on webxride.
5. Roster CSV password export works for passwords set **after** the new encryption secret is configured.
6. `npm run test:security` passes locally on branch `3.8`.

## Changes in 3.8

| Area | Fix |
|------|-----|
| XSS / sandbox | Admin-review preview drops `allow-same-origin`; editor keeps it for VR embeds |
| Hosted isolation | `HOSTED_ORIGIN` on webxride (`hosted.webxride.com`) + `/hosted` cookie strip |
| CSRF | Origin/Referer only (no `X-Requested-With` bypass) |
| Path ownership | `createVersion` / save-draft reject foreign student B2 paths |
| Passwords | Mandatory `STUDENT_PASSWORD_ENCRYPTION_SECRET` in production |
| SSRF | DNS-pinned IP for `/fetch-video` |
| Admin XSS | Shared `escapeHtml` + data-attribute actions (no fragile onclick IDs) |
| Screenshots | Puppeteer blocks private/metadata fetches |
| Ridey | Strict student auth when AI spend is possible |
| Docs | This file + corrected `SECURITY_AUDIT.md` |

## Local development

```bash
git checkout 3.8
npm install
npm run test:security
npm run build:flat-editor   # after any flat-editor/Preview.jsx change
npm start
```

Optional local split:

```bash
HOSTED_ORIGIN=http://localhost:3000
SERVER_BASE_URL=http://localhost:3000
```

(Same host is fine locally; isolation is exercised in production with distinct hostnames.)
