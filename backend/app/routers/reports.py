from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Scan, User
from ..serializers import iso, scan_out, user_out

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{scan_id}")
def get_report(scan_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scan = db.scalar(select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id))
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return {**scan_out(scan, request), "patient": user_out(user), "generated_at": iso(datetime.now(timezone.utc))}
