"""
Vendor master (purchase suppliers). Created to stop free-text vendor names
from fragmenting the same supplier into multiple spellings across purchase
history — see app/models/vendor.py.
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.user import User
from app.models.vendor import Vendor
from app.schemas.vendor import VendorCreate, VendorUpdate


async def list_vendors(
    db: AsyncSession, search: str | None, is_active: bool | None, limit: int, offset: int
) -> tuple[list[Vendor], int]:
    query = select(Vendor)
    if is_active is not None:
        query = query.where(Vendor.is_active == is_active)
    if search:
        query = query.where(Vendor.name.ilike(f"%{search}%"))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        (await db.execute(query.order_by(Vendor.name.asc()).limit(limit).offset(offset))).scalars().all()
    )
    return rows, total


async def create_vendor(db: AsyncSession, payload: VendorCreate, current_user: User) -> Vendor:
    name = payload.name.strip()

    # Case-insensitive dedup check up front (nicer error message than the DB's
    # unique-index violation, which is still there as a backstop against races).
    existing = (
        await db.execute(select(Vendor).where(func.lower(Vendor.name) == name.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError(
            detail=f"A vendor named '{existing.name}' already exists — use that one instead of creating a duplicate.",
            code="duplicate_vendor_name",
        )

    vendor = Vendor(name=name, created_by_id=current_user.id)
    db.add(vendor)
    await db.flush()
    await db.refresh(vendor)
    return vendor


async def update_vendor(db: AsyncSession, vendor_id: str, payload: VendorUpdate) -> Vendor:
    vendor = await db.get(Vendor, vendor_id)
    if vendor is None:
        raise NotFoundError(f"Vendor {vendor_id} not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vendor, field, value)

    await db.flush()
    await db.refresh(vendor)
    return vendor
