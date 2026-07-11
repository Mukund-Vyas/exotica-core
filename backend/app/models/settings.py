"""
SystemSetting — generic key/value config table.

Epic C's dead-stock detection depends on `dead_stock_window` existing here from
day one, even though the CRUD API for this table isn't built until Epic E — the
value is seeded by a data migration (see alembic/versions), not left to app code
to default silently (Implementation Plan Section 1.4).
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[str] = mapped_column(String(500), nullable=False)  # stored as text, cast by consumer
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)


# Known keys (avoids stringly-typed lookups scattered across services)
DEAD_STOCK_WINDOW_KEY = "dead_stock_window"
