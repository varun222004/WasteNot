"""Central configuration. Every value comes from environment variables (see .env.example)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)


def _bool(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes")


def _list(name: str) -> list[str]:
    return [v.strip() for v in os.environ.get(name, "").split(",") if v.strip()]


class Settings:
    environment = os.environ.get("ENVIRONMENT", "development").strip().lower()
    # MONGODB_URI / DATABASE_NAME are canonical; MONGO_URL / DB_NAME accepted for compatibility.
    mongodb_uri = os.environ.get("MONGODB_URI") or os.environ["MONGO_URL"]
    database_name = os.environ.get("DATABASE_NAME") or os.environ["DB_NAME"]

    jwt_secret = os.environ["JWT_SECRET"]
    jwt_refresh_secret = os.environ["JWT_REFRESH_SECRET"]
    otp_pepper = os.environ["OTP_PEPPER"]
    access_token_minutes = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    refresh_token_days = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
    cookie_secure = _bool("COOKIE_SECURE")
    cookie_samesite = os.environ.get("COOKIE_SAMESITE", "lax").lower()

    # Development-only OTP echo. Refused at startup when ENVIRONMENT=production.
    dev_otp_enabled = _bool("DEV_OTP_ENABLED")

    email_provider = os.environ.get("EMAIL_PROVIDER", "console").lower()
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_username = os.environ.get("SMTP_USERNAME")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    smtp_from = os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USERNAME")
    smtp_use_ssl = _bool("SMTP_USE_SSL")

    frontend_url = os.environ.get("FRONTEND_URL", "")
    cors_origins = _list("CORS_ORIGINS") or ([frontend_url] if frontend_url else [])

    storage_provider = os.environ.get("UPLOAD_STORAGE_PROVIDER", "local").lower()
    upload_dir = os.environ.get("UPLOAD_DIR", str(Path(__file__).resolve().parents[2] / "uploads"))
    storage_prefix = os.environ.get("UPLOAD_STORAGE_PREFIX", "wastenot")

    admin_emails = [e.lower() for e in _list("ADMIN_EMAILS")]
    food_sharing_enabled = _bool("FOOD_SHARING_ENABLED", "true")
    sweep_interval_seconds = int(os.environ.get("SWEEP_INTERVAL_SECONDS", "60"))

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def validate(self) -> None:
        if self.is_production:
            if self.dev_otp_enabled:
                raise RuntimeError("DEV_OTP_ENABLED must be false in production")
            if self.email_provider != "smtp" or not (self.smtp_host and self.smtp_from):
                raise RuntimeError("SMTP email must be configured in production")
            if not self.cookie_secure:
                raise RuntimeError("COOKIE_SECURE must be true in production")


settings = Settings()
