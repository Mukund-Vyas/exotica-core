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


class SKUUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    size_variant: str | None = None
    is_active: bool | None = None  # discontinue without deleting


class SKURead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    category: str
    size_variant: str
    is_active: bool
    current_stock_qty: int
    current_avg_cost: Decimal
    created_at: datetime
    updated_at: datetime


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
