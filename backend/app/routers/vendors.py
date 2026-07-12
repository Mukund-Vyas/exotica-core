from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.dependencies.pagination import PaginationParams, pagination_params
from app.dependencies.permissions import require_permission
from app.models.user import User
from app.models.vendor import Vendor
from app.schemas.common import Page
from app.schemas.vendor import VendorCreate, VendorRead, VendorUpdate
from app.services.vendors import create_vendor, list_vendors, update_vendor

router = APIRouter(prefix="/api/v1/vendors", tags=["vendors"])


@router.get("/", response_model=Page[VendorRead])
async def get_vendors(
    search: str | None = None,
    is_active: bool | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:read")),
) -> Page[VendorRead]:
    rows, total = await list_vendors(db, search, is_active, pagination.limit, pagination.offset)
    return Page(
        items=[VendorRead.model_validate(r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post("/", response_model=VendorRead, status_code=201)
async def post_vendor(
    payload: VendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:write")),
) -> VendorRead:
    vendor = await create_vendor(db, payload, current_user)
    return VendorRead.model_validate(vendor)


@router.patch("/{vendor_id}", response_model=VendorRead)
async def patch_vendor(
    vendor_id: str,
    payload: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:write")),
) -> Vendor:
    return await update_vendor(db, vendor_id, payload)
