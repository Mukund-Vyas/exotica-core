from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    username: str
    password: str


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    permission_codes: set[str] = set()


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    is_active: bool
    role_id: str