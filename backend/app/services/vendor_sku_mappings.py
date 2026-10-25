"""
Vendor <-> Exotica SKU mapping.

A vendor's own product code/name for one of our SKUs, so purchases can be keyed
from the vendor's invoice and reconciled against it later.
"""
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.core.money import like_pattern
from app.models.product import SKU
from app.models.user import User
from app.models.vendor import Vendor, VendorSkuMapping
from app.schemas.vendor_sku_mapping import (
    MappingRowError,
    VendorSkuMappingBulkResult,
    VendorSkuMappingCreate,
    VendorSkuMappingRead,
    VendorSkuMappingUpdate,
)

MAX_ROWS = 2000
REQUIRED_COLUMNS = ["vendor_sku_code", "exotica_sku_code"]
TEMPLATE_HEADERS = ["vendor_sku_code", "vendor_product_name", "exotica_sku_code"]
TEMPLATE_EXAMPLE_ROW = ["VT-2210-BLK-34B", "Vimal Lace Bra Black 34B", "BR-1024-BLK-34B"]


def _clean_code(value: str) -> str:
    return " ".join(value.split())


def _clean_name(value: str | None) -> str | None:
    cleaned = " ".join((value or "").split())
    return cleaned or None


def _read(mapping: VendorSkuMapping, vendor_name: str, sku_code: str, sku_name: str) -> VendorSkuMappingRead:
    return VendorSkuMappingRead(
        id=mapping.id,
        vendor_id=mapping.vendor_id,
        vendor_name=vendor_name,
        sku_id=mapping.sku_id,
        sku_code=sku_code,
        sku_name=sku_name,
        vendor_sku_code=mapping.vendor_sku_code,
        vendor_product_name=mapping.vendor_product_name,
        created_at=mapping.created_at,
    )


async def _code_holder(db: AsyncSession, vendor_id: str, code: str, exclude_id: str | None = None):
    query = (
        select(VendorSkuMapping, SKU.code)
        .join(SKU, SKU.id == VendorSkuMapping.sku_id)
        .where(VendorSkuMapping.vendor_id == vendor_id, func.lower(VendorSkuMapping.vendor_sku_code) == code.lower())
    )
    if exclude_id:
        query = query.where(VendorSkuMapping.id != exclude_id)
    return (await db.execute(query)).first()


async def create_mapping(db: AsyncSession, payload: VendorSkuMappingCreate, current_user: User) -> VendorSkuMappingRead:
    vendor = await db.get(Vendor, payload.vendor_id)
    if vendor is None:
        raise NotFoundError(f"Vendor {payload.vendor_id} not found")
    if not vendor.is_active:
        raise AppError(code="vendor_inactive", detail=f"Vendor '{vendor.name}' is inactive. Reactivate it first.")
    sku = await db.get(SKU, payload.sku_id)
    if sku is None:
        raise NotFoundError(f"SKU {payload.sku_id} not found")

    code = _clean_code(payload.vendor_sku_code)
    holder = await _code_holder(db, vendor.id, code)
    if holder is not None:
        raise ConflictError(
            f"{vendor.name}'s code '{code}' is already mapped to {holder[1]}.", code="duplicate_vendor_sku_code"
        )
    existing = (
        await db.execute(
            select(VendorSkuMapping).where(
                VendorSkuMapping.vendor_id == vendor.id, VendorSkuMapping.sku_id == sku.id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError(
            f"{sku.code} already has a code for {vendor.name} ('{existing.vendor_sku_code}'). Edit that one instead.",
            code="duplicate_vendor_sku_mapping",
        )

    mapping = VendorSkuMapping(
        vendor_id=vendor.id,
        sku_id=sku.id,
        vendor_sku_code=code,
        vendor_product_name=_clean_name(payload.vendor_product_name),
        created_by_id=current_user.id,
    )
    db.add(mapping)
    await db.flush()
    await db.refresh(mapping)
    return _read(mapping, vendor.name, sku.code, sku.name)


async def update_mapping(
    db: AsyncSession, mapping_id: str, payload: VendorSkuMappingUpdate
) -> VendorSkuMappingRead:
    mapping = await db.get(VendorSkuMapping, mapping_id)
    if mapping is None:
        raise NotFoundError(f"Mapping {mapping_id} not found")
    vendor = await db.get(Vendor, mapping.vendor_id)
    sku = await db.get(SKU, mapping.sku_id)
    changes = payload.model_fields_set

    if "vendor_sku_code" in changes and payload.vendor_sku_code is not None:
        code = _clean_code(payload.vendor_sku_code)
        holder = await _code_holder(db, mapping.vendor_id, code, exclude_id=mapping.id)
        if holder is not None:
            raise ConflictError(
                f"{vendor.name}'s code '{code}' is already mapped to {holder[1]}.", code="duplicate_vendor_sku_code"
            )
        mapping.vendor_sku_code = code
    if "vendor_product_name" in changes:
        mapping.vendor_product_name = _clean_name(payload.vendor_product_name)
    await db.flush()
    return _read(mapping, vendor.name, sku.code, sku.name)


async def delete_mapping(db: AsyncSession, mapping_id: str) -> None:
    mapping = await db.get(VendorSkuMapping, mapping_id)
    if mapping is None:
        raise NotFoundError(f"Mapping {mapping_id} not found")
    # Past purchases keep their own snapshot of the code, so deleting is safe.
    await db.delete(mapping)
    await db.flush()


async def list_mappings(
    db: AsyncSession,
    vendor_id: str | None,
    sku_id: str | None,
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[VendorSkuMappingRead], int]:
    base = (
        select(VendorSkuMapping, Vendor.name, SKU.code, SKU.name)
        .join(Vendor, Vendor.id == VendorSkuMapping.vendor_id)
        .join(SKU, SKU.id == VendorSkuMapping.sku_id)
    )
    if vendor_id:
        base = base.where(VendorSkuMapping.vendor_id == vendor_id)
    if sku_id:
        base = base.where(VendorSkuMapping.sku_id == sku_id)
    if search and search.strip():
        like = like_pattern(search)
        base = base.where(
            or_(
                VendorSkuMapping.vendor_sku_code.ilike(like, escape="\\"),
                VendorSkuMapping.vendor_product_name.ilike(like, escape="\\"),
                SKU.code.ilike(like, escape="\\"),
                SKU.name.ilike(like, escape="\\"),
            )
        )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(
            base.order_by(Vendor.name, VendorSkuMapping.vendor_sku_code, VendorSkuMapping.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [_read(m, vname, scode, sname) for m, vname, scode, sname in rows], total


async def lookup_by_vendor_code(db: AsyncSession, vendor_id: str, code: str) -> VendorSkuMappingRead:
    """Resolve a vendor's code (as printed on their invoice) to our SKU."""
    row = (
        await db.execute(
            select(VendorSkuMapping, Vendor.name, SKU.code, SKU.name)
            .join(Vendor, Vendor.id == VendorSkuMapping.vendor_id)
            .join(SKU, SKU.id == VendorSkuMapping.sku_id)
            .where(
                VendorSkuMapping.vendor_id == vendor_id,
                func.lower(VendorSkuMapping.vendor_sku_code) == _clean_code(code).lower(),
            )
        )
    ).first()
    if row is None:
        raise NotFoundError(f"No SKU is mapped to vendor code '{code}' for this vendor")
    return _read(*row)


async def mapped_codes_for(db: AsyncSession, vendor_id: str, sku_ids: list[str]) -> dict[str, VendorSkuMapping]:
    """sku_id -> mapping for one vendor (used to stamp purchase lines and search results)."""
    if not sku_ids:
        return {}
    rows = (
        await db.execute(
            select(VendorSkuMapping).where(
                VendorSkuMapping.vendor_id == vendor_id, VendorSkuMapping.sku_id.in_(set(sku_ids))
            )
        )
    ).scalars()
    return {m.sku_id: m for m in rows}


async def bulk_import(
    db: AsyncSession, vendor_id: str, rows: list[dict], current_user: User
) -> VendorSkuMappingBulkResult:
    vendor = await db.get(Vendor, vendor_id)
    if vendor is None:
        raise NotFoundError(f"Vendor {vendor_id} not found")
    if not vendor.is_active:
        raise AppError(code="vendor_inactive", detail=f"Vendor '{vendor.name}' is inactive. Reactivate it first.")

    errors: list[MappingRowError] = []
    created = 0
    for index, row in enumerate(rows, start=1):
        vendor_code = _clean_code(row.get("vendor_sku_code") or "")
        exotica_code = _clean_code(row.get("exotica_sku_code") or "")

        def fail(error_code: str, detail: str, _i=index, _c=vendor_code or None) -> None:
            errors.append(MappingRowError(row_number=_i, vendor_sku_code=_c, error_code=error_code, detail=detail))

        if not vendor_code or not exotica_code:
            fail("missing_required_field", "vendor_sku_code and exotica_sku_code are both required")
            continue
        if len(vendor_code) > 100 or len(_clean_name(row.get("vendor_product_name")) or "") > 200:
            fail("value_too_long", "vendor code is limited to 100 characters and product name to 200")
            continue
        sku = (
            await db.execute(select(SKU).where(func.lower(SKU.code) == exotica_code.lower()))
        ).scalar_one_or_none()
        if sku is None:
            fail("sku_not_found", f"No Exotica SKU with code '{exotica_code}'")
            continue
        try:
            async with db.begin_nested():
                await create_mapping(
                    db,
                    VendorSkuMappingCreate(
                        vendor_id=vendor.id,
                        sku_id=sku.id,
                        vendor_sku_code=vendor_code,
                        vendor_product_name=row.get("vendor_product_name"),
                    ),
                    current_user,
                )
            created += 1
        except AppError as exc:
            fail(exc.code, exc.detail)
    return VendorSkuMappingBulkResult(created_count=created, failed_count=len(errors), errors=errors)
