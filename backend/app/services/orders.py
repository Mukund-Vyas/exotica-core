"""
Daily order entry, including the required bulk-grid endpoint — FR-B2.

P&L is calculated at time of sale (FR-C1) using the BRD Section 7 formulas:
    Revenue    = Qty Sold x Selling Price
    Commission = Revenue x Commission%           [percentage channels]
               = Qty Sold x Flat Commission       [flat-per-unit channels]
    COGS       = Qty Sold x Weighted Avg Cost (at time of sale)
    Net Profit = Revenue - Commission - COGS

The SKU row is locked (SELECT ... FOR UPDATE) for the duration of each item's
stock check + mutation (Implementation Plan Section 7.2), so two near-simultaneous
orders against the same SKU can't both pass a stock check before either commits.
"""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.product import SKU
from app.models.transaction import Order, OrderItem, PaymentTerm, Receivable, ReceivableStatus
from app.models.user import User
from app.schemas.transaction import BulkOrderCreate, BulkOrderLineError, BulkOrderResult, OrderCreate
from app.services.pricing import calculate_commission, get_current_commission, get_current_price


async def _lock_sku(db: AsyncSession, sku_id: str) -> SKU:
    result = await db.execute(select(SKU).where(SKU.id == sku_id).with_for_update())
    sku = result.scalar_one_or_none()
    if sku is None:
        raise NotFoundError(f"SKU {sku_id} not found")
    return sku


async def _create_order_inner(db: AsyncSession, payload: OrderCreate, current_user: User) -> Order:
    if payload.payment_term == PaymentTerm.CREDIT and payload.due_date is None:
        raise AppError(
            code="due_date_required",
            detail="due_date is required when payment_term is 'credit'",
        )

    order = Order(
        channel_id=payload.channel_id,
        order_date=payload.order_date,
        payment_term=payload.payment_term,
        party_name=payload.party_name,
        due_date=payload.due_date,
        created_by_id=current_user.id,
    )
    db.add(order)
    await db.flush()

    commission = await get_current_commission(db, payload.channel_id)
    total_revenue = Decimal("0")

    for line in payload.items:
        sku = await _lock_sku(db, line.sku_id)

        if line.selling_price_override is not None:
            selling_price = line.selling_price_override
            overridden = True
        else:
            current_price = await get_current_price(db, line.sku_id, payload.channel_id)
            if current_price is None:
                # FR-A2: must prompt for a price rather than silently defaulting to 0/blank.
                raise AppError(
                    code="price_not_set",
                    detail=(
                        f"No channel price is set for SKU {line.sku_id} on this channel. "
                        "Set a price (FR-A2) or provide selling_price_override."
                    ),
                )
            selling_price = current_price.price
            overridden = False

        if sku.current_stock_qty - line.quantity < 0 and not payload.allow_negative_stock:
            raise ConflictError(
                detail=(
                    f"Order rejected: SKU {sku.code} has {sku.current_stock_qty} in stock, "
                    f"requested {line.quantity}. Set allow_negative_stock=true to override."
                ),
                code="insufficient_stock",
            )

        revenue = (Decimal(line.quantity) * selling_price).quantize(Decimal("0.01"))
        commission_amount = calculate_commission(commission, revenue, line.quantity)
        cogs = (Decimal(line.quantity) * sku.current_avg_cost).quantize(Decimal("0.01"))
        net_profit = revenue - commission_amount - cogs

        sku.current_stock_qty -= line.quantity
        total_revenue += revenue

        db.add(
            OrderItem(
                order_id=order.id,
                sku_id=line.sku_id,
                quantity=line.quantity,
                selling_price_at_sale=selling_price,
                cost_price_at_sale=sku.current_avg_cost,
                commission_amount_at_sale=commission_amount,
                revenue=revenue,
                net_profit=net_profit,
                price_overridden=overridden,
            )
        )

    if payload.payment_term == PaymentTerm.CREDIT:
        db.add(
            Receivable(
                order_id=order.id,
                amount_total=total_revenue,
                amount_outstanding=total_revenue,
                due_date=payload.due_date,
                status=ReceivableStatus.OPEN,
            )
        )

    await db.flush()
    # Refresh both — `receivable` is only ever populated for CREDIT orders, but
    # refreshing it unconditionally means callers (and OrderRead) never trip
    # async SQLAlchemy's "implicit IO not allowed" error on a lazy relationship
    # that was never loaded (Section 9, Async discipline: no implicit lazy IO).
    await db.refresh(order, attribute_names=["items", "receivable"])
    return order


async def create_order(db: AsyncSession, payload: OrderCreate, current_user: User) -> Order:
    return await _create_order_inner(db, payload, current_user)


async def create_bulk_orders(
    db: AsyncSession, payload: BulkOrderCreate, current_user: User
) -> BulkOrderResult:
    """
    FR-B2 bulk-entry mode. All-or-nothing: if any line in any order fails, the
    entire batch is rolled back and a per-line error breakdown is returned
    instead of partially committing (Implementation Plan Section 5).
    """
    created: list[Order] = []
    errors: list[BulkOrderLineError] = []

    for order_index, order_payload in enumerate(payload.orders):
        try:
            async with db.begin_nested():
                order = await _create_order_inner(db, order_payload, current_user)
                created.append(order)
        except AppError as exc:
            errors.append(BulkOrderLineError(order_index=order_index, detail=exc.detail))

    if errors:
        await db.rollback()
        return BulkOrderResult(orders=[], errors=errors)

    return BulkOrderResult(orders=created, errors=[])
