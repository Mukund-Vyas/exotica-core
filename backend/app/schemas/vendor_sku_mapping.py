from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.types import UUIDStr, trimmed


class VendorSkuMappingCreate(BaseModel):
    vendor_id: UUIDStr
    sku_id: UUIDStr
    vendor_sku_code: trimmed(100)
    vendor_product_name: str | None = Field(default=None, max_length=200)


class VendorSkuMappingUpdate(BaseModel):
    """Only the vendor's code/name can change. To point a vendor code at a
    different SKU, delete the mapping and add a new one (keeps history clear)."""

    vendor_sku_code: trimmed(100) | None = None
    vendor_product_name: str | None = Field(default=None, max_length=200)


class VendorSkuMappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    vendor_id: str
    vendor_name: str | None = None
    sku_id: str
    sku_code: str | None = None
    sku_name: str | None = None
    vendor_sku_code: str
    vendor_product_name: str | None = None
    created_at: datetime | None = None


class MappingRowError(BaseModel):
    row_number: int  # 1-indexed, header excluded — matches what the spreadsheet shows
    vendor_sku_code: str | None
    error_code: str
    detail: str


class VendorSkuMappingBulkResult(BaseModel):
    created_count: int
    failed_count: int
    errors: list[MappingRowError]
