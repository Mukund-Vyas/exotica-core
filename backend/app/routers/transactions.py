from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import NotFoundError
from app.dependencies.pagination import PaginationParams, pagination_params
from app.dependencies.permissions import require_permission
from app.models.transaction import Order, Purchase, Receivable
from app.models.user import User
from app.schemas.common import Page
from app.schemas.transaction import (
    BulkOrderCreate,
    BulkOrderResult,
    OrderCreate,
    OrderRead,
    PaymentCreate,
    PaymentRead,
    PurchaseCreate,
    PurchaseRead,
    ReceivableRead,
    ReceivablesAgingReport,
    ReturnCreate,
    ReturnRead,
)
from app.services import inventory, orders, receivables, returns

router = APIRouter(prefix="/api/v1", tags=["transactions"])


# ============================================================================
# Purchases (FR-B1)
# ============================================================================


@router.post("/purchases/", response_model=PurchaseRead, status_code=201)
async def create_purchase(
    payload: PurchaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("purchases:write")),
) -> Purchase:
    return await inventory.record_purchase(db, payload, current_user)


@router.get("/purchases/", response_model=Page[PurchaseRead])
async def list_purchases(
    vendor_id: str | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("purchases:read")),
) -> Page[PurchaseRead]:
    query = select(Purchase)
    if vendor_id:
        query = query.where(Purchase.vendor_id == vendor_id)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        (
            await db.execute(
                query.order_by(Purchase.purchase_date.desc())
                .limit(pagination.limit)
                .offset(pagination.offset)
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        await db.refresh(row, attribute_names=["items"])
    return Page(
        items=[PurchaseRead.model_validate(r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


# ============================================================================
# Orders (FR-B2, FR-F1)
# ============================================================================


@router.post("/orders/", response_model=OrderRead, status_code=201)
async def create_order(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("orders:write")),
) -> Order:
    return await orders.create_order(db, payload, current_user)


@router.post("/orders/bulk", response_model=BulkOrderResult)
async def create_bulk_orders(
    payload: BulkOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("orders:write")),
) -> BulkOrderResult:
    """FR-B2 bulk-grid entry mode — all-or-nothing per request."""
    return await orders.create_bulk_orders(db, payload, current_user)


@router.get("/orders/", response_model=Page[OrderRead])
async def list_orders(
    channel_id: str | None = None,
    party_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("orders:read")),
) -> Page[OrderRead]:
    query = select(Order)
    if channel_id:
        query = query.where(Order.channel_id == channel_id)
    if party_id:
        query = query.where(Order.party_id == party_id)
    if date_from:
        query = query.where(Order.order_date >= date_from)
    if date_to:
        query = query.where(Order.order_date <= date_to)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        (
            await db.execute(
                query.order_by(Order.order_date.desc()).limit(pagination.limit).offset(pagination.offset)
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        await db.refresh(row, attribute_names=["items"])
    return Page(
        items=[OrderRead.model_validate(r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


# ============================================================================
# Returns (FR-B3)
# ============================================================================


@router.post("/returns/", response_model=ReturnRead, status_code=201)
async def create_return(
    payload: ReturnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("returns:write")),
) -> ReturnRead:
    ret = await returns.record_return(db, payload, current_user)
    return ReturnRead.model_validate(ret)


# ============================================================================
# Receivables & Payments (Epic F)
# ============================================================================


@router.get("/receivables/", response_model=Page[ReceivableRead])
async def list_receivables(
    party_id: str | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("receivables:read")),
) -> Page[ReceivableRead]:
    query = select(Receivable, Order.party_id, Order.party_name).join(Order, Order.id == Receivable.order_id)
    if party_id:
        query = query.where(Order.party_id == party_id)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        await db.execute(query.order_by(Receivable.due_date.asc()).limit(pagination.limit).offset(pagination.offset))
    ).all()
    return Page(
        items=[
            ReceivableRead.model_validate(
                {**receivable.__dict__, "party_id": row_party_id, "party_name": party_name}
            )
            for receivable, row_party_id, party_name in rows
        ],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/receivables/aging", response_model=ReceivablesAgingReport)
async def receivables_aging(
    as_of: date | None = None,
    party_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("receivables:read")),
) -> ReceivablesAgingReport:
    """FR-F3 — total outstanding shown prominently at the top level of the response."""
    return await receivables.get_receivables_aging(db, as_of, party_id)


@router.post("/receivables/{receivable_id}/payments", response_model=PaymentRead, status_code=201)
async def create_payment(
    receivable_id: str,
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("receivables:write")),
) -> PaymentRead:
    payment = await receivables.record_payment(db, receivable_id, payload, current_user)
    return PaymentRead.model_validate(payment)
