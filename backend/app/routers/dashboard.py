from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Scan, User
from ..serializers import iso, scan_out
from ..services.classifier import classifier

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = db.scalar(select(func.count()).select_from(Scan).where(Scan.user_id == user.id)) or 0
    recent = db.scalars(
        select(Scan).where(Scan.user_id == user.id).order_by(Scan.created_at.desc()).limit(4)
    ).all()
    last = recent[0] if recent else None
    # Simple re-check reminder: sooner when the last scan was not low risk.
    follow_up = None
    if last:
        days = 30 if last.risk_level == "low" else 14
        follow_up = (last.created_at + timedelta(days=days)).date().isoformat()
    return {
        "total_scans": total,
        "last_scan_date": iso(last.created_at) if last else None,
        "next_follow_up": follow_up,
        "ai_analysis_available": classifier.available,
        "recent_scans": [scan_out(s, request) for s in recent],
    }
