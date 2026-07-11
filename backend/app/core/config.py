"""
Typed application settings, loaded from environment variables / .env.

FastAPI-idiomatic replacement for django-environ, per Implementation Plan Section 1.2.
"""
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _ensure_asyncpg(url: str) -> str:
    """
    Neon's dashboard (and most Postgres tooling) hands out connection strings as
    plain `postgresql://...`, which SQLAlchemy loads with the sync `psycopg2`
    driver by default. This app is async-only (Implementation Plan Section 1.1/9)
    and requires `asyncpg`, so normalize the scheme here instead of relying on
    every environment's .env being hand-edited correctly — a plain
    `postgresql://` or `postgres://` URL silently becomes `postgresql+asyncpg://`.
    Explicit `+asyncpg` (or a non-Postgres URL, e.g. sqlite+aiosqlite for tests)
    passes through unchanged.
    """
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    return url


class Settings(BaseSettings):
    # --- Database ---
    database_url: str  # pooled connection, used by the running app (asyncpg)
    database_url_direct: str = ""  # direct connection, used by Alembic only

    # --- Auth ---
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_minutes: int = 10080  # 7 days

    # --- CORS ---
    # Plain comma-separated string from the environment (pydantic-settings tries to
    # JSON-decode `list[str]` env vars directly, which breaks on a plain CSV value —
    # so this is parsed manually via the `cors_allowed_origins` property below).
    cors_allowed_origins_raw: str = ""

    # --- Business defaults (bootstrap only — live value lives in SystemSetting, see Section 1.4) ---
    dead_stock_window_days: int = 45

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("database_url", "database_url_direct")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        return _ensure_asyncpg(v) if v else v

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
