from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.product import CommissionType
from app.schemas.types import Price, UUIDStr, trimmed


# --- Channel ---


class ChannelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    is_active: bool


# --- SKU (FR-A1) ---


class SKUCreate(BaseModel):
    code: trimmed(50)
    name: trimmed(200)
    category: trimmed(100)
    size_variant: trimmed(50)
    lead_time_days: int | None = Field(default=None, ge=0, le=365)


class SKUUpdate(BaseModel):
    """PATCH body. Only fields actually sent are applied (``exclude_unset``).

    ``lead_time_days`` may be sent as null to clear it back to "use the site-wide
    default"; the NOT NULL columns may not be nulled out or blanked.
    """

    name: trimmed(200) | None = None
    category: trimmed(100) | None = None
    size_variant: trimmed(50) | None = None
    is_active: bool | None = None  # discontinue without deleting
    lead_time_days: int | None = Field(default=None, ge=0, le=365)

    @model_validator(mode="after")
    def _no_null_for_required_columns(self) -> "SKUUpdate":
        for field in ("name", "category", "size_variant", "is_active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class SKURead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    category: str
    size_variant: str
    is_active: bool
    lead_time_days: int | None
    current_stock_qty: int
    current_avg_cost: Decimal
    created_at: datetime
    updated_at: datetime
    # Only populated when listing with ?vendor_id=: that vendor's own code/name.
    vendor_sku_code: str | None = None
    vendor_product_name: str | None = None


# --- Bulk SKU upload (FR-A4) ---
# Partial success, not all-or-nothing — deliberately different from Bulk Order
# Entry, which is atomic. SKU rows are independent of each other, so one bad
# row shouldn't block the other 199 valid ones (BRD Addendum 2, Section 1).


class BulkSKURowError(BaseModel):
    row_number: int  # 1-indexed, matching what a spreadsheet user sees (header excluded)
    code: str | None  # best-effort — may be missing/blank on the bad row itself
    error_code: str
    detail: str


class BulkSKUUploadResult(BaseModel):
    created_count: int
    failed_count: int
    created_skus: list[SKURead]
    errors: list[BulkSKURowError]


# --- ChannelPrice (FR-A2) ---
# Note: no calculated/snapshot field accepted here — `is_current` and
# `effective_from` are set server-side by the service layer, never by the client.


class ChannelPriceCreate(BaseModel):
    sku_id: UUIDStr
    channel_id: UUIDStr
    price: Price


class ChannelPriceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku_id: str
    channel_id: str
    price: Decimal
    is_current: bool
    effective_from: datetime
    created_by_id: str


# --- ChannelCommission (FR-A3) ---


class ChannelCommissionCreate(BaseModel):
    channel_id: UUIDStr
    commission_type: CommissionType
    # Percentage (0-100) or a flat rupee amount per unit; see the check below.
    value: Decimal = Field(ge=0, max_digits=10, decimal_places=4, allow_inf_nan=False)

    @model_validator(mode="after")
    def _percentage_within_range(self) -> "ChannelCommissionCreate":
        if self.commission_type == CommissionType.PERCENTAGE and self.value > 100:
            raise ValueError("a percentage commission cannot exceed 100")
        return self


class ChannelCommissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    channel_id: str
    commission_type: CommissionType
    value: Decimal
    is_current: bool
    effective_from: datetime
    created_by_id: str
