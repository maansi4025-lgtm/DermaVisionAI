import logging
import secrets

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import User
from ..schemas import ForgotIn, GoogleIn, LoginIn, ResetIn, SignupIn
from ..security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_reset_token,
    decode_token,
    hash_password,
    password_fingerprint,
    verify_password,
)
from ..serializers import user_out
from ..services.email import send_email
from ..services.google_auth import verify_google_token

log = logging.getLogger("dermavision.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()
COOKIE = "dv_refresh"
_DUMMY_HASH = hash_password("dummy-password-for-timing")


def _auth_response(user: User, response: Response) -> dict:
    # Refresh token lives in an httpOnly cookie (invisible to JS); access token is returned in the body
    # and kept in memory by the frontend.
    response.set_cookie(
        COOKIE,
        create_refresh_token(user.id),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_days * 86400,
        path="/api/auth",
    )
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "user": user_out(user)}


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(full_name=body.full_name.strip(), email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return _auth_response(user, response)


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return _auth_response(user, response)


@router.post("/refresh")
def refresh(response: Response, dv_refresh: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    user_id = decode_token(dv_refresh, "refresh") if dv_refresh else None
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return _auth_response(user, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/api/auth")


@router.post("/forgot-password")
def forgot_password(body: ForgotIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    # Always the same answer, so the endpoint cannot be used to discover which emails have accounts.
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user:
        token = create_reset_token(user.id, user.password_hash)
        link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
        text = (
            f"Hi {user.full_name.split()[0]},\n\n"
            "We received a request to reset your DermaVision AI password. "
            f"Open this link within {settings.reset_token_minutes} minutes to choose a new one:\n\n{link}\n\n"
            "If you did not ask for this, you can ignore this email."
        )
        background.add_task(send_email, user.email, "Reset your DermaVision AI password", text)
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    invalid = HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired")
    decoded = decode_reset_token(body.token)
    if not decoded:
        raise invalid
    user_id, fingerprint = decoded
    user = db.get(User, user_id)
    if not user or password_fingerprint(user.password_hash) != fingerprint:  # unknown user, or link already used
        raise invalid
    user.password_hash = hash_password(body.password)
    db.commit()
    return {"message": "Password updated. You can now log in."}


@router.post("/google")
def google_login(body: GoogleIn, response: Response, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google sign-in is not configured on the server")
    try:
        info = verify_google_token(body.credential)
    except Exception:
        log.warning("Google token verification failed", exc_info=True)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified")
    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your Google email is not verified")

    email = info["email"].lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(
            full_name=(info.get("name") or email.split("@")[0])[:120],
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),  # unusable; they can set one via "Forgot password"
            avatar_url=info.get("picture"),
        )
        db.add(user)
        db.commit()
    return _auth_response(user, response)
