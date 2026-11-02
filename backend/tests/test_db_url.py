from app.database import normalize_db_url


def test_normalize_db_url():
    assert normalize_db_url("postgresql://u:p@h/db?sslmode=require") == "postgresql+psycopg2://u:p@h/db?sslmode=require"
    assert normalize_db_url("postgres://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"
    assert normalize_db_url("postgresql+psycopg2://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"
    assert normalize_db_url("sqlite:////tmp/x.db") == "sqlite:////tmp/x.db"  # absolute paths are left alone


def test_relative_sqlite_path_is_inside_backend_folder():
    from app.config import BASE_DIR

    assert normalize_db_url("sqlite:///./dermavision.db") == "sqlite:///" + (BASE_DIR / "dermavision.db").as_posix()
