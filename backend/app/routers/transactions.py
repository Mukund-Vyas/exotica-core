from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import AppError
from app.dependencies.pagination import PaginationParams, pagination_params
from app.dependencies.permissions import require_permission
from app.models.product import SKU
from app.models.transaction import Order, OrderItem, Purchase, Receivable, ReceivableStatus, Return
from app.models.user import User
from app.schemas.common import Page
from app.schemas.types import UUIDStr
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


async def _attach_sku_info(db: AsyncSession, items: list) -> None:
    """Set display-only sku_code / sku_name on line items (not stored columns)."""
    ids = {i.sku_id for i in items}
    if not ids:
        return
    skus = {s.id: s for s in (await db.execute(select(SKU).where(SKU.id.in_(ids)))).scalars()}
    for item in items:
        sku = skus.get(item.sku_id)
        item.sku_code = sku.code if sku else None
        item.sku_name = sku.name if sku else None


async def _attach_returned_qty(db: AsyncSession, items: list[OrderItem]) -> None:
    ids = [i.id for i in items]
    returned: dict[str, int] = {}
    if ids:
        returned = {
            oid: int(qty)
            for oid, qty in (
                await db.execute(
                    select(Return.order_item_id, func.sum(Return.quantity))
                    .where(Return.order_item_id.in_(ids))
                    .group_by(Return.order_item_id)
                )
            ).all()
        }
    for item in items:
        item.returned_quantity = returned.get(item.id, 0)


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
    vendor_id: UUIDStr | None = None,
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
                query.options(selectinload(Purchase.items))
                .order_by(Purchase.purchase_date.desc(), Purchase.created_at.desc(), Purchase.id)
                .limit(pagination.limit)
                .offset(pagination.offset)
            )
        )
        .scalars()
        .all()
    )
    await _attach_sku_info(db, [i for r in rows for i in r.items])
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
    channel_id: UUIDStr | None = None,
    party_id: UUIDStr | None = None,
    sku_id: UUIDStr | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("orders:read")),
) -> Page[OrderRead]:
    if date_from and date_to and date_from > date_to:
        raise AppError(code="invalid_date_range", detail="'From' date must be on or before the 'To' date.")
    query = select(Order)
    if sku_id:
        query = query.where(Order.items.any(OrderItem.sku_id == sku_id))
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
                query.options(selectinload(Order.items))
                .order_by(Order.order_date.desc(), Order.created_at.desc(), Order.id)
                .limit(pagination.limit)
                .offset(pagination.offset)
            )
        )
        .scalars()
        .all()
    )
    all_items = [i for r in rows for i in r.items]
    await _attach_sku_info(db, all_items)
    await _attach_returned_qty(db, all_items)
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
    party_id: UUIDStr | None = None,
    status: ReceivableStatus | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("receivables:read")),
) -> Page[ReceivableRead]:
    query = select(Receivable, Order.party_id, Order.party_name, Order.order_date).join(
        Order, Order.id == Receivable.order_id
    )
    if party_id:
        query = query.where(Order.party_id == party_id)
    if status:
        query = query.where(Receivable.status == status)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        await db.execute(query.order_by(Receivable.due_date.asc(), Receivable.created_at.asc(), Receivable.id).limit(pagination.limit).offset(pagination.offset))
    ).all()
    return Page(
        items=[
            ReceivableRead(
                id=receivable.id,
                order_id=receivable.order_id,
                party_id=row_party_id,
                party_name=party_name,
                order_date=order_date,
                amount_total=receivable.amount_total,
                amount_outstanding=receivable.amount_outstanding,
                due_date=receivable.due_date,
                status=receivable.status,
                created_at=receivable.created_at,
            )
            for receivable, row_party_id, party_name, order_date in rows
        ],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/receivables/aging", response_model=ReceivablesAgingReport)
async def receivables_aging(
    as_of: date | None = None,
    party_id: UUIDStr | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("receivables:read")),
) -> ReceivablesAgingReport:
    """FR-F3 — total outstanding shown prominently at the top level of the response."""
    return await receivables.get_receivables_aging(db, as_of, party_id)


@router.post("/receivables/{receivable_id}/payments", response_model=PaymentRead, status_code=201)
async def create_payment(
    receivable_id: UUIDStr,
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("receivables:write")),
) -> PaymentRead:
    payment = await receivables.record_payment(db, receivable_id, payload, current_user)
    return PaymentRead.model_validate(payment)
