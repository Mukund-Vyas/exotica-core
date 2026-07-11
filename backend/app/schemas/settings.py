from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SystemSettingUpdate(BaseModel):
    value: str


class SystemSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    key: str
    value: str
    updated_at: datetime