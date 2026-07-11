"""
Shared fixtures for service-layer tests.

Uses an in-memory SQLite database via the same `app.core.db.engine`/
`AsyncSessionLocal` machinery the app uses at runtime (including the SQLite
savepoint fix in app/core/db.py — see the comment there for why it's needed
for the bulk-order-entry all-or-nothing rollback test to be meaningful).

Note: SQLite is used here only because it needs no external service to run
tests against. It is NOT the production database (that's Postgres/asyncpg,
per Implementation Plan Section 1.1) — a couple of Postgres-only things
(native ENUM types, `ON CONFLICT`, etc.) aren't exercised by these tests.
"""
import os
import uuid

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL_DIRECT", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("CORS_ALLOWED_ORIGINS_RAW", "http://localhost:3000")

import pytest_asyncio  # noqa: E402

from app.core.db import AsyncSessionLocal, Base, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.product import Channel  # noqa: E402
from app.models.user import Permission, Role, RolePermission, User  # noqa: E402

ALL_PERMISSION_CODES = [
    "skus:read",
    "skus:write",
    "channels:read",
    "prices:write",
    "commissions:write",
    "purchases:read",
    "purchases:write",
    "orders:read",
    "orders:write",
    "returns:write",
    "receivables:read",
    "receivables:write",
    "reports:view",
    "settings:read",
    "settings:write",
]


@pytest_asyncio.fixture
async def db_session():
    """Fresh schema per test — cheap enough against SQLite in-memory, and keeps
    tests independent (no cross-test data leakage to reason about)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def owner_user(db_session) -> User:
    role = Role(id=str(uuid.uuid4()), name="owner")
    db_session.add(role)
    await db_session.flush()

    for code in ALL_PERMISSION_CODES:
        perm = Permission(id=str(uuid.uuid4()), code=code)
        db_session.add(perm)
        await db_session.flush()
        db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    user = User(
        id=str(uuid.uuid4()),
        username="owner",
        hashed_password=hash_password("test-password"),
        role_id=role.id,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user, attribute_names=["role"])
    await db_session.refresh(user.role, attribute_names=["permissions"])
    return user


@pytest_asyncio.fixture
async def channel(db_session) -> Channel:
    ch = Channel(id=str(uuid.uuid4()), code="myntra", name="Myntra")
    db_session.add(ch)
    await db_session.flush()
    return ch
