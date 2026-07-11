"""
Role/permission enforcement — replaces Django's Groups/Permissions.

Implementation Plan Section 6.2. Single user/role in Phase 1 (FR-E1), but every
protected write route is guarded by `require_permission(...)` from day one, so
adding a second, more restricted role later is a config change (new Role +
RolePermission rows), not a code change.
"""
from fastapi import Depends

from app.core.exceptions import PermissionDeniedError
from app.dependencies.auth import get_current_user
from app.models.user import User


def require_permission(permission_code: str):
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if permission_code not in current_user.permission_codes:
            raise PermissionDeniedError(
                f"Role '{current_user.role.name}' lacks permission '{permission_code}'"
            )
        return current_user

    return checker
