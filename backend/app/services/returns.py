"""
Return entry — FR-B3. A return increases stock and reverses the revenue/profit
for that line.

If `order_item_id` is given, the reversal uses that line's exact snapshot values
pro-rated by the returned quantity (so the reversal is precise even if price/cost/
commission have since changed) and the OrderItem row is locked for the duration
of the check, per Implementation Plan Section 7.2, to prevent two near-simultaneous
returns against the same line both passing the `sum(returned_qty) <= quantity`
check before either commits.

If no order reference is given, the reversal is estimated using the SKU's current
channel price/cost/commission — the best available basis without a source line.
"""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.product import SKU
from app.models.transaction import OrderItem, Return
from app.models.user import User
from app.schemas.transaction import ReturnCreate
from app.services.pricing import calculate_commission, get_current_commission, get_current_price


async def _lock_sku(db: AsyncSession, sku_id: str) -> SKU:
    result = await db.execute(select(SKU).where(SKU.id == sku_id).with_for_update())
    sku = result.scalar_one_or_none()
    if sku is None:
        raise NotFoundError(f"SKU {sku_id} not found")
    return sku


async def _already_returned_qty(db: AsyncSession, order_item_id: str) -> int:
    result = await db.execute(select(Return.quantity).where(Return.order_item_id == order_item_id))
    return sum(result.scalars().all())


async def record_return(db: AsyncSession, payload: ReturnCreate, current_user: User) -> Return:
    sku = await _lock_sku(db, payload.sku_id)

    if payload.order_item_id:
        result = await db.execute(
            select(OrderItem).where(OrderItem.id == payload.order_item_id).with_for_update()
        )
        order_item = result.scalar_one_or_none()
        if order_item is None:
            raise NotFoundError(f"OrderItem {payload.order_item_id} not found")

        already_returned = await _already_returned_qty(db, payload.order_item_id)
        if already_returned + payload.quantity > order_item.quantity:
            raise ConflictError(
                detail=(
                    f"Return rejected: {already_returned} of {order_item.quantity} already "
                    f"returned for this line; cannot return {payload.quantity} more."
                ),
                code="over_return",
            )

        # Pro-rate the original line's exact snapshot values by returned quantity.
        fraction = Decimal(payload.quantity) / Decimal(order_item.quantity)
        revenue_reversed = (order_item.revenue * fraction).quantize(Decimal("0.01"))
        commission_reversed = (order_item.commission_amount_at_sale * fraction).quantize(Decimal("0.01"))
        cost_reversed = (order_item.cost_price_at_sale * payload.quantity).quantize(Decimal("0.01"))
        net_profit_reversed = revenue_reversed - commission_reversed - cost_reversed
    else:
        # No source line — estimate from current price/cost/commission for this channel.
        current_price = await get_current_price(db, payload.sku_id, payload.channel_id)
        if current_price is None:
            raise AppError(
                code="price_not_set",
                detail="Cannot estimate return value: no channel price set for this SKU/channel.",
            )
        commission = await get_current_commission(db, payload.channel_id)
        revenue_reversed = (Decimal(payload.quantity) * current_price.price).quantize(Decimal("0.01"))
        commission_reversed = calculate_commission(commission, revenue_reversed, payload.quantity)
        cost_reversed = (Decimal(payload.quantity) * sku.current_avg_cost).quantize(Decimal("0.01"))
        net_profit_reversed = revenue_reversed - commission_reversed - cost_reversed

    sku.current_stock_qty += payload.quantity

    ret = Return(
        order_item_id=payload.order_item_id,
        sku_id=payload.sku_id,
        channel_id=payload.channel_id,
        quantity=payload.quantity,
        return_date=payload.return_date,
        reason=payload.reason,
        revenue_reversed=revenue_reversed,
        cost_reversed=cost_reversed,
        commission_reversed=commission_reversed,
        net_profit_reversed=net_profit_reversed,
        created_by_id=current_user.id,
    )
    db.add(ret)
    await db.flush()
    return ret
