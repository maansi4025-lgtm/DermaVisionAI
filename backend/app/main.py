import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import Base, engine
from .routers import auth, chat, dashboard, reports, scan, user
from .services.chatbot import _provider as _chat_provider
from .services.classifier import classifier

settings = get_settings()
log = logging.getLogger("dermavision")
uvicorn_log = logging.getLogger("uvicorn.error")  # always printed in the terminal


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)  # use Alembic migrations once the schema stabilises
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    uvicorn_log.info(
        "CORS: allowing %s%s",
        ", ".join(settings.origins) or "(no fixed origins)",
        " + any localhost/127.0.0.1 port" if settings.allow_local_dev_origins else "",
    )
    if settings.jwt_secret == "dev-only-change-me":
        log.warning("JWT_SECRET is the insecure default. Set a real secret before deploying.")
    if classifier.has_weights:
        log.info("Trained model found at %s", settings.model_path)
    elif settings.demo_mode:
        log.warning("No trained model: running in DEMO_MODE (predictions are fake).")
    else:
        log.warning("No trained model and DEMO_MODE=false: /api/scan/upload will return 503.")
    yield


app = FastAPI(title="DermaVision AI API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_origin_regex=settings.origin_regex,
    allow_credentials=True,  # the frontend sends the refresh cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")

for r in (auth, user, scan, reports, dashboard, chat):
    app.include_router(r.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "model": "trained" if classifier.has_weights else ("demo" if settings.demo_mode else "missing"),
        "chatbot": "rule-based" if _chat_provider() == "none" else _chat_provider(),
        "google_login": bool(settings.google_client_id),
    }
