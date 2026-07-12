"""add parties table, orders.party_id, and parties:read/write permissions

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-12

Free-text party_name on orders let the same B2B customer fragment into
multiple spellings ("Mahavir Textile" / "mahavir textile" / "Mahavir Textiles")
across orders/receivables, breaking any attempt to filter or aggregate by
customer. This adds a proper Party master:

  - `parties` table, with a case-insensitive unique index so "Mahavir Textile"
    and "mahavir textile" can't both be created.
  - `orders.party_id` FK, nullable (only meaningful for B2B/credit orders).
    `orders.party_name` is left in place as a write-once snapshot of
    Party.name at order time — same pattern as selling_price_at_sale etc.
    (see app/models/transaction.py) — so a later party rename doesn't rewrite
    historical orders/reports.
  - No backfill of party_id on existing orders: pre-existing free-text
    party_name values are not auto-matched to a Party row, since a fuzzy
    match here could silently merge two different customers. Existing orders
    keep their party_name text but show up as "no party" for filtering
    purposes until someone re-attributes them, if ever needed.
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

NEW_PERMISSION_CODES = ["parties:read", "parties:write"]


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "parties",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_by_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Case-insensitive uniqueness: the plain unique=True above only stops
    # byte-identical duplicates. This is the actual dedup guarantee.
    op.execute("CREATE UNIQUE INDEX ix_parties_name_lower ON parties (lower(name))")

    op.add_column(
        "orders",
        sa.Column("party_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("parties.id"), nullable=True),
    )
    op.create_index("ix_orders_party_id", "orders", ["party_id"])

    # Grant the two new permissions to the existing "owner" role, same pattern
    # as 0002_seed_data.py.
    permissions_t = sa.table(
        "permissions", sa.column("id", postgresql.UUID(as_uuid=False)), sa.column("code", sa.String)
    )
    role_permissions_t = sa.table(
        "role_permissions",
        sa.column("role_id", postgresql.UUID(as_uuid=False)),
        sa.column("permission_id", postgresql.UUID(as_uuid=False)),
    )
    owner_role_id = bind.execute(sa.text("SELECT id FROM roles WHERE name = 'owner'")).scalar_one()

    permission_ids = {code: str(uuid.uuid4()) for code in NEW_PERMISSION_CODES}
    bind.execute(
        permissions_t.insert(),
        [{"id": permission_ids[code], "code": code} for code in NEW_PERMISSION_CODES],
    )
    bind.execute(
        role_permissions_t.insert(),
        [{"role_id": owner_role_id, "permission_id": permission_ids[code]} for code in NEW_PERMISSION_CODES],
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = ANY(:codes))"
        ),
        {"codes": NEW_PERMISSION_CODES},
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE code = ANY(:codes)"), {"codes": NEW_PERMISSION_CODES})
    op.drop_index("ix_orders_party_id", table_name="orders")
    op.drop_column("orders", "party_id")
    op.drop_index("ix_parties_name_lower", table_name="parties")
    op.drop_table("parties")
