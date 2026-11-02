from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import ChatSession, Scan, User
from ..schemas import ProfileUpdate
from ..serializers import user_out
from ..services.media import remove_media
from .auth import COOKIE

router = APIRouter(prefix="/api/user", tags=["user"])


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user)):
    return user_out(user)


@router.put("/profile")
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.email is not None and body.email.lower() != user.email:
        email = body.email.lower()
        if db.scalar(select(User).where(User.email == email)):
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
        user.email = email
    db.commit()
    return user_out(user)


class DeleteAccountIn(BaseModel):
    confirm: str


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteAccountIn,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the account with all scans, images and chats. The body must be {"confirm": "DELETE"}."""
    if body.confirm.strip() != "DELETE":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type DELETE to confirm")
    paths: list[str | None] = []
    for scan in db.scalars(select(Scan).where(Scan.user_id == user.id)):
        paths += [scan.image_path, scan.gradcam_path]
    # Chats first: they reference scans, and not every database enforces ON DELETE CASCADE.
    for chat in db.scalars(select(ChatSession).where(ChatSession.user_id == user.id)).all():
        db.delete(chat)
    db.flush()
    db.delete(user)  # scans go with it (cascade on the relationship)
    db.commit()
    remove_media(*paths)
    response.delete_cookie(COOKIE, path="/api/auth")