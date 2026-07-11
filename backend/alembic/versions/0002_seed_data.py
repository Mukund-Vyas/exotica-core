"""seed permissions, owner role, channels, dead_stock_window setting

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-11

Implementation Plan Section 1.4: two things must exist before the system is
usable, and neither is created by the schema migration alone:
  - dead_stock_window (Epic C reads this from day one, even though the
    SystemSetting CRUD API isn't built until Epic E)
  - the permission/role reference data every `require_permission(...)` check
    depends on

The first user account (with its password) is intentionally NOT created here
— per Section 1.4 that's a one-time CLI step (`scripts/create_first_user.py`),
run once per environment after migrations, so a hashed credential never sits
in version control. This migration only creates the "owner" Role row that
script attaches the first user to.

Channels (Myntra, Zivame, Website, B2B) are BRD-fixed reference data (BRD
Section "Channel" glossary entry) — there's no create-channel endpoint in the
API by design, so they're seeded here rather than left for manual entry.
"""
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


# All permission codes referenced by app/routers/*.py require_permission(...) calls.
PERMISSION_CODES = [
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

CHANNELS = [
    ("myntra", "Myntra"),
    ("zivame", "Zivame"),
    ("website", "Website"),
    ("b2b", "B2B"),
]

DEAD_STOCK_WINDOW_DAYS = "45"


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    roles_t = sa.table("roles", sa.column("id", postgresql.UUID(as_uuid=False)), sa.column("name", sa.String))
    permissions_t = sa.table(
        "permissions", sa.column("id", postgresql.UUID(as_uuid=False)), sa.column("code", sa.String)
    )
    role_permissions_t = sa.table(
        "role_permissions",
        sa.column("role_id", postgresql.UUID(as_uuid=False)),
        sa.column("permission_id", postgresql.UUID(as_uuid=False)),
    )
    channels_t = sa.table(
        "channels",
        sa.column("id", postgresql.UUID(as_uuid=False)),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    settings_t = sa.table(
        "system_settings",
        sa.column("id", postgresql.UUID(as_uuid=False)),
        sa.column("key", sa.String),
        sa.column("value", sa.String),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    owner_role_id = str(uuid.uuid4())
    bind.execute(roles_t.insert().values(id=owner_role_id, name="owner"))

    permission_ids = {code: str(uuid.uuid4()) for code in PERMISSION_CODES}
    bind.execute(
        permissions_t.insert(),
        [{"id": permission_ids[code], "code": code} for code in PERMISSION_CODES],
    )
    bind.execute(
        role_permissions_t.insert(),
        [
            {"role_id": owner_role_id, "permission_id": permission_ids[code]}
            for code in PERMISSION_CODES
        ],
    )

    bind.execute(
        channels_t.insert(),
        [
            {"id": str(uuid.uuid4()), "code": code, "name": name, "is_active": True}
            for code, name in CHANNELS
        ],
    )

    bind.execute(
        settings_t.insert().values(
            id=str(uuid.uuid4()),
            key="dead_stock_window",
            value=DEAD_STOCK_WINDOW_DAYS,
            updated_at=now,
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM system_settings WHERE key = :key"), {"key": "dead_stock_window"})
    bind.execute(sa.text("DELETE FROM channels WHERE code = ANY(:codes)"), {"codes": [c for c, _ in CHANNELS]})
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE name = 'owner')"
        )
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE code = ANY(:codes)"), {"codes": PERMISSION_CODES})
    bind.execute(sa.text("DELETE FROM roles WHERE name = 'owner'"))
