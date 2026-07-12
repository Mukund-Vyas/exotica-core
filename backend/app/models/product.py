"""
Master data — FR-A1, FR-A2, FR-A3.

ChannelPrice and ChannelCommission are insert-only history tables: a new row is
added on every change, the previous row's `is_current` is flipped to False.
Nothing is ever overwritten in place, so historical P&L reports don't silently
change when price/commission terms are updated later (BRD Section 4.1, FR-A2/A3).
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class CommissionType(str, enum.Enum):
    PERCENTAGE = "percentage"
    FLAT = "flat"


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # myntra/zivame/website/b2b
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SKU(Base):
    __tablename__ = "skus"
    __table_args__ = (
        Index("ix_skus_code", "code"),
        Index("ix_skus_name", "name"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # FR-A1: no duplicates
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    size_variant: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)  # discontinue, don't delete

    # Epic G (Inventory Intelligence) — how long a reorder for this specific
    # SKU takes to arrive from its vendor. Nullable: falls back to the
    # `default_lead_time_days` SystemSetting when blank, so leaving it empty
    # is never a hard blocker to creating a SKU (BRD Addendum, Section 5).
    lead_time_days: Mapped[int | None] = mapped_column(nullable=True)

    # Running totals, maintained by services/inventory.py under row-level lock.
    current_stock_qty: Mapped[int] = mapped_column(default=0, nullable=False)
    current_avg_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ChannelPrice(Base):
    """FR-A2: up to one *current* price per (SKU, channel); history preserved via insert-only rows."""

    __tablename__ = "channel_prices"
    __table_args__ = (
        Index("ix_channel_prices_sku_channel_current", "sku_id", "channel_id", "is_current"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    sku_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skus.id"), nullable=False)
    channel_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("channels.id"), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)


class ChannelCommission(Base):
    """FR-A3: per-channel commission config, percentage or flat per unit, versioned like price."""

    __tablename__ = "channel_commissions"
    __table_args__ = (
        Index("ix_channel_commissions_channel_current", "channel_id", "is_current"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    channel_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("channels.id"), nullable=False)
    commission_type: Mapped[CommissionType] = mapped_column(
        Enum(
            CommissionType,
            name="commission_type",
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
    )
    value: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)  # % (0-100) or flat currency amount
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
