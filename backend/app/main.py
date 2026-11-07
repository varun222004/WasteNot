import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.mongo import client, ensure_indexes
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.files.router import router as files_router
from app.modules.impact.router import router as impact_router
from app.modules.listings.router import router as listings_router
from app.modules.messages.router import router as messages_router
from app.modules.notifications.router import router as notifications_router
from app.modules.organizations.router import router as organizations_router
from app.modules.reports.router import router as reports_router
from app.modules.requests.router import router as requests_router
from app.modules.reservations.router import router as reservations_router
from app.modules.users.router import router as users_router
from app.services.sweep import sweep_forever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings.validate()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await client.admin.command("ping")
    await ensure_indexes()
    task = asyncio.create_task(sweep_forever())
    yield
    task.cancel()


app = FastAPI(title="WasteNot API", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs", redoc_url="/api/redoc", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix="/api/v1")
for r in (auth_router, users_router, files_router, listings_router, reservations_router, requests_router,
          organizations_router, messages_router, notifications_router, reports_router, admin_router, impact_router):
    api.include_router(r)


@api.get("/health", tags=["health"])
async def health():
    await client.admin.command("ping")
    return {"status": "ok", "environment": settings.environment, "database": "connected"}


app.include_router(api)
