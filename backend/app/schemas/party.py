from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PartyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class PartyUpdate(BaseModel):
    is_active: bool | None = None


class PartyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    is_active: bool
    created_at: datetime
