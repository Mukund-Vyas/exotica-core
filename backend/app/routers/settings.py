from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import NotFoundError
from app.dependencies.permissions import require_permission
from app.models.settings import SystemSetting
from app.models.user import User
from app.schemas.settings import SystemSettingRead, SystemSettingUpdate

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("/", response_model=list[SystemSettingRead])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("settings:read")),
) -> list[SystemSetting]:
    return (await db.execute(select(SystemSetting))).scalars().all()


@router.patch("/{key}", response_model=SystemSettingRead)
async def update_setting(
    key: str,
    payload: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("settings:write")),
) -> SystemSetting:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        raise NotFoundError(f"Setting '{key}' not found")

    setting.value = payload.value
    setting.updated_by_id = current_user.id
    await db.flush()
    await db.refresh(setting)
    return setting
