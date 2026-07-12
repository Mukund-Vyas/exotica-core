"""
Transaction models — FR-B1, FR-B2, FR-B3, FR-F1, FR-F2.

Snapshot fields (selling_price_at_sale, cost_price_at_sale, commission_amount_at_sale,
etc.) are write-once: set by the service layer at creation and never updated by any
router afterward (Implementation Plan Section 7.3). This is what makes historical P&L
stable even after prices/costs/commission change later.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class PaymentTerm(str, enum.Enum):
    PAID_IMMEDIATELY = "paid_immediately"
    CREDIT = "credit"


class ReceivableStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


# --- Purchases (FR-B1) ---


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    # vendor_id is the real FK, used for filtering/dedup (see app/models/vendor.py).
    # vendor is a write-once snapshot of Vendor.name at purchase time (same
    # pattern as resulting_avg_cost etc.) so a later vendor rename doesn't
    # rewrite historical purchases/reports. Nullable only to accommodate
    # pre-existing free-text rows from before the Vendor master existed; every
    # purchase recorded going forward always has both set (see PurchaseCreate).
    vendor_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("vendors.id"), nullable=True)
    vendor: Mapped[str] = mapped_column(String(200), nullable=False)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["PurchaseItem"]] = relationship(back_populates="purchase", cascade="all, delete-orphan")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"
    __table_args__ = (Index("ix_purchase_items_sku_id", "sku_id"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    purchase_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("purchases.id"), nullable=False)
    sku_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skus.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    # snapshot of the SKU's weighted-avg cost *after* this purchase is applied
    resulting_avg_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    purchase: Mapped["Purchase"] = relationship(back_populates="items")


# --- Orders (FR-B2) ---


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_date_channel", "order_date", "channel_id"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    channel_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("channels.id"), nullable=False)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)

    # B2B-only fields (FR-F1); null/ignored for other channels
    #
    # values_callable is required here: SQLAlchemy's default Enum binding sends
    # the Python member *name* ("CREDIT") to Postgres, but the DB enum type was
    # created (0001_initial_schema) with the member *values* ("credit"). Without
    # this, any credit order 500s on insert with "invalid input value for enum
    # payment_term".
    payment_term: Mapped[PaymentTerm | None] = mapped_column(
        Enum(PaymentTerm, name="payment_term", values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        nullable=True,
    )
    # party_id is the real FK, used for filtering/dedup. party_name is a
    # write-once snapshot of Party.name at order time (same pattern as
    # selling_price_at_sale etc.) so renaming a party later doesn't rewrite
    # historical orders/reports.
    party_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("parties.id"), nullable=True)
    party_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    receivable: Mapped["Receivable | None"] = relationship(back_populates="order", uselist=False)


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (Index("ix_order_items_sku_id", "sku_id"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"), nullable=False)
    sku_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skus.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)

    # --- snapshot fields, write-once (Section 7.3) ---
    selling_price_at_sale: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price_at_sale: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    commission_amount_at_sale: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    revenue: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    net_profit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    price_overridden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order"] = relationship(back_populates="items")


# --- Returns (FR-B3) ---


class Return(Base):
    __tablename__ = "returns"
    __table_args__ = (Index("ix_returns_sku_id", "sku_id"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    # optional reference to the original order line (BRD: "can optionally reference the original order")
    order_item_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("order_items.id"), nullable=True
    )
    sku_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skus.id"), nullable=False)
    channel_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("channels.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    return_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # reversal snapshot — mirrors the sign-flipped figures being reversed
    revenue_reversed: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cost_reversed: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    commission_reversed: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    net_profit_reversed: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --- Receivables (Epic F) ---


class Receivable(Base):
    __tablename__ = "receivables"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("orders.id"), unique=True, nullable=False
    )
    amount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount_outstanding: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[ReceivableStatus] = mapped_column(
        Enum(
            ReceivableStatus,
            name="receivable_status",
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=ReceivableStatus.OPEN,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order"] = relationship(back_populates="receivable")
    payments: Mapped[list["Payment"]] = relationship(back_populates="receivable", cascade="all, delete-orphan")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_receivable_id", "receivable_id"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    receivable_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("receivables.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    receivable: Mapped["Receivable"] = relationship(back_populates="payments")
