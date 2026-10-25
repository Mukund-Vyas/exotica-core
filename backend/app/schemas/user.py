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
    # Exposed so the UI can show/hide controls by permission (FR-E1). The server
    # still enforces every permission on its own; this is purely for UX.
    role_name: str | None = None
    permission_codes: list[str] = []