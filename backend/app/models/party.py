"""
Party master (B2B customers) — added to fix free-text party_name letting the
same customer fragment into multiple spellings across orders/receivables/reports.

Order.party_name is kept as a write-once snapshot of Party.name at order time
(same pattern as selling_price_at_sale etc. in transaction.py) so a later
rename doesn't rewrite history — but Order.party_id is the real FK used for
filtering and dedup.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Party(Base):
    __tablename__ = "parties"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
