import io
import math
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from PIL import Image, ImageOps
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import ChatSession, Scan, User
from ..serializers import scan_out
from ..services.classifier import ModelNotReady, classifier
from ..services.lesion_info import CLASS_INFO, assess_risk, build_insight
from ..services.media import remove_media

router = APIRouter(prefix="/api/scan", tags=["scan"])
settings = get_settings()
Image.MAX_IMAGE_PIXELS = 50_000_000  # guard against decompression bombs


def _read_image(file: UploadFile) -> tuple[Image.Image, bytes]:
    if file.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPG or PNG image")
    limit = settings.max_upload_mb * 1024 * 1024
    raw = file.file.read(limit + 1)
    if len(raw) > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"File exceeds {settings.max_upload_mb} MB")
    try:
        Image.open(io.BytesIO(raw)).verify()
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not read the image file")
    img.thumbnail((1024, 1024))
    return img, raw


@router.post("/upload", status_code=status.HTTP_201_CREATED)
def upload(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    img, raw = _read_image(file)
    try:
        probs, cam = classifier.predict(img, raw)
    except ModelNotReady as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))

    risk, top_code = assess_risk(probs)
    confidence = probs[top_code]
    ranked = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)[:3]
    insight = build_insight(top_code, confidence, risk)
    if classifier.demo:
        insight = "DEMO MODE: this is NOT a real prediction (no trained model is loaded). " + insight

    # Re-encoding as JPEG drops EXIF metadata (GPS, device info). Random names keep URLs unguessable.
    name = f"{uuid.uuid4().hex}.jpg"
    for sub in ("scans", "gradcam"):
        (settings.media_dir / sub).mkdir(parents=True, exist_ok=True)
    img.save(settings.media_dir / "scans" / name, "JPEG", quality=90)
    if cam is not None:
        cam.save(settings.media_dir / "gradcam" / name, "JPEG", quality=90)

    next_no = (db.scalar(select(func.max(Scan.scan_number)).where(Scan.user_id == user.id)) or 0) + 1
    scan = Scan(
        user_id=user.id,
        scan_number=next_no,
        image_path=f"scans/{name}",
        gradcam_path=f"gradcam/{name}" if cam is not None else None,
        prediction=CLASS_INFO[top_code][0],
        prediction_code=top_code,
        risk_level=risk,
        confidence=confidence,
        top_classes=[{"label": CLASS_INFO[c][0], "probability": round(p, 4)} for c, p in ranked],
        insight=insight,
        is_demo=classifier.demo,
    )
    db.add(scan)
    db.commit()
    return scan_out(scan, request)


@router.get("/history")
def history(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=50),
    search: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = select(Scan).where(Scan.user_id == user.id)
    if search.strip():
        q = q.where(Scan.prediction.ilike(f"%{search.strip()}%"))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Scan.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [scan_out(s, request) for s in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, math.ceil(total / page_size)),
    }


@router.get("/{scan_id}")
def get_scan(scan_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scan = db.scalar(select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id))
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    return scan_out(scan, request)


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scan(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Permanently delete one scan, its image files, and its link to any chat."""
    scan = db.scalar(select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id))
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    paths = (scan.image_path, scan.gradcam_path)
    db.execute(update(ChatSession).where(ChatSession.scan_id == scan.id).values(scan_id=None))
    db.delete(scan)
    db.commit()
    remove_media(*paths)