# Architecture

## Overview

```
Browser (PWA, React)  ──HTTPS/JSON──►  FastAPI (/api/v1/*)  ──►  MongoDB
        │  HttpOnly cookies (access 30m, refresh 30d, rotated)        │
        └── images via /api/v1/files/{id}  ◄── Storage provider (local disk | pluggable)
```

- **Modular monolith.** Each domain is a package under `backend/app/modules/` with its own router; heavier domains (listings, reservations) have a `service.py` holding business rules so routers stay thin.
- **Lifecycle sweep.** `services/sweep.py` runs every `SWEEP_INTERVAL_SECONDS` inside the API process: expires listings and food past safe-until, expires unanswered reservations (releasing inventory), marks one-sided confirmations older than 48h as `unconfirmed`, expires wanted requests. Safe to run on multiple instances (every transition is a guarded atomic update). For serverless hosting, call `sweep_once()` from a scheduled job instead.
- **Inventory integrity.** Every quantity movement is a single `$inc` guarded by a filter (`available >= q`), and every reservation state change is a `find_one_and_update` guarded by the expected current state. Concurrent requests cannot oversell or double-transition.
- **Privacy.** Listings store `public_point` (rounded to 2 decimals ≈ 1.1 km) separately from `private_location`. Public serializers never include `private_location`; the reservation endpoint reveals it only to the receiver once accepted.
- **Storage abstraction.** `services/storage.py` exposes `put/get`; `local` writes to disk. Add S3/R2/GCS by implementing the same two methods.
- **Extensibility.** Listing `mode` (giveaway/food) is a string enum ready for `sell`, `rent`, `borrow`; categories and localities are config in `core/catalog.py`.

## Collections

| Collection | Purpose | Key fields / indexes |
| --- | --- | --- |
| users | members | `email` unique; role, status, stats{given,received,completed}, restricted_until, saved_location (private) |
| otp_records | one active code per email | `email` unique; code_hash (HMAC), attempts, expires_at, sends[]; TTL on purge_at |
| sessions | refresh-token sessions | `jti` unique; token_hash, revoked; TTL on expires_at |
| files | uploaded file metadata | owner_id, purpose, storage_path, private (proof docs) |
| listings | items/food | status+category+created_at; 2dsphere on public_point; owner_id; expires_at; available/reserved/collected/quantity_total; food{} |
| reservations | exchanges | requester_id+status, listing_id+status, owner_id+status, status+respond_by; history[] |
| wanted_requests | requests | status+created_at |
| request_offers | offers on requests | request_id+status |
| conversations | 1 per accepted reservation | participants; unread{userId:n}; read_only |
| messages | chat messages | conversation_id+created_at |
| notifications | in-app | user_id+read+created_at |
| reports | moderation queue | status+created_at; priority |
| blocks | user blocks | blocker_id+blocked_id unique |
| organizations | org accounts | owner_id unique; status (pending/verified/rejected/suspended); proof_file_id (admin only) |
| moderation_actions | audit log | admin_id, action, target |
| exchange_events | completed exchanges (impact source of truth) | created_at |

IDs are UUID hex strings stored in `_id` and exposed as `id`. Dates are timezone-aware UTC.

## Reservation state machine

```
requested ──accept──► accepted ──both confirm / org confirms──► completed
    │ decline/cancel/timeout          │ cancel ► cancelled     │ no_show ► no_show
    ▼                                 │ dispute ► disputed ──admin──► completed | cancelled
 declined / cancelled / expired       └ one-sided confirm > 48h ► unconfirmed (not counted)
```
