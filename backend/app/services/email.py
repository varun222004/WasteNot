"""Email delivery abstraction. EMAIL_PROVIDER=smtp for real delivery, console for local dev."""
import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("wastenot.email")


def _send_smtp(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, settings.smtp_from, to
    msg.set_content(body)
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            if settings.smtp_username:
                s.login(settings.smtp_username, settings.smtp_password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls()
            if settings.smtp_username:
                s.login(settings.smtp_username, settings.smtp_password)
            s.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> None:
    if settings.email_provider == "smtp":
        await asyncio.to_thread(_send_smtp, to, subject, body)
    else:
        # Console provider never logs message bodies (they may contain codes).
        logger.info("Email (console provider) to=%s subject=%s", to, subject)
