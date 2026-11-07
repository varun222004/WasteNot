# WasteNot — PRD

## Original problem statement
"WasteNot — Complete Product Build & Engineering Master Prompt": build a functional, production-structured, portable MVP of WasteNot, a hyperlocal community-sharing platform (pilot Bengaluru, launch target 13 Dec 2026, free, mobile-first PWA). Requirements: email OTP auth (10-min expiry, 5 attempts, rate limiting, JWT access + refresh, dev-only OTP), profiles, listings (food/books/clothes/household, 1–5 images, lifecycle), strict food-safety rules, location privacy, discovery/search, reservations with atomic inventory and full lifecycle rules, wanted requests with offers, organizations with verification, messaging, notifications, reporting/blocking/admin, factual impact, PWA, MongoDB collections & indexes, versioned REST API with OpenAPI, env-based config, independent deployment (Vercel/Netlify + Render/Railway/Fly + Atlas), no Emergent branding or lock-in, docs and tests. Design tokens: Soft White #E8E9DF, Warm Background #F7F4EC, Deep Olive #2E3D28, Sage #A9B887, Amber #E39B2D, Walnut #5A3E2B, Danger #B3412E, text #282923/#77786E, border #E5E0D5; Fraunces + Inter.

User choices: dev OTP shown on screen in dev mode only (never in production); file storage = Emergent managed storage (implemented behind a swappable storage abstraction; `local` provider is the default outside the preview).

## Architecture
- frontend/ (= apps/web): React 19 + TS + Vite + Tailwind, React Router, TanStack Query, RHF + Zod, lucide. Service worker + manifest.
- backend/ (= apps/api): FastAPI modular monolith (`app/modules/*`), PyMongo AsyncMongoClient, JWT in HttpOnly cookies (Bearer also accepted), background lifecycle sweep.
- docs/ (architecture, api, development/deploy), .github/workflows/ci.yml, LICENSE (proprietary placeholder).

## Personas
Individual givers/receivers; verified organizations (restaurants, NGOs, campuses); WasteNot admins/moderators.

## Implemented (2026-11-07)
- All P0 modules + P1 (messaging via polling, notifications, impact, PWA, filters, org dashboard).
- Backend pytest suite 15/15 passing; testing agent e2e iteration_1 passed all flows.
- Post-test fixes: auth guard waits for session load; blocked users see a disabled Reserve button; owner sees private pickup details; admin reports show target name/owner; mobile hero spacing.
- Demo seed script (scripts/seed_demo.py, is_demo flag, refuses production).

## Backlog
- P1: Organization withdraw/delete; email notifications; S3-compatible storage provider; per-person limits UI for org distributions.
- P2: Google/phone auth, maps, ratings, real-time messaging, analytics, languages, native apps.

## Next tasks
- Configure SMTP + production secrets, deploy to own hosting.
