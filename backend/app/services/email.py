import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

log = logging.getLogger("dermavision.email")
settings = get_settings()


def send_email(to: str, subject: str, body: str) -> bool:
    """Send via SMTP. With no SMTP configured, print the message to the backend terminal (dev mode)."""
    if not settings.smtp_host:
        log.warning("SMTP is not configured, so no email was sent. Message for %s:\n--- %s ---\n%s", to, subject, body)
        return False
    msg = EmailMessage()
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        if settings.smtp_port == 465:
            smtp = smtplib.SMTP_SSL(settings.smtp_host, 465, timeout=15)
        else:
            smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
            smtp.starttls()
        with smtp:
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return True
    except Exception:
        log.exception("Failed to send email to %s", to)
        return False
