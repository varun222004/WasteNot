# WasteNot API

FastAPI modular monolith. Entry point: `app/main.py` (`server.py` re-exports it).

```
app/
  core/        config (env), security (JWT/OTP hashing), deps (auth guards), catalog (categories, localities)
  db/          Mongo client + indexes, id/serialisation helpers
  services/    cross-cutting: storage abstraction, email, notifications, safety (blocks/restrictions), lifecycle sweep
  modules/     one package per domain, each with router (+ service/schemas where logic is non-trivial)
    auth users files listings reservations requests organizations messages notifications reports admin impact
tests/         pytest suite (uses its own throwaway database)
scripts/       seed_demo.py (dev only)
```

Run: `uvicorn server:app --reload --port 8001`. Docs at `/api/docs`. Tests: `pytest -q tests` (needs a reachable MongoDB; set `MONGODB_URI`).

Configuration lives entirely in environment variables — see `.env.example`.
