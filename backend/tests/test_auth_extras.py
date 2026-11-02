import os, tempfile
_t = tempfile.mkdtemp()
os.environ.update(DATABASE_URL=f"sqlite:///{_t}/a.db", MEDIA_DIR=f"{_t}/m", ANTHROPIC_API_KEY="", GEMINI_API_KEY="", DEMO_MODE="true")

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _signup(client, email="r@example.com", pw="password123"):
    r = client.post("/api/auth/signup", json={"full_name": "Reset Person", "email": email, "password": pw})
    assert r.status_code == 201
    return r


def test_forgot_and_reset_password(client, monkeypatch):
    sent = []
    monkeypatch.setattr(auth_router, "send_email", lambda to, subj, body: sent.append((to, body)) or True)
    _signup(client)

    r = client.post("/api/auth/forgot-password", json={"email": "R@example.com"})
    assert r.status_code == 200 and "reset link" in r.json()["message"]
    assert len(sent) == 1 and sent[0][0] == "r@example.com"
    token = sent[0][1].split("token=")[1].split()[0]

    # unknown email: same response, no email sent
    r2 = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r2.json() == r.json() and len(sent) == 1

    assert client.post("/api/auth/reset-password", json={"token": "garbage-token-value", "password": "newpassword1"}).status_code == 400
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "newpassword1"}).status_code == 200

    assert client.post("/api/auth/login", json={"email": "r@example.com", "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "r@example.com", "password": "newpassword1"}).status_code == 200
    # the link is single-use
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "another12345"}).status_code == 400


def test_access_token_cannot_be_used_as_reset_token(client):
    tok = _signup(client, "x@example.com").json()["access_token"]
    assert client.post("/api/auth/reset-password", json={"token": tok, "password": "hackedpass1"}).status_code == 400


def test_google_not_configured(client):
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).status_code == 501


def test_google_login(client, monkeypatch):
    monkeypatch.setattr(auth_router.settings, "google_client_id", "client-id")
    info = {"email": "G.User@gmail.com", "email_verified": True, "name": "Gina User", "picture": "http://p/x.png"}
    monkeypatch.setattr(auth_router, "verify_google_token", lambda c: info)

    r = client.post("/api/auth/google", json={"credential": "x" * 20})
    assert r.status_code == 200 and r.json()["user"]["email"] == "g.user@gmail.com"
    assert r.json()["user"]["full_name"] == "Gina User" and "dv_refresh" in r.cookies
    r2 = client.post("/api/auth/google", json={"credential": "x" * 20})
    assert r2.json()["user"]["id"] == r.json()["user"]["id"]  # same account on second sign-in

    # existing password account is linked by verified email
    uid = _signup(client, "linked@example.com").json()["user"]["id"]
    info["email"] = "linked@example.com"
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).json()["user"]["id"] == uid

    info["email_verified"] = False
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).status_code == 401


def test_google_invalid_token(client, monkeypatch):
    monkeypatch.setattr(auth_router.settings, "google_client_id", "client-id")

    def bad(_):
        raise ValueError("bad token")

    monkeypatch.setattr(auth_router, "verify_google_token", bad)
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).status_code == 401
