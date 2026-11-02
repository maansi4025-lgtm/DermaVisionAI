from datetime import datetime, timezone

from fastapi import Request

from .models import Scan, User


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:  # SQLite returns naive datetimes; they are stored as UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "member_since": iso(user.created_at)[:10],
        "avatar_url": user.avatar_url,
    }


def scan_out(scan: Scan, request: Request) -> dict:
    base = str(request.base_url).rstrip("/")
    return {
        "id": scan.id,
        "scan_number": scan.scan_number,
        "image_url": f"{base}/media/{scan.image_path}",
        "gradcam_image_url": f"{base}/media/{scan.gradcam_path or scan.image_path}",
        "created_at": iso(scan.created_at),
        "prediction": scan.prediction,
        "risk_level": scan.risk_level,
        "confidence": scan.confidence,
        "top_classes": scan.top_classes,
        "insight": scan.insight,
        "is_demo": scan.is_demo,
    }
