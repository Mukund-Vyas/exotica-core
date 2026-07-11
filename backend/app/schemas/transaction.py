from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.transaction import PaymentTerm, ReceivableStatus

# ============================================================================
# Purchases (FR-B1)
# ============================================================================


class PurchaseItemCreate(BaseModel):
    sku_id: str
    quantity: int = Field(gt=0)
    unit_cost: Decimal = Field(gt=0)


class PurchaseCreate(BaseModel):
    vendor: str = Field(min_length=1, max_length=200)
    purchase_date: date
    items: list[PurchaseItemCreate] = Field(min_length=1)


class PurchaseItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku_id: str
    quantity: int
    unit_cost: Decimal
    line_total: Decimal
    resulting_avg_cost: Decimal


class PurchaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
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

    sku_id: str
    quantity: int = Field(gt=0)
    selling_price_override: Decimal | None = Field(
        default=None, gt=0, description="Optional manual override for negotiated/discounted sales"
    )


class OrderCreate(BaseModel):
    channel_id: str
    order_date: date
    items: list[OrderItemCreate] = Field(min_length=1)

    # B2B only
    payment_term: PaymentTerm | None = None
    party_name: str | None = None
    due_date: date | None = None

    allow_negative_stock: bool = Field(
        default=False,
        description="If false (default) an order that would take stock negative is rejected. "
        "If true, it is allowed but the response flags which lines went negative.",
    )


class BulkOrderCreate(BaseModel):
    """POST /api/v1/orders/bulk — FR-B2 bulk-entry mode. All-or-nothing per request."""

    orders: list[OrderCreate] = Field(min_length=1)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku_id: str
    quantity: int
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
    sku_id: str
    channel_id: str
    quantity: int = Field(gt=0)
    return_date: date
    reason: str | None = None
    order_item_id: str | None = Field(
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
    amount: Decimal = Field(gt=0)
    payment_date: date


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
    amount_total: Decimal
    amount_outstanding: Decimal
    due_date: date
    status: ReceivableStatus
    created_at: datetime


class ReceivableAgingRow(BaseModel):
    receivable_id: str
    order_id: str
    party_name: str | None
    amount_outstanding: Decimal
    due_date: date
    days_overdue: int
    aging_bucket: str  # "Not Due" | "1-30 Days" | "31-60 Days" | "60+ Days"


class ReceivablesAgingReport(BaseModel):
    rows: list[ReceivableAgingRow]
    total_outstanding: Decimal
