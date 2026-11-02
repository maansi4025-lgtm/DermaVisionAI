import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def _make_token(user_id: str, kind: str, expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "type": kind, "iat": now, "exp": now + expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    return _make_token(user_id, "access", timedelta(minutes=settings.access_token_minutes))


def create_refresh_token(user_id: str) -> str:
    return _make_token(user_id, "refresh", timedelta(days=settings.refresh_token_days))


def decode_token(token: str, expected_type: str) -> str | None:
    """Return the user id, or None if the token is invalid/expired/wrong type."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload.get("sub")


def _fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_reset_token(user_id: str, password_hash: str) -> str:
    """Reset token bound to the current password hash, so it stops working once the password changes."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "reset",
        "pwv": _fingerprint(password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=settings.reset_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_reset_token(token: str) -> tuple[str, str] | None:
    """Return (user_id, password fingerprint) or None."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "reset" or not payload.get("sub") or not payload.get("pwv"):
        return None
    return payload["sub"], payload["pwv"]


def password_fingerprint(password_hash: str) -> str:
    return _fingerprint(password_hash)
