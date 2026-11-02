import os, tempfile
_t = tempfile.mkdtemp()
os.environ.update(DATABASE_URL=f"sqlite:///{_t}/c.db", MEDIA_DIR=f"{_t}/m", CORS_ORIGINS='"http://localhost:5173/"')

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def preflight(client, origin, path="/api/auth/login"):
    return client.options(path, headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
    })


@pytest.mark.parametrize("origin", [
    "http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:4173", "http://localhost:3000",
])
def test_local_dev_origins_allowed(client, origin):
    for path in ("/api/auth/login", "/api/auth/signup", "/api/auth/logout"):
        r = preflight(client, origin, path)
        assert r.status_code == 200, (origin, path, r.text)
        assert r.headers["access-control-allow-origin"] == origin
        assert r.headers["access-control-allow-credentials"] == "true"


@pytest.mark.parametrize("origin", ["http://evil.com", "https://localhost.evil.com", "http://localhost.evil.com:5173"])
def test_other_origins_rejected(client, origin):
    assert preflight(client, origin).status_code == 400
