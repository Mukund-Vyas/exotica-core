from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import verify_password
from app.models.user import Role, User

# Eagerly load role -> permissions so `User.permission_codes` never triggers a
# lazy load on a detached/async object (async SQLAlchemy forbids implicit lazy IO).
_USER_LOAD_OPTS = selectinload(User.role).selectinload(Role.permissions)


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).options(_USER_LOAD_OPTS).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).options(_USER_LOAD_OPTS).where(User.id == user_id))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    user = await get_user_by_username(db, username)
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
