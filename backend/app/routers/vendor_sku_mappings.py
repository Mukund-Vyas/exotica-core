import csv
import io

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import AppError
from app.dependencies.pagination import PaginationParams, pagination_params
from app.dependencies.permissions import require_permission
from app.models.user import User
from app.schemas.common import Page
from app.schemas.types import UUIDStr
from app.schemas.vendor_sku_mapping import (
    VendorSkuMappingBulkResult,
    VendorSkuMappingCreate,
    VendorSkuMappingRead,
    VendorSkuMappingUpdate,
)
from app.services.vendor_sku_mappings import (
    MAX_ROWS,
    REQUIRED_COLUMNS,
    TEMPLATE_EXAMPLE_ROW,
    TEMPLATE_HEADERS,
    bulk_import,
    create_mapping,
    delete_mapping,
    list_mappings,
    lookup_by_vendor_code,
    update_mapping,
)

router = APIRouter(prefix="/api/v1/vendor-sku-mappings", tags=["vendor-sku-mappings"])


@router.get("/", response_model=Page[VendorSkuMappingRead])
async def get_mappings(
    vendor_id: UUIDStr | None = None,
    sku_id: UUIDStr | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:read")),
) -> Page[VendorSkuMappingRead]:
    rows, total = await list_mappings(db, vendor_id, sku_id, search, pagination.limit, pagination.offset)
    return Page(items=rows, total=total, limit=pagination.limit, offset=pagination.offset)


@router.get("/lookup", response_model=VendorSkuMappingRead)
async def lookup(
    vendor_id: UUIDStr,
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:read")),
) -> VendorSkuMappingRead:
    """Resolve a vendor's own code (from their invoice) to the Exotica SKU."""
    return await lookup_by_vendor_code(db, vendor_id, code)


@router.post("/", response_model=VendorSkuMappingRead, status_code=201)
async def add_mapping(
    payload: VendorSkuMappingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:write")),
) -> VendorSkuMappingRead:
    return await create_mapping(db, payload, current_user)


@router.patch("/{mapping_id}", response_model=VendorSkuMappingRead)
async def edit_mapping(
    mapping_id: UUIDStr,
    payload: VendorSkuMappingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:write")),
) -> VendorSkuMappingRead:
    return await update_mapping(db, mapping_id, payload)


@router.delete("/{mapping_id}", status_code=204)
async def remove_mapping(
    mapping_id: UUIDStr,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:write")),
) -> Response:
    await delete_mapping(db, mapping_id)
    return Response(status_code=204)


@router.get("/bulk/template")
async def download_template(
    current_user: User = Depends(require_permission("vendors:write")),
) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(TEMPLATE_HEADERS)
    writer.writerow(TEMPLATE_EXAMPLE_ROW)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vendor_sku_mapping_template.csv"},
    )


@router.post("/bulk", response_model=VendorSkuMappingBulkResult)
async def upload_mappings(
    vendor_id: UUIDStr = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors:write")),
) -> VendorSkuMappingBulkResult:
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AppError(code="invalid_file", detail="File is not valid UTF-8 text. Please export as CSV (UTF-8).")
    reader = csv.DictReader(io.StringIO(text))
    reader.fieldnames = [
        (h or "").strip().lower().replace(" ", "_").replace("-", "_") for h in (reader.fieldnames or [])
    ]
    missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
    if missing:
        raise AppError(
            code="missing_columns",
            detail=f"The file is missing required column(s): {', '.join(missing)}. Download the template for the expected headers.",
        )
    rows = list(reader)
    if not rows:
        raise AppError(code="empty_file", detail="The uploaded file has no data rows.")
    if len(rows) > MAX_ROWS:
        raise AppError(
            code="upload_too_large",
            detail=f"File has {len(rows)} rows, which exceeds the {MAX_ROWS}-row limit. Split it into smaller files.",
        )
    return await bulk_import(db, vendor_id, rows, current_user)
