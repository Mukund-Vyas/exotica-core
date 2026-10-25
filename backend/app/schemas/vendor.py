from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.types import trimmed


class VendorCreate(BaseModel):
    name: trimmed(200)


class VendorUpdate(BaseModel):
    is_active: bool | None = None


class VendorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    is_active: bool
    created_at: datetime
