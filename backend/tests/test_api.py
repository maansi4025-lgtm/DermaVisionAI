import io
import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.update(
    DATABASE_URL=f"sqlite:///{_tmp}/test.db",
    MEDIA_DIR=f"{_tmp}/media",
    MODEL_PATH=f"{_tmp}/none.pt",
    DEMO_MODE="true",
    ANTHROPIC_API_KEY="",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.main import app  # noqa: E402
from app.services.chatbot import triage  # noqa: E402
from app.services.lesion_info import assess_risk  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (150, 90, 80)).save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def auth(client):
    r = client.post("/api/auth/signup", json={"full_name": "Test User", "email": "T@Example.com", "password": "password123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_auth_flow(client, auth):
    assert client.post("/api/auth/signup", json={"full_name": "X Y", "email": "t@example.com", "password": "password123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "t@example.com", "password": "wrongpass1"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "t@example.com", "password": "password123"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "t@example.com"
    assert "dv_refresh" in r.cookies
    assert client.post("/api/auth/refresh").json()["access_token"]  # cookie round-trip
    assert client.get("/api/user/profile").status_code == 401
    assert client.get("/api/user/profile", headers=auth).json()["full_name"] == "Test User"
    assert client.put("/api/user/profile", json={"full_name": "New Name"}, headers=auth).json()["full_name"] == "New Name"


def test_scan_flow(client, auth):
    bad = client.post("/api/scan/upload", files={"file": ("a.txt", b"hello", "text/plain")}, headers=auth)
    assert bad.status_code == 415
    corrupt = client.post("/api/scan/upload", files={"file": ("a.png", b"not an image", "image/png")}, headers=auth)
    assert corrupt.status_code == 400
    for _ in range(2):
        r = client.post("/api/scan/upload", files={"file": ("a.png", _png(), "image/png")}, headers=auth)
        assert r.status_code == 201, r.text
    scan = r.json()
    assert scan["scan_number"] == 2 and scan["is_demo"] and scan["insight"].startswith("DEMO MODE")
    assert len(scan["top_classes"]) == 3 and 0 < scan["confidence"] <= 1
    assert scan["created_at"].endswith("Z")
    hist = client.get("/api/scan/history?page_size=1", headers=auth).json()
    assert hist["total"] == 2 and hist["total_pages"] == 2 and len(hist["items"]) == 1
    assert client.get(f"/api/scan/{scan['id']}", headers=auth).json()["id"] == scan["id"]
    assert client.get(f"/api/reports/{scan['id']}", headers=auth).json()["patient"]["email"] == "t@example.com"
    stats = client.get("/api/dashboard/stats", headers=auth).json()
    assert stats["total_scans"] == 2 and len(stats["recent_scans"]) == 2
    assert client.get(scan["image_url"].replace("http://testserver", "")).status_code == 200


def test_scans_are_private(client, auth):
    other = client.post("/api/auth/signup", json={"full_name": "Other Person", "email": "o@example.com", "password": "password123"})
    h2 = {"Authorization": f"Bearer {other.json()['access_token']}"}
    sid = client.get("/api/scan/history", headers=auth).json()["items"][0]["id"]
    assert client.get(f"/api/scan/{sid}", headers=h2).status_code == 404
    assert client.get("/api/scan/history", headers=h2).json()["total"] == 0


def test_chat_flow(client, auth):
    r = client.post("/api/chat/message", json={"message": "hi"}, headers=auth).json()
    sid = r["session_id"]
    assert r["urgency"] == "routine" and "What have you noticed" in r["reply"]
    r = client.post("/api/chat/message", json={"message": "a mole on my arm for 3 months, no itching, not changed, little sun", "session_id": sid}, headers=auth).json()
    assert r["urgency"] == "routine" and not r["emergency"]
    r = client.post("/api/chat/message", json={"message": "it started bleeding last week", "session_id": sid}, headers=auth).json()
    assert r["urgency"] == "urgent" and "bleeding" in r["red_flags"]
    sess = client.get(f"/api/chat/sessions/{sid}", headers=auth).json()
    assert len(sess["messages"]) == 6 and sess["urgency"] == "urgent"
    assert client.get(f"/api/chat/sessions/{sid}").status_code == 401


def test_chat_emergency_skips_llm(client, auth):
    r = client.post("/api/chat/message", json={"message": "my lips are swelling and I can't breathe properly after a rash"}, headers=auth).json()
    assert r["emergency"] and "112" in r["reply"] and r["urgency"] == "urgent"


def test_triage_negation_and_risk():
    assert triage("there is no bleeding and it doesn't itch")[1] == "routine"
    assert triage("I take blood pressure tablets")[1] == "routine"
    assert triage("the spot is getting darker")[1] == "soon"
    # malignant probability mass escalates risk even when top-1 is a benign class
    assert assess_risk({"nv": 0.6, "mel": 0.3, "bcc": 0.0, "akiec": 0.0, "bkl": 0.1, "df": 0.0, "vasc": 0.0})[0] == "high"
    assert assess_risk({"nv": 0.95, "mel": 0.02, "bcc": 0.0, "akiec": 0.0, "bkl": 0.03, "df": 0.0, "vasc": 0.0})[0] == "low"
    assert assess_risk({"nv": 0.4, "mel": 0.1, "bcc": 0.0, "akiec": 0.1, "bkl": 0.2, "df": 0.1, "vasc": 0.1})[0] == "medium"
def _signup_headers(client, email):
    r = client.post("/api/auth/signup", json={"full_name": "Del Person", "email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _upload(client, headers):
    r = client.post("/api/scan/upload", files={"file": ("a.png", _png(), "image/png")}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_delete_scan(client):
    h = _signup_headers(client, "del1@example.com")
    other = _signup_headers(client, "del2@example.com")
    scan = _upload(client, h)
    path = scan["image_url"].replace("http://testserver", "")
    assert client.get(path).status_code == 200
    # a chat attached to the scan must survive the deletion
    chat = client.post("/api/chat/message", json={"message": "hello", "scan_id": scan["id"], "lang": "en"}, headers=h)
    assert chat.status_code == 200

    assert client.delete(f"/api/scan/{scan['id']}", headers=other).status_code == 404  # not yours
    assert client.delete(f"/api/scan/{scan['id']}").status_code == 401
    assert client.delete(f"/api/scan/{scan['id']}", headers=h).status_code == 204
    assert client.get(f"/api/scan/{scan['id']}", headers=h).status_code == 404
    assert client.get(path).status_code == 404  # image file removed
    assert client.delete(f"/api/scan/{scan['id']}", headers=h).status_code == 404
    assert client.get("/api/scan/history", headers=h).json()["total"] == 0


def test_delete_account(client):
    h = _signup_headers(client, "del3@example.com")
    scan = _upload(client, h)
    path = scan["image_url"].replace("http://testserver", "")
    assert client.post("/api/chat/message", json={"message": "hi", "scan_id": scan["id"], "lang": "en"}, headers=h).status_code == 200

    assert client.request("DELETE", "/api/user/me", json={"confirm": "nope"}, headers=h).status_code == 400
    assert client.get("/api/user/profile", headers=h).status_code == 200  # still there
    assert client.request("DELETE", "/api/user/me", json={"confirm": "DELETE"}, headers=h).status_code == 204
    assert client.get("/api/user/profile", headers=h).status_code == 401
    assert client.get(path).status_code == 404
    assert client.post("/api/auth/login", json={"email": "del3@example.com", "password": "password123"}).status_code == 401