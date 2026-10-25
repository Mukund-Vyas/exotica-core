from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.types import trimmed


class PartyCreate(BaseModel):
    name: trimmed(200)


class PartyUpdate(BaseModel):
    is_active: bool | None = None


class PartyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    is_active: bool
    created_at: datetime
