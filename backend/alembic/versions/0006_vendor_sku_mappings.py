"""add vendor_sku_mappings and purchase_items.vendor_sku_code

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-05

Each vendor labels products with its own codes/names. `vendor_sku_mappings`
links a vendor's identifier to our SKU:

  - unique (vendor_id, lower(vendor_sku_code)): a vendor's code means one SKU;
  - unique (vendor_id, sku_id): at most one code per SKU per vendor.

`purchase_items.vendor_sku_code` is a write-once snapshot of the mapped code at
purchase time (same pattern as resulting_avg_cost), nullable, not backfilled.

No new permissions: mappings use the existing vendors:read / vendors:write.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vendor_sku_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("sku_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("skus.id"), nullable=False),
        sa.Column("vendor_sku_code", sa.String(100), nullable=False),
        sa.Column("vendor_product_name", sa.String(200), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("vendor_id", "sku_id", name="uq_vendor_sku_mappings_vendor_sku"),
    )
    op.execute(
        "CREATE UNIQUE INDEX ix_vendor_sku_mappings_vendor_code_lower "
        "ON vendor_sku_mappings (vendor_id, lower(vendor_sku_code))"
    )
    op.create_index("ix_vendor_sku_mappings_sku_id", "vendor_sku_mappings", ["sku_id"])
    op.add_column("purchase_items", sa.Column("vendor_sku_code", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("purchase_items", "vendor_sku_code")
    op.drop_index("ix_vendor_sku_mappings_sku_id", table_name="vendor_sku_mappings")
    op.execute("DROP INDEX IF EXISTS ix_vendor_sku_mappings_vendor_code_lower")
    op.drop_table("vendor_sku_mappings")
