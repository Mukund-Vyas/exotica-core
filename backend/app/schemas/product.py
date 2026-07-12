from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.product import CommissionType


# --- Channel ---


class ChannelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    is_active: bool


# --- SKU (FR-A1) ---


class SKUCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=100)
    size_variant: str = Field(min_length=1, max_length=50)
    lead_time_days: int | None = Field(default=None, ge=0)


class SKUUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    size_variant: str | None = None
    is_active: bool | None = None  # discontinue without deleting
    lead_time_days: int | None = None


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
    sku_id: str
    channel_id: str
    price: Decimal = Field(gt=0)


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
    channel_id: str
    commission_type: CommissionType
    value: Decimal = Field(ge=0)


class ChannelCommissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    channel_id: str
    commission_type: CommissionType
    value: Decimal
    is_current: bool
    effective_from: datetime
    created_by_id: str
