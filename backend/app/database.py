from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import BASE_DIR, get_settings



def normalize_db_url(url: str) -> str:
    """Hosted providers (Neon, Supabase, Render...) give 'postgresql://' or 'postgres://' URLs. SQLAlchemy would then
    look for the psycopg v3 driver, but this project uses psycopg2, so name the driver explicitly."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    if url.startswith("sqlite:///./"):  # "./x.db" would otherwise depend on which folder uvicorn was started from
        return "sqlite:///" + (BASE_DIR / url[len("sqlite:///./"):]).as_posix()
    return url


_url = normalize_db_url(get_settings().database_url.strip())
engine = create_engine(
    _url,
    connect_args={"check_same_thread": False} if _url.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
