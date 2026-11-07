# Development & deployment

## Environment variables

### API (`backend/.env`, see `.env.example`)

| Variable | Required | Notes |
| --- | --- | --- |
| `ENVIRONMENT` | yes | `development` or `production` |
| `MONGODB_URI`, `DATABASE_NAME` | yes | Atlas: *Connect → Drivers → Python*. (`MONGO_URL`/`DB_NAME` also accepted.) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OTP_PEPPER` | yes | long random strings, different from each other |
| `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` | no | default 30 / 30 |
| `COOKIE_SECURE`, `COOKIE_SAMESITE` | prod | `true`; use `none` when web and API are on different sites |
| `DEV_OTP_ENABLED` | dev | shows codes on screen; **startup fails if true in production** |
| `EMAIL_PROVIDER` + `SMTP_*` | prod | `smtp` required in production (any SMTP: Gmail app password, Brevo, SES, Postmark, Mailgun…) |
| `FRONTEND_URL`, `CORS_ORIGINS` | yes | comma-separated allowed web origins |
| `UPLOAD_STORAGE_PROVIDER`, `UPLOAD_DIR` | no | `local` (default). Use a persistent disk in production, or add an S3 provider |
| `ADMIN_EMAILS` | yes | comma-separated; these accounts become admins on sign-in |
| `FOOD_SHARING_ENABLED` | no | set `false` to hide and block all food listings |

### Web (`frontend/.env`)

`VITE_API_URL` — API origin, e.g. `https://wastenot-api.onrender.com`.

## Tests

- API: `cd backend && pytest -q tests` (creates and drops its own `wastenot_test_*` database). Covers auth (OTP, expiry, attempts, reuse), location privacy, reservation lifecycle & inventory, concurrency (no overselling), blocking, wanted offers, reports & admin suspension, food rules, organization verification & completion, messaging access.
- Web: `cd frontend && npm test` (Vitest + Testing Library), `npm run typecheck`.
- E2E: `npx playwright install` once, start API (with `DEV_OTP_ENABLED=true`) and web, then `npm run e2e`.

## Deploying

### Database — MongoDB Atlas
Create a cluster, a database user, allow your API host's IPs (or 0.0.0.0/0 with a strong password), copy the connection string into `MONGODB_URI`. Indexes are created automatically on API startup.

### API — Render / Railway / Fly.io
- Root directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Health check path: `/api/v1/health`
- Set all API env vars (`ENVIRONMENT=production`, `DEV_OTP_ENABLED=false`, `COOKIE_SECURE=true`, SMTP, secrets, `CORS_ORIGINS=https://your-web-domain`).
- Uploaded files: attach a persistent disk and point `UPLOAD_DIR` to it, or implement an S3-compatible provider in `app/services/storage.py`.

### Web — Vercel / Netlify / any static host
- Root directory: `frontend`, build `npm run build`, output `dist`.
- Env: `VITE_API_URL=https://your-api-domain`.
- SPA fallback is configured (`vercel.json`, `public/_redirects`).

**Cookies across domains:** best is a shared parent domain (`wastenot.in` + `api.wastenot.in`) with `COOKIE_SAMESITE=lax`. If you must use two unrelated domains (`*.vercel.app` + `*.onrender.com`), set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`; some browsers block third-party cookies, so a shared domain is strongly recommended.

## Troubleshooting

- **API exits on start with `KeyError`** — a required env var (e.g. `JWT_SECRET`) is missing.
- **`RuntimeError: DEV_OTP_ENABLED must be false in production`** — by design.
- **Signed in but immediately signed out** — cookie not stored: check HTTPS + `COOKIE_SECURE`, `COOKIE_SAMESITE`, and that `CORS_ORIGINS` contains the exact web origin.
- **Nearby search returns nothing** — the 2dsphere index is created at startup; confirm the API connected to the right database.
- **Images 404 after redeploy** — `local` storage on an ephemeral filesystem; use a persistent disk or object storage.
