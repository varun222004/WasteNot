# WasteNot

**Good things deserve another life.** WasteNot is a hyperlocal community-sharing platform (pilot: Bengaluru) where people and verified organizations give away surplus food, books, clothes and household items, and post requests for things they need. Free, mobile-first, installable PWA.

This repository is fully self-contained: a React + TypeScript web app, a FastAPI + MongoDB API, docs, tests and CI. It has no runtime dependency on any app-builder platform.

## Repository layout

| Folder | What it is |
| --- | --- |
| `frontend/` | Web app (React 19, TypeScript, Vite, Tailwind, React Router, TanStack Query, React Hook Form, Zod). *(the "apps/web" package)* |
| `backend/` | REST API (FastAPI, Pydantic, PyMongo async, JWT, email OTP). *(the "apps/api" package)* |
| `docs/architecture/` | Architecture, modules, data model & collections |
| `docs/api/` | API overview (full interactive docs at `/api/docs`) |
| `docs/development/` | Local setup, environment variables, testing, deployment, troubleshooting |
| `.github/workflows/` | CI: API tests, type-check, unit tests, production build |

## Quick start (Windows, macOS, Linux)

Prerequisites: Node 20+, Python 3.12+, and MongoDB (local install, Docker `docker run -p 27017:27017 mongo:7`, or a free MongoDB Atlas cluster).

```bash
# API
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements-dev.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env  — then replace the three change-me secrets
uvicorn server:app --reload --port 8001     # or: uvicorn app.main:app --reload --port 8001

# Web (new terminal)
cd frontend
npm ci
copy .env.example .env          # leave VITE_API_URL empty: vite proxies /api to http://localhost:8001
npm run dev                     # http://localhost:5173
```

API docs: http://localhost:8001/api/docs · Health: http://localhost:8001/api/v1/health

Sign in with any email. With `DEV_OTP_ENABLED=true` (development only) the 6-digit code is shown on the sign-in screen; in production it is only emailed via SMTP. Emails listed in `ADMIN_EMAILS` get the admin role on sign-in.

Optional demo content: `cd backend && python -m scripts.seed_demo` (remove with `--purge`). Refuses to run in production.

See [docs/development/README.md](docs/development/README.md) for environment variables, deployment (Vercel/Netlify + Render/Railway/Fly.io + MongoDB Atlas) and troubleshooting.

## Feature summary

- Passwordless email OTP auth (10-minute codes, 5 attempts, resend cooldown & hourly limits), JWT access + rotating refresh tokens in HttpOnly cookies, logout / logout everywhere.
- Profiles with stats, badges, avatar, bio, locality, saved private location, blocked list.
- Listings (food, books, clothes, household — configurable) with 1–5 validated photos, condition, quantity, per-person limits, pickup windows, expiry, lifecycle (active/closed/expired/removed/completed), edit, close/reopen, remove, save, share, report.
- Food safety: cooked (≤12h after preparation) or sealed packaged within expiry only; mandatory disclosures, three-way allergen status, donor declaration, collection window ≤ safe-until, automatic expiry, `FOOD_SHARING_ENABLED` kill switch.
- Location privacy: public points rounded to ~1 km, exact pickup only revealed to the accepted receiver; verified organizations show their public address.
- Discovery: geospatial nearby search, radius, category, text search, nearest/recent sorting, load more.
- Reservations: requested → accepted/declined/expired/cancelled/no-show/disputed/completed/unconfirmed; atomic inventory (`available + reserved + collected = total`), 3 active max, 2h/24h response timeouts, late-cancel flag, no-show restriction (3 in 30 days → 7-day pause), dual confirmation, 48h unconfirmed rule, organization auto-accept and one-sided completion, disputes freeze inventory.
- Wanted requests with offers; accepting an offer creates an accepted reservation and opens a chat.
- Organizations: registration with private proof document, admin verification, auto-accept listings, dashboard.
- Messaging (polling), in-app notifications, reporting, blocking, admin console (reports, organizations, disputes, listings, members, moderation log), factual impact page, PWA manifest + service worker.

## Licence

See [LICENSE](LICENSE).
