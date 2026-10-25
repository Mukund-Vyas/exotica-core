"""
Async SQLAlchemy engine + session factory.

Uses the pooled Neon connection for app runtime traffic (Implementation Plan Section 1.1).
Async-first throughout — never mix sync SQLAlchemy calls into this app (Section 9, Async discipline).
"""
import os
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Tests run each case on its own event loop; asyncpg connections can't be reused
# across loops, so the test suite opts out of pooling with DB_NULL_POOL=1.
_engine_kwargs = {"poolclass": NullPool} if os.getenv("DB_NULL_POOL") else {}

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    **_engine_kwargs,
)

if engine.sync_engine.dialect.name == "sqlite":
    # pysqlite/aiosqlite quirk (documented in SQLAlchemy's own docs, "Serializable
    # isolation / Savepoints" section): the DBAPI driver does its own implicit
    # BEGIN/COMMIT handling underneath SQLAlchemy, which silently breaks nested
    # transactions (SAVEPOINT) — a `begin_nested()` block that rolls back on
    # error can leave *earlier* savepoints in the same transaction committed to
    # disk instead of staying pending. This only affects local dev/testing
    # against SQLite (e.g. the bulk order-entry all-or-nothing rollback in
    # services/orders.py) — the asyncpg/Postgres driver used in every real
    # environment does not have this issue. Disabling the driver's own
    # transaction management here makes SQLAlchemy's SAVEPOINT/rollback
    # semantics behave correctly under SQLite too, so local smoke tests are
    # trustworthy.
    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_disable_pysqlite_txn_handling(dbapi_connection, connection_record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine.sync_engine, "begin")
    def _sqlite_emit_begin(conn):
        conn.exec_driver_sql("BEGIN")

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency: yields a request-scoped async session.

    Commits once at the end of a successful request; rolls back on any raised
    exception. Services only `flush()`, never `commit()` — this dependency owns
    the transaction boundary so a route (e.g. bulk order entry) can build up
    several service calls and either have all of them land together or none at
    all.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
