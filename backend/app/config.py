from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{BASE_DIR / 'dermavision.db'}"
    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cookie_secure: bool = False

    frontend_url: str = "http://localhost:5173"  # used to build password-reset links
    reset_token_minutes: int = 30

    # Google sign-in (OAuth client ID from Google Cloud Console; leave empty to disable)
    google_client_id: str = ""

    # Email for password resets. If smtp_host is empty the reset link is printed in the backend terminal instead.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    media_dir: Path = BASE_DIR / "media"
    model_path: Path = BASE_DIR / "weights" / "dermavision_effnet_b0.pt"
    demo_mode: bool = False
    max_upload_mb: int = 10

    anthropic_api_key: str = ""
    chat_model: str = "claude-sonnet-5-5"
    emergency_number: str = "112"

    # Chat provider: "auto" (Claude if its key is set, else Gemini if its key is set, else rule-based),
    # or force one of: anthropic | gemini | ollama | none
    llm_provider: str = "auto"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"  # if unavailable, the backend finds a working model itself
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # In development the frontend may run on localhost or 127.0.0.1 and on any port (Vite moves to 5174 if 5173 is busy).
    # Set ALLOW_LOCAL_DEV_ORIGINS=false in production so only CORS_ORIGINS is accepted.
    allow_local_dev_origins: bool = True

    @property
    def origins(self) -> list[str]:
        # tolerate quotes, spaces and trailing slashes in .env: "http://localhost:5173/" must equal "http://localhost:5173"
        return [o.strip().strip("\"'").rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def origin_regex(self) -> str | None:
        return r"https?://(localhost|127\.0\.0\.1)(:\d+)?" if self.allow_local_dev_origins else None


@lru_cache
def get_settings() -> Settings:
    return Settings()
