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

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
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
