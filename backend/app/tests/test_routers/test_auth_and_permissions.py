"""
Integration tests through the real ASGI app (httpx.AsyncClient, no real server
— Implementation Plan Section 9, "Router tests use httpx.AsyncClient").

`get_db` is overridden to hand out the test's own SQLite session instead of
opening a new one per request, so data seeded by fixtures is visible to the
route handlers.
"""
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.db import get_db
from app.main import app


@pytest_asyncio.fixture
async def client(db_session):
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_login_then_me(client, owner_user):
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "owner", "password": "test-password"}
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "owner"


@pytest.mark.asyncio
async def test_login_rejects_wrong_password(client, owner_user):
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "owner", "password": "wrong-password"}
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "unauthorized"


@pytest.mark.asyncio
async def test_protected_route_requires_token(client):
    resp = await client.get("/api/v1/skus/")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_role_without_permission_is_forbidden(client, db_session):
    """A role with zero permissions must be rejected by require_permission(...)."""
    from app.core.security import hash_password
    from app.models.user import Role, User

    role = Role(id=str(uuid.uuid4()), name="staff_no_access")
    db_session.add(role)
    await db_session.flush()
    user = User(
        id=str(uuid.uuid4()),
        username="restricted",
        hashed_password=hash_password("pw"),
        role_id=role.id,
    )
    db_session.add(user)
    await db_session.flush()

    login = await client.post("/api/v1/auth/login", json={"username": "restricted", "password": "pw"})
    token = login.json()["access_token"]

    resp = await client.get("/api/v1/skus/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert resp.json()["code"] == "permission_denied"


@pytest.mark.asyncio
async def test_create_and_list_sku(client, owner_user):
    login = await client.post(
        "/api/v1/auth/login", json={"username": "owner", "password": "test-password"}
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/skus/",
        json={"code": "SKU-1", "name": "Test Bra", "category": "Bra", "size_variant": "M"},
        headers=headers,
    )
    assert create.status_code == 201

    listing = await client.get("/api/v1/skus/", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["code"] == "SKU-1"


@pytest.mark.asyncio
async def test_duplicate_sku_code_rejected(client, owner_user):
    login = await client.post(
        "/api/v1/auth/login", json={"username": "owner", "password": "test-password"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    payload = {"code": "DUP-1", "name": "Test", "category": "c", "size_variant": "M"}

    first = await client.post("/api/v1/skus/", json=payload, headers=headers)
    assert first.status_code == 201

    second = await client.post("/api/v1/skus/", json=payload, headers=headers)
    assert second.status_code == 409
    assert second.json()["code"] == "duplicate_sku_code"
