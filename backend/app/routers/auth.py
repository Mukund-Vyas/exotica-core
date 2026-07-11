from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.dependencies.auth import UnauthorizedError, get_current_user
from app.schemas.common import Token, TokenRefreshRequest
from app.schemas.user import LoginRequest, UserRead
from app.services.auth import authenticate_user, get_user_by_id

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> Token:
    user = await authenticate_user(db, payload.username, payload.password)
    if user is None:
        raise UnauthorizedError("Incorrect username or password")
    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=Token)
async def refresh(payload: TokenRefreshRequest, db: AsyncSession = Depends(get_db)) -> Token:
    decoded = decode_token(payload.refresh_token)
    if decoded is None or decoded.get("type") != "refresh":
        raise UnauthorizedError("Invalid refresh token")

    user = await get_user_by_id(db, decoded["sub"])
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserRead)
async def get_me(current_user=Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)
