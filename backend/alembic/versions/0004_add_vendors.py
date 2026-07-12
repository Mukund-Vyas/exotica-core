"""add vendors table, purchases.vendor_id, and vendors:read/write permissions

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-12

Free-text `vendor` on purchases let the same supplier fragment into multiple
spellings ("Mahavir Textile" / "mahavir textile" / "Mahavir Textiles") across
purchase history, breaking any attempt to filter or aggregate by vendor —
the same bug 0003_add_parties.py fixed for B2B customers. This adds a proper
Vendor master:

  - `vendors` table, with a case-insensitive unique index so "Mahavir
    Textile" and "mahavir textile" can't both be created.
  - `purchases.vendor_id` FK, nullable (pre-existing rows predate the Vendor
    master and aren't backfilled — a fuzzy match here could silently merge
    two different suppliers). `purchases.vendor` is left in place as a
    write-once snapshot of Vendor.name at purchase time — same pattern as
    resulting_avg_cost etc. (see app/models/transaction.py) — so a later
    vendor rename doesn't rewrite historical purchases/reports.
  - No backfill of vendor_id on existing purchases: they keep their
    free-text vendor value and show up as "no vendor" for filtering purposes
    until someone re-attributes them, if ever needed.
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

NEW_PERMISSION_CODES = ["vendors:read", "vendors:write"]


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "vendors",
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
    op.execute("CREATE UNIQUE INDEX ix_vendors_name_lower ON vendors (lower(name))")

    op.add_column(
        "purchases",
        sa.Column("vendor_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("vendors.id"), nullable=True),
    )
    op.create_index("ix_purchases_vendor_id", "purchases", ["vendor_id"])

    # Grant the two new permissions to the existing "owner" role, same pattern
    # as 0003_add_parties.py.
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
    op.drop_index("ix_purchases_vendor_id", table_name="purchases")
    op.drop_column("purchases", "vendor_id")
    op.drop_index("ix_vendors_name_lower", table_name="vendors")
    op.drop_table("vendors")
