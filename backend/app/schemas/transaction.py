from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.transaction import PaymentTerm, ReceivableStatus
from app.schemas.types import (
    PastOrToday,
    PaymentAmount,
    Price,
    Quantity,
    UnitCostField,
    UUIDStr,
)

# ============================================================================
# Purchases (FR-B1)
# ============================================================================


class PurchaseItemCreate(BaseModel):
    sku_id: UUIDStr
    quantity: Quantity
    unit_cost: UnitCostField


class PurchaseCreate(BaseModel):
    vendor_id: UUIDStr = Field(description="Vendor master reference (app.services.vendors)")
    purchase_date: PastOrToday
    items: list[PurchaseItemCreate] = Field(min_length=1, max_length=200)


class PurchaseItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku_id: str
    sku_code: str | None = None  # attached by the router for display; not a stored column
    sku_name: str | None = None
    vendor_sku_code: str | None = None  # vendor's own code at purchase time (snapshot)
    quantity: int
    unit_cost: Decimal
    line_total: Decimal
    resulting_avg_cost: Decimal


class PurchaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    vendor_id: str | None
    vendor: str
    purchase_date: date
    created_by_id: str
    created_at: datetime
    items: list[PurchaseItemRead]


# ============================================================================
# Orders (FR-B2, FR-F1)
# ============================================================================


class OrderItemCreate(BaseModel):
    """
    Request schema for one order line.

    Snapshot fields (selling_price_at_sale, cost_price_at_sale,
    commission_amount_at_sale, revenue, net_profit) are deliberately absent —
    they are calculated server-side and are structurally impossible to submit.
    """

    sku_id: UUIDStr
    quantity: Quantity
    selling_price_override: Price | None = Field(
        default=None, description="Optional manual override for negotiated/discounted sales"
    )


class OrderCreate(BaseModel):
    channel_id: UUIDStr
    order_date: PastOrToday
    items: list[OrderItemCreate] = Field(min_length=1, max_length=200)

    # B2B only
    payment_term: PaymentTerm | None = None
    party_id: UUIDStr | None = Field(
        default=None,
        description="Party master reference (app.services.parties) — required when payment_term is 'credit'",
    )
    due_date: date | None = None

    allow_negative_stock: bool = Field(
        default=False,
        description="If false (default) an order that would take stock negative is rejected. "
        "If true, it is allowed but the response flags which lines went negative.",
    )

    @model_validator(mode="after")
    def _due_date_not_before_order_date(self) -> "OrderCreate":
        if self.due_date is not None and self.due_date < self.order_date:
            raise ValueError("due_date cannot be before the order date")
        return self


class BulkOrderCreate(BaseModel):
    """POST /api/v1/orders/bulk — FR-B2 bulk-entry mode. All-or-nothing per request."""

    orders: list[OrderCreate] = Field(min_length=1)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku_id: str
    sku_code: str | None = None  # attached by the router for display; not a stored column
    sku_name: str | None = None
    quantity: int
    returned_quantity: int = 0  # units already returned against this line (list endpoint only)
    selling_price_at_sale: Decimal
    cost_price_at_sale: Decimal
    commission_amount_at_sale: Decimal
    revenue: Decimal
    net_profit: Decimal
    price_overridden: bool


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    channel_id: str
    order_date: date
    payment_term: PaymentTerm | None
    party_id: str | None
    party_name: str | None
    due_date: date | None
    created_by_id: str
    created_at: datetime
    items: list[OrderItemRead]


class BulkOrderLineError(BaseModel):
    order_index: int
    item_index: int | None = None
    detail: str


class BulkOrderResult(BaseModel):
    """All-or-nothing: either `orders` is fully populated or `errors` is non-empty."""

    orders: list[OrderRead] = []
    errors: list[BulkOrderLineError] = []


# ============================================================================
# Returns (FR-B3)
# ============================================================================


class ReturnCreate(BaseModel):
    sku_id: UUIDStr
    channel_id: UUIDStr
    quantity: Quantity
    return_date: PastOrToday
    reason: str | None = Field(default=None, max_length=1000)
    order_item_id: UUIDStr | None = Field(
        default=None, description="Optional reference to the original order line"
    )


class ReturnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku_id: str
    channel_id: str
    quantity: int
    return_date: date
    reason: str | None
    order_item_id: str | None
    revenue_reversed: Decimal
    cost_reversed: Decimal
    commission_reversed: Decimal
    net_profit_reversed: Decimal
    created_by_id: str
    created_at: datetime


# ============================================================================
# Receivables & Payments (Epic F)
# ============================================================================


class PaymentCreate(BaseModel):
    amount: PaymentAmount
    payment_date: PastOrToday


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    receivable_id: str
    amount: Decimal
    payment_date: date
    created_by_id: str
    created_at: datetime


class ReceivableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    order_id: str
    party_id: str | None = None
    party_name: str | None = None
    order_date: date | None = None  # joined from the order, for a recognisable reference
    amount_total: Decimal
    amount_outstanding: Decimal
    due_date: date
    status: ReceivableStatus
    created_at: datetime


class ReceivableAgingRow(BaseModel):
    receivable_id: str
    order_id: str
    party_id: str | None
    party_name: str | None
    order_date: date | None = None
    amount_outstanding: Decimal
    due_date: date
    days_overdue: int
    aging_bucket: str  # "Not Due" | "1-30 Days" | "31-60 Days" | "60+ Days"


class ReceivablesAgingReport(BaseModel):
    rows: list[ReceivableAgingRow]
    total_outstanding: Decimal
    # Exact per-bucket sums (computed server-side, so the UI never adds floats).
    bucket_totals: dict[str, Decimal] = {}
