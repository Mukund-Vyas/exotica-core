from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import AppError
from app.core.security import decode_token
from app.models.user import User
from app.services.auth import get_user_by_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class UnauthorizedError(AppError):
    def __init__(self, detail: str = "Could not validate credentials"):
        super().__init__(code="unauthorized", detail=detail, status_code=401)


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise UnauthorizedError()

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError()

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return user
