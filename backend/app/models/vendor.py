"""
Vendor master (purchase suppliers) — added to fix free-text `vendor` on Purchase
letting the same supplier fragment into multiple spellings across purchase
history, the same way app/models/party.py fixed this for B2B customers.

Purchase.vendor is kept as a write-once snapshot of Vendor.name at purchase
time (same pattern as resulting_avg_cost etc. in transaction.py) so a later
rename doesn't rewrite history — but Purchase.vendor_id is the real FK used
for filtering and dedup.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VendorSkuMapping(Base):
    """A vendor's own code/name for one of our SKUs.

    Every supplier labels the same garment differently ("VT-2210-BLK-34B" vs our
    "BR-1024-BLK-34B"). This links their identifier to ours so a purchase can be
    entered from the vendor's invoice and reconciled against it later.

    Rules (enforced by the indexes below and re-checked in the service layer so
    the user gets a readable message, not a database error):
      * one vendor code maps to exactly one SKU, compared case-insensitively;
      * a vendor has at most one code per SKU.
    """

    __tablename__ = "vendor_sku_mappings"
    __table_args__ = (
        UniqueConstraint("vendor_id", "sku_id", name="uq_vendor_sku_mappings_vendor_sku"),
        Index("ix_vendor_sku_mappings_vendor_code_lower", "vendor_id", func.lower(text("vendor_sku_code")), unique=True),
        Index("ix_vendor_sku_mappings_sku_id", "sku_id"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    vendor_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("vendors.id"), nullable=False)
    sku_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skus.id"), nullable=False)
    vendor_sku_code: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_product_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
